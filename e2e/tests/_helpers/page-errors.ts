import type { Page } from "@playwright/test";

export interface PageErrorRecord {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ url: string; status: number; method: string }>;
}

/**
 * Attach listeners that collect anything looking like a runtime
 * failure: console.error(), uncaught exceptions, and HTTP responses
 * with a 4xx/5xx status (except the ones we explicitly ignore).
 *
 * Returns the live record — read it after page navigation to assert.
 */
export function trackPageProblems(page: Page): PageErrorRecord {
  const record: PageErrorRecord = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
  };

  // Noise we never want to fail on:
  //  - HMR / dev-only websocket pings
  //  - Next.js Refresh chunk fetches (Turbopack dev rotates URLs)
  //  - 404 on favicon / source maps
  //  - chrome-extension:// (browser noise)
  //  - Google Maps SDK telemetry (gen_204 / CSP feature detection) and
  //    the mapsjs internal $rpc calls (e.g. GetViewportInfo), both of
  //    which intermittently fail CORS preflight from localhost
  const ignorePattern =
    /(\.map$|\/_next\/static\/development\/|\/__nextjs_|hot-reloader|favicon\.|chrome-extension:|\.well-known\/|maps\.googleapis\.com\/.*gen_204|maps\.google\.com\/.*gen_204|maps\.googleapis\.com\/\$rpc\/|csp_test=)/i;

  // "Failed to load resource: net::ERR_FAILED" is Chrome's terse
  // follow-up after a CORS / network failure — the response listener
  // already captures the actionable URL, so the bare console message
  // is duplicative noise.
  const noisyConsole =
    /^Failed to load resource\b|net::ERR_(FAILED|ABORTED|BLOCKED_BY_CLIENT)/i;

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (ignorePattern.test(text)) return;
      if (noisyConsole.test(text)) return;
      record.consoleErrors.push(text);
    }
  });

  page.on("pageerror", (err) => {
    record.pageErrors.push(`${err.name}: ${err.message}`);
  });

  page.on("response", (resp) => {
    const url = resp.url();
    if (ignorePattern.test(url)) return;
    const s = resp.status();
    if (s >= 400) {
      record.failedRequests.push({ url, status: s, method: resp.request().method() });
    }
  });

  return record;
}

/** Build a single human-readable failure message. */
export function summariseProblems(record: PageErrorRecord): string | null {
  const parts: string[] = [];
  if (record.pageErrors.length) {
    parts.push(`pageerror x${record.pageErrors.length}:\n  - ${record.pageErrors.join("\n  - ")}`);
  }
  if (record.consoleErrors.length) {
    parts.push(
      `console.error x${record.consoleErrors.length}:\n  - ${record.consoleErrors
        .map((s) => s.slice(0, 2000))
        .join("\n  - ")}`,
    );
  }
  if (record.failedRequests.length) {
    parts.push(
      `failed HTTP x${record.failedRequests.length}:\n  - ${record.failedRequests
        .map((f) => `${f.status} ${f.method} ${f.url}`)
        .join("\n  - ")}`,
    );
  }
  return parts.length ? parts.join("\n\n") : null;
}
