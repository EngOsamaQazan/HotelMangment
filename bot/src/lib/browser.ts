import path from "node:path";
import fs from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface BrowserBundle {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  screenshot: (name: string) => Promise<string | null>;
  close: () => Promise<void>;
}

/**
 * Opens a new Chromium context for an Extranet session.
 * - Persistent storage is NOT used by default; each job starts fresh so
 *   credentials are re-validated and we always have an audit trail.
 * - Screenshots are saved under BOOKING_SCREENSHOT_DIR (if set) as
 *   `job-<id>/<step>.png` and referenced from the sync log.
 */
export async function openBrowser(
  jobId: number,
  opts?: { headless?: boolean; slowMo?: number },
): Promise<BrowserBundle> {
  const headless =
    opts?.headless ?? (process.env.BOOKING_HEADLESS ?? "true").toLowerCase() !== "false";
  const slowMo = opts?.slowMo ?? Number(process.env.BOOKING_SLOWMO_MS || "0") || 0;

  const browser = await chromium.launch({
    headless,
    slowMo,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Amman",
    // Extranet occasionally refuses very modern UA strings; pin to something common.
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  const baseDir = process.env.BOOKING_SCREENSHOT_DIR;
  const jobDir = baseDir ? path.join(baseDir, `job-${jobId}`) : null;
  if (jobDir) {
    await fs.mkdir(jobDir, { recursive: true });
  }

  const screenshot = async (name: string) => {
    if (!jobDir) return null;
    const file = path.join(jobDir, `${Date.now()}-${name.replace(/[^a-z0-9_-]/gi, "_")}.png`);
    try {
      await page.screenshot({ path: file, fullPage: true });
      return file;
    } catch {
      return null;
    }
  };

  const close = async () => {
    try {
      await context.close();
    } finally {
      await browser.close();
    }
  };

  return { browser, context, page, screenshot, close };
}
