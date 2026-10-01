#!/usr/bin/env node
// Static server for the production build in `dist/`.
//
// Mirrors the Cloudflare Workers static-assets setup in wrangler.jsonc closely
// enough for the release browser suite:
// - serves files from `dist/` with a fixed MIME map;
// - falls back to `index.html` (HTTP 200) for unknown paths, like
//   `not_found_handling: "single-page-application"`;
// - applies every rule parsed from `dist/_headers` (Cloudflare `_headers`
//   syntax) by request path.
//
// This file defines no security header values of its own. `dist/_headers` is
// the only source of those values (Req 8.4).
//
// `--unrouted-ms <n>` emulates the window right after `wrangler deploy` returns
// in which Cloudflare's edge does not route the hostname to the new Worker yet:
// for the first <n> ms every request gets a bare 404 without the app shell or
// any `_headers` values. Observed on the first deploy of 9d15c68 (2026-10-01);
// the live smoke check must wait this out instead of failing. Default 0 (off).
//
// Usage: node tools/serve-dist.mjs [--port 4173] [--host 127.0.0.1] [--dir dist] [--unrouted-ms 0]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
});
const DEFAULT_MIME = 'application/octet-stream';

/** Files Cloudflare treats as configuration and never serves as assets. */
const CONFIG_FILES = new Set(['/_headers', '/_redirects']);

/**
 * Parses a Cloudflare `_headers` file.
 * Unindented lines are URL patterns; indented `Name: value` lines attach a
 * header to the latest pattern; indented `! Name` lines detach a header set by
 * an earlier matching rule. `#` starts a comment line.
 * @returns {{ pattern: string, regex: RegExp, set: [string, string][], detach: string[] }[]}
 */
export function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;
    const indented = /^\s/.test(line);
    if (!indented) {
      current = { pattern: trimmed, regex: patternToRegex(trimmed), set: [], detach: [] };
      rules.push(current);
      return;
    }
    if (!current) throw new Error(`_headers line ${index + 1}: header line before any URL pattern`);
    if (trimmed.startsWith('!')) {
      const name = trimmed.slice(1).trim();
      if (!name) throw new Error(`_headers line ${index + 1}: empty detach header name`);
      current.detach.push(name);
      return;
    }
    const colon = trimmed.indexOf(':');
    if (colon <= 0) throw new Error(`_headers line ${index + 1}: expected "Name: value"`);
    const name = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
      throw new Error(`_headers line ${index + 1}: invalid header name "${name}"`);
    }
    current.set.push([name, value]);
  });
  return rules;
}

/** `*` matches any run of characters (splat); `:name` matches one path segment. */
function patternToRegex(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') { source += '.*'; continue; }
    if (char === ':') {
      const match = /^:[A-Za-z]\w*/.exec(pattern.slice(i));
      if (match) { source += '[^/]+'; i += match[0].length - 1; continue; }
    }
    source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/**
 * Headers for a request, following Cloudflare's merge rules: every matching
 * rule applies in file order, repeated header names are joined with ", ",
 * and `! Name` removes a header set by an earlier matching rule.
 * Absolute-URL patterns are matched against `origin + pathname`.
 * @returns {Map<string, { name: string, value: string }>} keyed by lower-case name
 */
export function headersFor(rules, pathname, origin = '') {
  const result = new Map();
  for (const rule of rules) {
    const target = rule.pattern.includes('://') ? origin + pathname : pathname;
    if (!rule.regex.test(target)) continue;
    for (const name of rule.detach) result.delete(name.toLowerCase());
    for (const [name, value] of rule.set) {
      const key = name.toLowerCase();
      const existing = result.get(key);
      result.set(key, existing ? { name: existing.name, value: `${existing.value}, ${value}` } : { name, value });
    }
  }
  return result;
}

export function mimeTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? DEFAULT_MIME;
}

/**
 * Maps a decoded URL pathname to a file inside `root`, or null when the path
 * escapes `root`, is a config file, or does not exist as a regular file.
 */
export async function resolveAsset(root, pathname) {
  if (pathname.includes('\0') || CONFIG_FILES.has(pathname)) return null;
  const candidate = path.resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  for (const file of [candidate, path.join(candidate, 'index.html')]) {
    if (file !== candidate && !pathname.endsWith('/')) continue;
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      // Not found; try the next candidate.
    }
  }
  return null;
}

export function createDistServer({ root, rules, unroutedMs = 0 }) {
  const resolvedRoot = path.resolve(root);
  const fallback = path.join(resolvedRoot, 'index.html');
  const routedAt = Date.now() + unroutedMs;
  return createServer(async (request, response) => {
    try {
      if (Date.now() < routedAt) {
        response.writeHead(404, { 'Content-Type': MIME_TYPES['.txt'] }).end('Not found: hostname not routed yet\n');
        return;
      }
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        response.writeHead(400, { 'Content-Type': MIME_TYPES['.txt'] }).end('Bad request\n');
        return;
      }
      for (const { name, value } of headersFor(rules, url.pathname, url.origin).values()) {
        response.setHeader(name, value);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        response.writeHead(405, { 'Content-Type': MIME_TYPES['.txt'] }).end('Method not allowed\n');
        return;
      }
      const file = (await resolveAsset(resolvedRoot, pathname)) ?? fallback;
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': mimeTypeFor(file), 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      console.error(`serve-dist: ${request.method} ${request.url}:`, error);
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': MIME_TYPES['.txt'] });
      response.end('Internal server error\n');
    }
  });
}

function parseArgs(argv) {
  const options = { port: 4173, host: '127.0.0.1', dir: fileURLToPath(new URL('../dist/', import.meta.url)), unroutedMs: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--port' && value) { options.port = Number(value); i += 1; }
    else if (flag === '--host' && value) { options.host = value; i += 1; }
    else if (flag === '--dir' && value) { options.dir = path.resolve(value); i += 1; }
    else if (flag === '--unrouted-ms' && value) { options.unroutedMs = Number(value); i += 1; }
    else throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid --port: ${options.port}`);
  }
  if (!Number.isInteger(options.unroutedMs) || options.unroutedMs < 0) {
    throw new Error(`Invalid --unrouted-ms: ${options.unroutedMs}`);
  }
  return options;
}

function main() {
  const { port, host, dir, unroutedMs } = parseArgs(process.argv.slice(2));
  const headersPath = path.join(dir, '_headers');
  if (!existsSync(path.join(dir, 'index.html'))) {
    console.error(`serve-dist: ${path.join(dir, 'index.html')} not found. Run "pnpm build" first.`);
    process.exit(1);
  }
  if (!existsSync(headersPath)) {
    console.error(`serve-dist: ${headersPath} not found. The build must include the Cloudflare _headers file.`);
    process.exit(1);
  }
  const rules = parseHeadersFile(readFileSync(headersPath, 'utf8'));
  const server = createDistServer({ root: dir, rules, unroutedMs });
  server.listen(port, host, () => {
    const unrouted = unroutedMs > 0 ? `, answering 404 for the first ${unroutedMs} ms` : '';
    console.log(`serve-dist: serving ${dir} at http://${host}:${port} with ${rules.length} _headers rule(s)${unrouted}`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
