import puppeteer, { type Browser, type Page } from "puppeteer";

/**
 * A single shared Chromium instance, with pages leased per render.
 *
 * The invoice path launches a fresh browser per PDF, which is fine at webhook
 * volume but not at chat volume — every launch costs ~100-300MB RSS and a
 * 1-3s cold start, so concurrent requests would exhaust memory. Here the
 * browser is launched once and only lightweight pages come and go, with a
 * semaphore capping how many render at a time.
 */

const MAX_CONCURRENT_PAGES = Number(process.env.PDF_MAX_CONCURRENCY ?? 2);
const PAGE_LEASE_TIMEOUT_MS = Number(process.env.PDF_PAGE_TIMEOUT_MS ?? 60_000);

let browserPromise: Promise<Browser> | null = null;
let activePages = 0;
const waiters: Array<() => void> = [];

const launchBrowser = async (): Promise<Browser> => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  // If Chromium dies (OOM, crash) drop the cached promise so the next caller
  // transparently launches a fresh one instead of reusing a dead handle.
  browser.on("disconnected", () => {
    browserPromise = null;
  });

  return browser;
};

const getBrowser = (): Promise<Browser> => {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
};

const acquireSlot = async (): Promise<void> => {
  if (activePages < MAX_CONCURRENT_PAGES) {
    activePages += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  activePages += 1;
};

const releaseSlot = (): void => {
  activePages -= 1;
  const next = waiters.shift();
  if (next) next();
};

/**
 * Lease a page from the shared browser, run `fn`, and always clean up.
 */
export const withPage = async <T>(fn: (page: Page) => Promise<T>): Promise<T> => {
  await acquireSlot();

  let page: Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(PAGE_LEASE_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PAGE_LEASE_TIMEOUT_MS);
    return await fn(page);
  } finally {
    if (page) {
      await page.close().catch((error) => {
        console.error("[browser-pool] Failed to close page:", error);
      });
    }
    releaseSlot();
  }
};

export const closeBrowser = async (): Promise<void> => {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  try {
    const browser = await pending;
    await browser.close();
  } catch (error) {
    console.error("[browser-pool] Failed to close browser:", error);
  }
};
