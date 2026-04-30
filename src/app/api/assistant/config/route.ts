import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * Admin-only configuration surface for the staff assistant.
 *
 * Why this lives separate from `/api/whatsapp/bot/config`:
 *   • The LLM provider/key is shared (single source of truth — the WhatsApp
 *     config), but the *budget* and the *enabled flag* are per-feature so
 *     a runaway customer bot doesn't kill the staff assistant and vice-versa.
 *   • Permissions are different (`assistant:configure` vs `whatsapp.bot:configure`).
 */

export async function GET() {
  try {
    await requirePermission("assistant:configure");
    const cfg = await prisma.whatsAppConfig.findUnique({
      where: { id: 1 },
      select: {
        assistantEnabled: true,
        assistantDailyBudgetUsd: true,
        assistantCostTodayUsd: true,
        assistantCostResetAt: true,
        assistantWaEnabled: true,
        assistantWaSessionMinutes: true,
        assistantWaMaxSessionHours: true,
        botLlmProvider: true,
        botLlmModel: true,
        botLlmApiKeyEnc: true,
      },
    });
    if (!cfg) {
      return NextResponse.json({
        assistantEnabled: false,
        assistantDailyBudgetUsd: 2,
        assistantCostTodayUsd: 0,
        assistantCostResetAt: null,
        assistantWaEnabled: false,
        assistantWaSessionMinutes: 30,
        assistantWaMaxSessionHours: 8,
        provider: null,
        model: null,
        hasApiKey: false,
      });
    }
    return NextResponse.json({
      assistantEnabled: cfg.assistantEnabled,
      assistantDailyBudgetUsd: Number(cfg.assistantDailyBudgetUsd),
      assistantCostTodayUsd: Number(cfg.assistantCostTodayUsd),
      assistantCostResetAt: cfg.assistantCostResetAt,
      assistantWaEnabled: cfg.assistantWaEnabled,
      assistantWaSessionMinutes: cfg.assistantWaSessionMinutes,
      assistantWaMaxSessionHours: cfg.assistantWaMaxSessionHours,
      provider: cfg.botLlmProvider,
      model: cfg.botLlmModel,
      hasApiKey: Boolean(cfg.botLlmApiKeyEnc),
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/config", e);
    return NextResponse.json({ error: "فشل تحميل الإعدادات" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requirePermission("assistant:configure");
    const body = (await request.json().catch(() => ({}))) as {
      assistantEnabled?: boolean;
      assistantDailyBudgetUsd?: number;
      assistantWaEnabled?: boolean;
      assistantWaSessionMinutes?: number;
      assistantWaMaxSessionHours?: number;
    };

    const data: Record<string, unknown> = {};
    if (typeof body.assistantEnabled === "boolean") {
      data.assistantEnabled = body.assistantEnabled;
    }
    if (typeof body.assistantDailyBudgetUsd === "number" && body.assistantDailyBudgetUsd >= 0) {
      data.assistantDailyBudgetUsd = body.assistantDailyBudgetUsd;
    }
    if (typeof body.assistantWaEnabled === "boolean") {
      data.assistantWaEnabled = body.assistantWaEnabled;
    }
    if (
      typeof body.assistantWaSessionMinutes === "number" &&
      body.assistantWaSessionMinutes >= 1 &&
      body.assistantWaSessionMinutes <= 240
    ) {
      data.assistantWaSessionMinutes = Math.floor(body.assistantWaSessionMinutes);
    }
    if (
      typeof body.assistantWaMaxSessionHours === "number" &&
      body.assistantWaMaxSessionHours >= 1 &&
      body.assistantWaMaxSessionHours <= 24
    ) {
      data.assistantWaMaxSessionHours = Math.floor(body.assistantWaMaxSessionHours);
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد قيم للحفظ" }, { status: 400 });
    }

    await prisma.whatsAppConfig.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("PUT /api/assistant/config", e);
    return NextResponse.json({ error: "فشل حفظ الإعدادات" }, { status: 500 });
  }
}
