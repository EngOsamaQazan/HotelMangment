import "server-only";
import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * Locate a Chromium-based browser binary on the host. Tried, in order:
 *   1. PUPPETEER_EXECUTABLE_PATH (env override — useful inside containers)
 *   2. Common Windows paths for Chrome and Edge
 *   3. macOS /Applications paths
 *   4. Linux apt-style paths
 *
 * Returns the first existing path. Throws a friendly Arabic error if none
 * is found so the operator knows what to install.
 */
export function detectBrowserExecutable(): string {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = [
    // Windows — Edge ships with every modern Windows 10/11 install.
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/snap/bin/chromium",
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  throw new Error(
    "لم نعثر على متصفح Chromium/Edge على هذا النظام. " +
      "ثبّت Chrome أو Edge، أو ضع المسار في متغيّر PUPPETEER_EXECUTABLE_PATH.",
  );
}

let cachedBrowser: Browser | null = null;
let launchPromise: Promise<Browser> | null = null;

/**
 * Get a long-lived headless browser instance, reusing it across requests
 * so each PDF render doesn't pay the ~1s launch cost. The browser is
 * auto-recovered if it ever dies (e.g. because the system woke up from
 * sleep with the process detached).
 */
export async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.connected) return cachedBrowser;
  if (launchPromise) return launchPromise;

  const executablePath = detectBrowserExecutable();
  launchPromise = puppeteer
    .launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=medium",
      ],
    })
    .then((b) => {
      cachedBrowser = b;
      b.on("disconnected", () => {
        if (cachedBrowser === b) cachedBrowser = null;
      });
      return b;
    })
    .finally(() => {
      launchPromise = null;
    });
  return launchPromise;
}

/**
 * Render an HTML string to a PDF Buffer. The browser is reused across
 * calls; we only spin up a *page* per render. A4 size matching the
 * contract layout (`@page { size: A4 }`).
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // `setContent` waits for the load event, which is enough for our
    // self-contained HTML (Google Fonts loaded via <link>). Adding
    // 'networkidle0' would be more thorough but adds ~500ms — overkill
    // for a contract document with a single image.
    await page.setContent(html, { waitUntil: ["load", "networkidle2"] });
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "14mm", right: "14mm" },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}
