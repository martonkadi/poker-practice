#!/usr/bin/env node
// Release artifact checks for the production build in `dist/`.
//
// Fails with a named reason when:
// - entry-size:     the entry chunk referenced by index.html is over 500,000 bytes (Req 9.5-9.7);
// - cloud-code:     a JavaScript file contains "supabase" or a removed cloud module identifier (Req 5.1);
// - test-hook:      a test fixture hook or test-only file is present in the build (Req 10.5);
// - inline-markup:  index.html contains an inline <script>, <style> or style attribute (CSP, Req 8.2);
// - headers:        dist/_headers lacks a required header, has a different value,
//                   or the CSP contains a forbidden token (Req 8.1-8.4, 8.7).
// The measured entry chunk size is always printed (Req 9.7).
//
// Usage: node tools/check-dist.mjs [--dir dist]
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { headersFor, parseHeadersFile } from './serve-dist.mjs';

export const ENTRY_LIMIT_BYTES = 500_000;

/** Required header values. These are checks against dist/_headers, not header definitions. */
export const REQUIRED_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});
/** CSP directives that must be present with exactly these sources (Req 8.1). */
export const REQUIRED_CSP_DIRECTIVES = Object.freeze({
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self'",
  'worker-src': "'self'",
  'connect-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'self'"
});
/** Only these source expressions may appear in any CSP directive (Req 8.2: no origin other than 'self'). */
const ALLOWED_CSP_SOURCES = new Set(["'self'", "'none'"]);
const FORBIDDEN_CSP_TOKENS = ["'unsafe-inline'", "'unsafe-eval'", 'blob:', 'data:'];

/**
 * Identifiers from the removed `apps/web/src/cloud.ts` that survive minification
 * (string literals and property names), checked case-insensitively alongside "supabase".
 */
export const CLOUD_MARKERS = Object.freeze([
  'supabase',
  'signInWithOAuth',
  'detectSessionInUrl',
  'start_sync_session',
  'sync_session_batch',
  'delete-account',
  'poker-device-id',
  'poker-return-to',
  '/auth/callback'
]);

/**
 * Markers of test-only code. The e2e suite injects Worker/IndexedDB overrides through
 * Playwright `page.addInitScript`; none of these may reach the production bundle.
 */
export const TEST_HOOK_MARKERS = Object.freeze([
  '__POKER_TEST',
  'addInitScript',
  '@playwright/test',
  'strongBotFixture',
  'terminatedWorkers',
  'fake-indexeddb',
  'fast-check',
  'vitest',
  'happy-dom',
  'tests/e2e'
]);
const TEST_FILE_PATTERN = /(^|\/)(tests?|__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;

/** Representative request paths whose effective headers must match (HTML routes, fallback). */
const HTML_PATHS = ['/', '/play', '/history', '/settings', '/about', '/review/unknown-id', '/no-such-page'];

async function listFiles(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await walk(root);
  return files;
}

const toUrlPath = (root, file) => `/${path.relative(root, file).split(path.sep).join('/')}`;

/** Returns the `src` of every `<script type="module" src="...">` in the HTML. */
export function moduleScriptSources(html) {
  const sources = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = match[1];
    if (!/\btype\s*=\s*["']?module["']?/i.test(attrs)) continue;
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    if (src) sources.push(src[1] ?? src[2] ?? src[3]);
  }
  return sources;
}

/** Reasons the HTML contains inline script or style markup blocked by the CSP. */
export function inlineMarkupProblems(html) {
  const problems = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const hasSrc = /\bsrc\s*=/i.test(match[1]);
    if (!hasSrc) problems.push('inline <script> without src');
    else if (match[2].trim() !== '') problems.push('<script src> with inline content');
  }
  if (/<style\b/i.test(html)) problems.push('inline <style> element');
  if (/<[a-z][^>]*\sstyle\s*=/i.test(html)) problems.push('inline style="" attribute');
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) problems.push('inline event handler attribute');
  return problems;
}

/** Parses a CSP value into a map of directive name to source list. */
export function parseCsp(value) {
  const directives = new Map();
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    const key = name.toLowerCase();
    if (directives.has(key)) directives.set(key, [...directives.get(key), ...sources, '<duplicate>']);
    else directives.set(key, sources);
  }
  return directives;
}

/** Problems with one CSP value against Req 8.1 and 8.2. */
export function cspProblems(value) {
  const problems = [];
  const directives = parseCsp(value);
  for (const [name, expected] of Object.entries(REQUIRED_CSP_DIRECTIVES)) {
    const sources = directives.get(name);
    if (!sources) problems.push(`CSP is missing directive "${name} ${expected}"`);
    else if (sources.join(' ') !== expected) {
      problems.push(`CSP directive "${name}" is "${sources.join(' ')}", expected "${expected}"`);
    }
  }
  for (const [name, sources] of directives) {
    for (const source of sources) {
      const lower = source.toLowerCase();
      if (source === '<duplicate>') problems.push(`CSP directive "${name}" is defined more than once`);
      else if (FORBIDDEN_CSP_TOKENS.includes(lower)) problems.push(`CSP directive "${name}" contains forbidden token ${source}`);
      else if (lower.includes('*')) problems.push(`CSP directive "${name}" contains wildcard source ${source}`);
      else if (!ALLOWED_CSP_SOURCES.has(lower)) problems.push(`CSP directive "${name}" contains source ${source} other than 'self'`);
    }
  }
  return problems;
}

