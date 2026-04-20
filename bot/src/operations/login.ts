/**
 * login.ts — authenticate against https://admin.booking.com
 *
 * ⚠️  Selectors here are best-effort and WILL break when Booking redesigns the
 * login page. Keep a screenshot after every step so you can update the CSS
 * quickly. The dashboard URL pattern (`/hotel/hoteladmin`) is the strongest
 * "we are logged in" signal — prefer it over checking for a button / text.
 */

import type { Page } from "playwright";
import { log } from "../lib/logger";
import { openBrowser, type BrowserBundle } from "../lib/browser";
import { loadCredential, markLoginResult, type DecryptedCredential } from "../lib/credentials";

const LOGIN_URL = "https://account.booking.com/sign-in?op_token=partners";
const DASHBOARD_HOST = "admin.booking.com";

export interface LoginResult {
  bundle: BrowserBundle;
  credential: DecryptedCredential;
}

/**
 * Executes the login flow and returns the authenticated page bundle.
 * Throws on any failure — callers must wrap in try/finally to close the browser.
 */
export async function login(jobId: number, credentialId: number): Promise<LoginResult> {
  const credential = await loadCredential(credentialId);
  await log(jobId, "info", `بدء تسجيل الدخول (${credential.label})`);

  const bundle = await openBrowser(jobId);
  const { page, screenshot } = bundle;

  try {
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await screenshot("01-login-open");

    // Step 1: email. Booking shows a two-step form: email → Next → password.
    await page.fill('input[name="username"]', credential.email);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await screenshot("02-after-email");

    // Step 2: password.
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ timeout: 15_000 });
    await passwordInput.fill(credential.password);
    await page.click('button[type="submit"]');

    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await screenshot("03-after-password");

    // Step 3: optional 2FA. We detect the challenge heuristically.
    if (await page.url().includes("challenge")) {
      await log(jobId, "warn", "Booking طلب تحدّي 2FA — TOTP غير مُنفَّذ بعد");
      throw new Error(
        "Booking طلب التحقق بخطوتين. فعّل TOTP يدويًا أولًا أو أكمل الخطوة من المتصفح.",
      );
    }

    // Confirm we reached the dashboard.
    const currentUrl = page.url();
    if (!currentUrl.includes(DASHBOARD_HOST)) {
      // Sometimes there's a property-picker screen; click the first property card.
      const propertyCards = page.locator("a[href*='hotel/hoteladmin']").first();
      if (await propertyCards.count()) {
        await propertyCards.click();
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await screenshot("04-property-selected");
      }
    }

    if (!page.url().includes(DASHBOARD_HOST)) {
      await screenshot("99-login-failed");
      throw new Error(`لم يصل إلى لوحة التحكم. الرابط الحالي: ${page.url()}`);
    }

    await markLoginResult(credential.id, true);
    await log(jobId, "info", "تم تسجيل الدخول بنجاح");
    return { bundle, credential };
  } catch (err) {
    await markLoginResult(credential.id, false);
    await bundle.close().catch(() => {});
    throw err;
  }
}

/** CLI probe (diagnostic): `ts-node src/operations/login.ts --probe <credentialId>` */
if (require.main === module && process.argv.includes("--probe")) {
  const id = Number(process.argv[process.argv.indexOf("--probe") + 1]);
  if (!Number.isFinite(id)) {
    console.error("usage: ts-node login.ts --probe <credentialId>");
    process.exit(1);
  }
  (async () => {
    try {
      const r = await login(-1, id);
      console.log("✓ Logged in", r.credential.label);
      await r.bundle.close();
    } catch (e) {
      console.error("✗ Login failed:", e);
      process.exit(1);
    }
  })();
}

export async function ensureDashboard(page: Page): Promise<void> {
  if (!page.url().includes(DASHBOARD_HOST)) {
    throw new Error(`Not on Extranet dashboard (url=${page.url()})`);
  }
}
