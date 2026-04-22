import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/booking/encryption";
import {
  setRepoSecrets,
  dispatchWorkflow,
  getLatestWorkflowRun,
} from "@/lib/github/secrets";

/**
 * POST /api/whatsapp/deploy
 *
 * One-click "publish to production" button. It:
 *   1. reads the current (encrypted) WhatsAppConfig singleton
 *   2. pushes the 7 relevant values as GitHub Actions repository secrets
 *      (Meta app + WABA + phone + tokens + API version)
 *   3. triggers the `deploy.yml` workflow via workflow_dispatch
 *
 * The workflow itself ((.github/workflows/deploy.yml -> step 4b) picks the
 * secrets up, writes them into /opt/mafhotel.com/shared/.env, and runs
 * scripts/seed-whatsapp-config.ts to upsert the production DB row — so the
 * user never has to touch a terminal to rotate a token.
 */
export async function POST() {
  try {
    try {
      await requirePermission("settings.whatsapp:deploy");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    if (!process.env.GITHUB_PAT || !process.env.GITHUB_REPO) {
      return NextResponse.json(
        {
          error:
            "GitHub integration is not configured. Set GITHUB_PAT and GITHUB_REPO in the server env.",
        },
        { status: 400 },
      );
    }

    const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
    if (!cfg) {
      return NextResponse.json(
        { error: "لا توجد إعدادات WhatsApp محفوظة بعد." },
        { status: 400 },
      );
    }

    const accessToken = cfg.accessTokenEnc ? decryptSecret(cfg.accessTokenEnc) : "";
    const appSecret = cfg.appSecretEnc ? decryptSecret(cfg.appSecretEnc) : "";

    // Collect the exact keys the deploy workflow forwards. Missing values
    // are simply skipped in setRepoSecrets, so a partial save still works.
    const payload: Record<string, string | null> = {
      META_APP_ID: cfg.appId,
      META_APP_SECRET: appSecret || null,
      WHATSAPP_WABA_ID: cfg.wabaId,
      WHATSAPP_PHONE_NUMBER_ID: cfg.phoneNumberId,
      WHATSAPP_ACCESS_TOKEN: accessToken || null,
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: cfg.webhookVerifyToken,
      WHATSAPP_API_VERSION: cfg.apiVersion || "v21.0",
    };

    const mustHave = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];
    for (const k of mustHave) {
      if (!payload[k]) {
        return NextResponse.json(
          { error: `الحقل ${k} مطلوب قبل النشر إلى الإنتاج.` },
          { status: 400 },
        );
      }
    }

    const result = await setRepoSecrets(payload);
    await dispatchWorkflow("deploy.yml", "main");

    // Give GitHub a beat to register the dispatched run, then surface its URL.
    await new Promise((r) => setTimeout(r, 1500));
    const run = await getLatestWorkflowRun("deploy.yml").catch(() => null);

    return NextResponse.json({
      ok: true,
      updatedSecrets: result.updated,
      skippedSecrets: result.skipped,
      workflowRun: run
        ? { id: run.id, url: run.html_url, status: run.status }
        : null,
    });
  } catch (err) {
    console.error("[POST /api/whatsapp/deploy]", err);
    const message =
      err instanceof Error ? err.message : "تعذّر النشر إلى الإنتاج.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
