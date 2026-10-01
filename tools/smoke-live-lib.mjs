// Pure helpers for tools/smoke-live.mjs (Req 12). No network, browser or process access,
// so they can be unit tested with `node --test`.
//
// Header expectations are shared with tools/check-dist.mjs. They are checks against the
// served responses, not header definitions: apps/web/public/_headers stays the only
// place header values are defined (Req 8.4).
import { REQUIRED_HEADERS, cspProblems, moduleScriptSources } from './check-dist.mjs';

/** Paths requested directly in the fetch step (Req 12.1). */
export const SMOKE_PATHS = Object.freeze([
  '/',
  '/play',
  '/history',
  '/settings',
  '/about',
  '/review/smoke-unknown-hand-id',
  '/smoke-no-such-page'
]);

export const FETCH_TIMEOUT_MS = 10_000;
export const COMMIT_POLL_TIMEOUT_MS = 90_000;
export const HAND_TIMEOUT_MS = 120_000;
export const MIN_COMMIT_PREFIX = 7;

/** Normalizes a Headers instance, a Map or a plain object into a lowercase-keyed record. */
export function normalizeHeaders(headers) {
  const out = {};
  if (!headers) return out;
  const entries = typeof headers.entries === 'function' && !Array.isArray(headers)
    ? headers.entries()
    : Object.entries(headers);
  for (const [name, value] of entries) out[String(name).toLowerCase()] = String(value);
  return out;
}

/**
 * Problems with the security headers of one response (Req 12.5): every response must carry
 * `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`; HTML responses must
 * also carry the Requirement 8 CSP.
 * @returns {string[]} empty when the headers are acceptable
 */
export function headerProblems(headers, { html }) {
  const record = normalizeHeaders(headers);
  const problems = [];
  for (const [name, expected] of Object.entries(REQUIRED_HEADERS)) {
    const actual = record[name.toLowerCase()];
    if (actual === undefined) problems.push(`missing ${name} (expected "${expected}")`);
    else if (actual.trim() !== expected) problems.push(`${name} is "${actual}", expected "${expected}"`);
  }
  if (html) {
    const csp = record['content-security-policy'];
    if (csp === undefined) problems.push('missing Content-Security-Policy');
    else problems.push(...cspProblems(csp));
  }
  return problems;
}

/** True when a Content-Type value denotes an HTML document. */
export const isHtmlContentType = (value) => /^\s*text\/html\b/i.test(value ?? '');

/**
 * Problems with one directly fetched page (Req 12.1, 12.5): HTTP 200, an HTML document
 * that loads a same-origin entry module script, and the required headers.
 */
export function pageProblems({ status, headers, body, siteOrigin }) {
  const record = normalizeHeaders(headers);
  const problems = [];
  if (status !== 200) problems.push(`status ${status}, expected 200`);
  const contentType = record['content-type'] ?? '';
  if (!isHtmlContentType(contentType)) problems.push(`content-type "${contentType}", expected text/html`);
  const entry = entryScript(body ?? '', siteOrigin);
  if (!entry) problems.push('no same-origin <script type="module" src> entry script');
  problems.push(...headerProblems(record, { html: true }));
  return problems;
}

/** The first same-origin `<script type="module" src>` path in the HTML, or null. */
export function entryScript(html, siteOrigin) {
  for (const src of moduleScriptSources(html)) {
    try {
      const url = new URL(src, `${siteOrigin}/`);
      if (url.origin === siteOrigin) return url.pathname;
    } catch {
      // Unparseable src: not an entry script.
    }
  }
  return null;
}

/** Schemes that never leave the browser and so are not network requests. */
const LOCAL_SCHEMES = new Set(['data:', 'about:']);

/**
 * Origins of requested URLs that differ from the site origin (Req 12.3), sorted and unique.
 * `blob:` URLs are attributed to the origin that created them.
 */
export function foreignOrigins(urls, siteOrigin) {
  const site = new URL(siteOrigin).origin;
  const found = new Set();
  for (const raw of urls) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      found.add(`unparseable URL ${raw}`);
      continue;
    }
    if (LOCAL_SCHEMES.has(url.protocol)) continue;
    const origin = url.origin === 'null' ? url.protocol : url.origin;
    if (origin !== site) found.add(origin);
  }
  return [...found].sort();
}

/** The build commit shown on the About page ("Build commit: <value> · ..."), or null. */
export function parseBuildCommit(text) {
  const match = /Build commit:\s*([^·\n]*?)\s*(?:·|\n|$)/.exec(text ?? '');
  return match && match[1] !== '' ? match[1] : null;
}

/**
 * True when the displayed commit equals the expected SHA or is a prefix of it at least
 * seven characters long (Req 12.4). Comparison ignores case and surrounding whitespace.
 */
export function commitMatches(displayed, expected) {
  if (typeof displayed !== 'string' || typeof expected !== 'string') return false;
  const shown = displayed.trim().toLowerCase();
  const sha = expected.trim().toLowerCase();
  if (shown === '' || sha === '') return false;
  if (shown === sha) return true;
  return shown.length >= MIN_COMMIT_PREFIX && sha.startsWith(shown);
}

/** The result amount from the Review outcome line ("... · Result: +100 chips · ..."), or null. */
export function parseReviewResult(text) {
  const match = /Result:\s*([^·\n]+?)\s*(?:·|\n|$)/.exec(text ?? '');
  return match ? match[1] : null;
}

/** Exit status for a run: 0 only when at least one step ran and every step passed (Req 12.6, 12.7). */
export function exitCode(results) {
  return Array.isArray(results) && results.length > 0 && results.every((r) => r.pass === true) ? 0 : 1;
}

/** One pass/fail line with the step, requested URL, expected and observed values (Req 12.7). */
export function formatResult({ step, url, expected, observed, pass }) {
  const flat = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  return `${pass ? 'PASS' : 'FAIL'} ${step} | url: ${url} | expected: ${flat(expected)} | observed: ${flat(observed)}`;
}

/**
 * Parses `--url <url> --commit <sha>` (also `--flag=value`).
 * @returns {{ origin: string, commit: string }}
 */
export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    const eq = /^--(url|commit)=(.*)$/.exec(arg);
    if (eq) { options[eq[1]] = eq[2]; continue; }
    if ((arg === '--url' || arg === '--commit') && argv[i + 1] !== undefined) {
      options[arg.slice(2)] = argv[i + 1];
      i += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  if (!options.url) throw new Error('Missing --url <https://site>');
  if (!options.commit) throw new Error('Missing --commit <sha>');
  let url;
  try {
    url = new URL(options.url);
  } catch {
    throw new Error(`Invalid --url: ${options.url}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`--url must be http(s): ${options.url}`);
  const commit = options.commit.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(commit)) throw new Error(`--commit must be 7 to 40 hex characters: ${options.commit}`);
  return { origin: url.origin, commit };
}
