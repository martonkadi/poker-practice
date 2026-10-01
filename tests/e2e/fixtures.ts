// Shared Playwright fixtures for the release browser suite (Req 8.6, 8.7).
//
// Every test that imports `test` from this module fails if any page in its
// browser context reports a Content-Security-Policy violation, either as a
// `securitypolicyviolation` DOM event or as a browser console message.
//
// Detection is installed with `context.addInitScript` and `exposeBinding`, so
// it is test tooling only: nothing is added to the production bundle, and init
// scripts are not subject to the page CSP. Test-specific Worker/IndexedDB
// overrides stay in the individual tests through `page.addInitScript`.
import { test as base, expect, type BrowserContext, type ConsoleMessage } from '@playwright/test';

export interface SecurityViolation {
  source: 'event' | 'console';
  /** Page URL where the violation was reported. */
  pageUrl: string;
  /** Blocked resource (URL, `inline`, `eval`, ...) when known. */
  blockedURI?: string;
  /** Violated CSP directive when known. */
  directive?: string;
  /** Raw console text for console-detected violations. */
  text?: string;
}

/**
 * Console messages that browsers emit when a security policy blocks something.
 * Chromium/WebKit: "Refused to load/execute/apply/create/connect ...".
 * Firefox: "Content-Security-Policy: The page's settings blocked ...".
 */
const CONSOLE_PATTERN = /Content[- ]Security[- ]Policy|Refused to (load|execute|apply|create|connect|frame|evaluate)/i;

export function isSecurityConsoleMessage(text: string): boolean {
  return CONSOLE_PATTERN.test(text);
}

export function formatViolation(v: SecurityViolation): string {
  if (v.source === 'event') {
    return `CSP violation: blocked ${v.blockedURI || '(unknown resource)'} by "${v.directive || '(unknown directive)'}" on ${v.pageUrl}`;
  }
  return `CSP console message on ${v.pageUrl}: ${v.text ?? ''}`;
}

const BINDING = '__e2eReportSecurityViolation';

async function watchContext(context: BrowserContext, violations: SecurityViolation[]): Promise<void> {
  await context.exposeBinding(BINDING, ({ page }, detail: { blockedURI: string; directive: string; documentURI: string }) => {
    violations.push({ source: 'event', pageUrl: detail.documentURI || page?.url() || '(unknown page)', blockedURI: detail.blockedURI, directive: detail.directive });
  });
  await context.addInitScript(binding => {
    document.addEventListener('securitypolicyviolation', event => {
      const report = (window as unknown as Record<string, ((d: unknown) => void) | undefined>)[binding];
      report?.({ blockedURI: event.blockedURI, directive: event.effectiveDirective || event.violatedDirective, documentURI: event.documentURI });
    });
  }, BINDING);
  const onConsole = (message: ConsoleMessage) => {
    const text = message.text();
    if (!isSecurityConsoleMessage(text)) return;
    violations.push({ source: 'console', pageUrl: message.page()?.url() ?? message.location().url ?? '(unknown page)', text });
  };
  context.on('console', onConsole);
}

export const test = base.extend<{ securityViolations: SecurityViolation[] }>({
  securityViolations: [async ({ context }, use) => {
    const violations: SecurityViolation[] = [];
    await watchContext(context, violations);
    await use(violations);
    if (violations.length > 0) {
      throw new Error(`${violations.length} security policy violation(s):\n${violations.map(formatViolation).join('\n')}`);
    }
  }, { auto: true }]
});

export { expect };
export type { Page } from '@playwright/test';