/** Problems with the effective headers for one request path. */
function headerProblemsFor(rules, urlPath, { html }) {
  const problems = [];
  const headers = headersFor(rules, urlPath);
  for (const [name, expected] of Object.entries(REQUIRED_HEADERS)) {
    const actual = headers.get(name.toLowerCase());
    if (!actual) problems.push(`${urlPath}: missing header ${name} (expected "${expected}")`);
    else if (actual.value !== expected) problems.push(`${urlPath}: header ${name} is "${actual.value}", expected "${expected}"`);
  }
  const csp = headers.get('content-security-policy');
  if (!csp) {
    if (html) problems.push(`${urlPath}: missing header Content-Security-Policy`);
  } else {
    for (const problem of cspProblems(csp.value)) problems.push(`${urlPath}: ${problem}`);
  }
  return problems;
}

/**
 * Runs every artifact check on a build directory.
 * @returns {Promise<{ entry: { file: string, bytes: number } | null, failures: { check: string, message: string }[] }>}
 */
export async function checkDist(dir) {
  const root = path.resolve(dir);
  const failures = [];
  const fail = (check, message) => failures.push({ check, message });
  let entry = null;

  let files = [];
  try {
    files = await listFiles(root);
  } catch (error) {
    fail('dist', `cannot read ${root}: ${error.message}`);
    return { entry, failures };
  }

  // index.html: entry chunk and inline markup.
  let html = null;
  try {
    html = await readFile(path.join(root, 'index.html'), 'utf8');
  } catch {
    fail('entry-size', `${path.join(root, 'index.html')} not found`);
  }
  if (html !== null) {
    const sources = moduleScriptSources(html);
    if (sources.length === 0) {
      fail('entry-size', 'index.html has no <script type="module" src> entry script');
    } else {
      const src = sources[0];
      const relative = src.replace(/^\.?\//, '').split(/[?#]/)[0];
      const file = path.resolve(root, relative);
      if (/^[a-z]+:\/\//i.test(src) || !file.startsWith(root + path.sep)) {
        fail('entry-size', `entry script ${src} is not a same-origin file inside the build`);
      } else {
        try {
          const bytes = (await stat(file)).size;
          entry = { file: toUrlPath(root, file), bytes };
          if (bytes > ENTRY_LIMIT_BYTES) {
            fail('entry-size', `entry chunk ${entry.file} is ${bytes.toLocaleString('en-US')} bytes, over the ${ENTRY_LIMIT_BYTES.toLocaleString('en-US')}-byte limit`);
          }
        } catch {
          fail('entry-size', `entry script ${src} referenced by index.html does not exist`);
        }
      }
    }
    for (const problem of inlineMarkupProblems(html)) fail('inline-markup', `index.html: ${problem}`);
  }

  // JavaScript and HTML content: cloud code and test hooks.
  for (const file of files) {
    const urlPath = toUrlPath(root, file);
    if (TEST_FILE_PATTERN.test(urlPath)) fail('test-hook', `test-only file ${urlPath} is in the build`);
    const ext = path.extname(file).toLowerCase();
    if (!['.js', '.mjs', '.cjs', '.html', '.map'].includes(ext)) continue;
    const text = (await readFile(file, 'utf8')).toLowerCase();
    if (ext !== '.html') {
      for (const marker of CLOUD_MARKERS) {
        if (text.includes(marker.toLowerCase())) fail('cloud-code', `${urlPath} contains "${marker}"`);
      }
    }
    for (const marker of TEST_HOOK_MARKERS) {
      if (text.includes(marker.toLowerCase())) fail('test-hook', `${urlPath} contains test hook marker "${marker}"`);
    }
  }

  // _headers: required values on every response, CSP on HTML responses.
  let rules = null;
  try {
    rules = parseHeadersFile(await readFile(path.join(root, '_headers'), 'utf8'));
  } catch (error) {
    fail('headers', error.code === 'ENOENT' ? `${path.join(root, '_headers')} not found` : `_headers: ${error.message}`);
  }
  if (rules) {
    const seen = new Set();
    const report = (problem) => { if (!seen.has(problem)) { seen.add(problem); fail('headers', problem); } };
    for (const urlPath of HTML_PATHS) headerProblemsFor(rules, urlPath, { html: true }).forEach(report);
    for (const file of files) {
      const urlPath = toUrlPath(root, file);
      if (urlPath === '/_headers' || urlPath === '/_redirects') continue;
      headerProblemsFor(rules, urlPath, { html: urlPath.endsWith('.html') }).forEach(report);
    }
  }

  return { entry, failures };
}

function parseArgs(argv) {
  let dir = fileURLToPath(new URL('../dist/', import.meta.url));
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir' && argv[i + 1]) { dir = path.resolve(argv[i + 1]); i += 1; }
    else throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
  }
  return { dir };
}

async function main() {
  const { dir } = parseArgs(process.argv.slice(2));
  const { entry, failures } = await checkDist(dir);
  if (entry) {
    console.log(`check:dist: entry chunk ${entry.file} ${entry.bytes.toLocaleString('en-US')} bytes (limit ${ENTRY_LIMIT_BYTES.toLocaleString('en-US')})`);
  }
  for (const { check, message } of failures) console.error(`check:dist: FAIL [${check}] ${message}`);
  if (failures.length > 0) {
    console.error(`check:dist: ${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log('check:dist: PASS entry-size, cloud-code, test-hook, inline-markup, headers');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`check:dist: ${error.stack ?? error}`);
    process.exit(1);
  });
}
