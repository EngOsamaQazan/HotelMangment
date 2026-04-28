import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  getConversationAnalytics,
  getPricingAnalytics,
  getTemplateAnalytics,
  isWhatsAppApiError,
  type ConversationDataPoint,
  type PricingDataPoint,
} from "@/lib/whatsapp/client";
import { getPriceForCategoryCountry } from "@/lib/whatsapp/pricing";

/**
 * GET /api/whatsapp/usage?days=30
 *
 * Returns a unified usage + cost report. We always include the *local* counts
 * (computed from `whatsapp_messages`) for instant feedback even when Meta is
 * temporarily unreachable, and try to enrich with authoritative numbers from
 * the WhatsApp Cloud Analytics API.
 */
export async function GET(req: Request) {
  try {
    await requirePermission("settings.whatsapp:view");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;

  const endMs = Date.now();
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  const startSec = Math.floor(startMs / 1000);
  const endSec = Math.floor(endMs / 1000);

  // ── 1) Local (always-available) aggregation ────────────────────────────
  const [outboundCounts, byCategoryRows, byTemplateRows, deliveryRow, lastMsg] =
    await Promise.all([
      prisma.whatsAppMessage.count({
        where: { direction: "outbound", createdAt: { gte: new Date(startMs) } },
      }),
      prisma.whatsAppMessage.groupBy({
        by: ["pricingCategory"],
        where: { direction: "outbound", createdAt: { gte: new Date(startMs) } },
        _count: { _all: true },
      }),
      prisma.whatsAppMessage.groupBy({
        by: ["templateName"],
        where: {
          direction: "outbound",
          templateName: { not: null },
          createdAt: { gte: new Date(startMs) },
        },
        _count: { _all: true },
      }),
      prisma.whatsAppMessage.aggregate({
        where: { direction: "outbound", createdAt: { gte: new Date(startMs) } },
        _count: { _all: true },
      }),
      prisma.whatsAppMessage.findFirst({
        where: { direction: "outbound" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

  const deliveredLocal = await prisma.whatsAppMessage.count({
    where: {
      direction: "outbound",
      status: { in: ["delivered", "read"] },
      createdAt: { gte: new Date(startMs) },
    },
  });
  const failedLocal = await prisma.whatsAppMessage.count({
    where: {
      direction: "outbound",
      status: "failed",
      createdAt: { gte: new Date(startMs) },
    },
  });
  const readLocal = await prisma.whatsAppMessage.count({
    where: {
      direction: "outbound",
      status: "read",
      createdAt: { gte: new Date(startMs) },
    },
  });

  void deliveryRow;

  // Map local templateName → catalogue (so we know category for each template)
  const localTemplates = await prisma.whatsAppTemplate.findMany({
    select: {
      id: true,
      metaId: true,
      name: true,
      language: true,
      category: true,
      status: true,
    },
  });
  const tplByName = new Map(localTemplates.map((t) => [t.name, t]));

  // Default country code for cost estimate. We pick the most common
  // destination prefix from outbound messages — heuristic, used only when
  // Meta does not return per-country breakdown.
  const sampleNumbers = await prisma.whatsAppMessage.groupBy({
    by: ["contactPhone"],
    where: { direction: "outbound", createdAt: { gte: new Date(startMs) } },
    _count: { _all: true },
    orderBy: { _count: { contactPhone: "desc" } },
    take: 50,
  });
  const dialCodes = sampleNumbers
    .map((r) => r.contactPhone?.match(/^(\d{1,4})/)?.[1])
    .filter(Boolean) as string[];
  const dialFreq = dialCodes.reduce<Record<string, number>>((acc, c) => {
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
  const guessedCountry = guessCountryFromDial(
    Object.entries(dialFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "962",
  );

  // ── 2) Meta enrichment (best-effort) ──────────────────────────────────
  let metaConversations: ConversationDataPoint[] = [];
  let metaPricing: PricingDataPoint[] = [];
  let metaError: string | null = null;
  const metaCurrency = "USD";

  try {
    // Try the newer pricing_analytics first (per-message), fall back to
    // conversation_analytics (per-conversation, classic billing).
    const pricing = await getPricingAnalytics({
      start: startSec,
      end: endSec,
      granularity: "DAILY",
      dimensions: ["PRICING_CATEGORY", "COUNTRY"],
    });
    if (pricing && pricing.data.length) {
      metaPricing = pricing.data.flatMap((d) => d.data_points);
    }

    const conv = await getConversationAnalytics({
      start: startSec,
      end: endSec,
      granularity: "DAILY",
      dimensions: ["CONVERSATION_CATEGORY", "CONVERSATION_TYPE", "COUNTRY"],
    });
    metaConversations = conv.data.flatMap((d) => d.data_points);
  } catch (err) {
    if (isWhatsAppApiError(err)) {
      metaError = `Meta error ${err.code ?? err.status}: ${err.message}`;
    } else {
      metaError = (err as Error).message ?? "تعذّر الاتصال بـ Meta";
    }
  }

  // ── 3) Per-template Meta enrichment ──────────────────────────────────
  const templateMetaIds = localTemplates
    .map((t) => t.metaId)
    .filter((id): id is string => Boolean(id));

  const templateAnalytics: Record<string, { sent: number; delivered: number; read: number }> = {};
  if (templateMetaIds.length && !metaError) {
    try {
      // Batch — Meta caps ~10 IDs per call.
      const BATCH = 10;
      for (let i = 0; i < templateMetaIds.length; i += BATCH) {
        const batch = templateMetaIds.slice(i, i + BATCH);
        const data = await getTemplateAnalytics({
          templateIds: batch,
          start: startSec,
          end: endSec,
          metricTypes: ["SENT", "DELIVERED", "READ"],
        });
        for (const set of data.data ?? []) {
          for (const dp of set.data_points ?? []) {
            const acc =
              templateAnalytics[dp.template_id] ??
              (templateAnalytics[dp.template_id] = { sent: 0, delivered: 0, read: 0 });
            acc.sent += dp.sent ?? 0;
            acc.delivered += dp.delivered ?? 0;
            acc.read += dp.read ?? 0;
          }
        }
      }
    } catch (err) {
      // non-fatal
      const msg = isWhatsAppApiError(err) ? err.message : (err as Error).message;
      metaError = metaError ?? `Template analytics: ${msg}`;
    }
  }

  // ── 4) Cost roll-up by category ──────────────────────────────────────
  // Prefer Meta's reported cost. If empty, estimate from local rows × pricing.
  const categoryAgg: Record<
    string,
    { conversations: number; messages: number; cost: number; estimated: boolean }
  > = {};

  for (const dp of metaConversations) {
    const cat = (dp.conversation_category ?? "UNKNOWN").toUpperCase();
    if (!categoryAgg[cat]) {
      categoryAgg[cat] = { conversations: 0, messages: 0, cost: 0, estimated: false };
    }
    categoryAgg[cat].conversations += dp.conversation ?? 0;
    if (typeof dp.cost === "number") {
      categoryAgg[cat].cost += dp.cost;
    }
  }

  for (const dp of metaPricing) {
    const cat = (dp.pricing_category ?? "UNKNOWN").toUpperCase();
    if (!categoryAgg[cat]) {
      categoryAgg[cat] = { conversations: 0, messages: 0, cost: 0, estimated: false };
    }
    categoryAgg[cat].messages += dp.volume ?? 0;
    if (typeof dp.cost === "number") {
      categoryAgg[cat].cost += dp.cost;
    }
  }

  // If Meta didn't return cost (some accounts don't have analytics enabled),
  // estimate from local rows × table pricing.
  if (Object.values(categoryAgg).every((v) => v.cost === 0)) {
    for (const row of byCategoryRows) {
      const cat = (row.pricingCategory ?? "UTILITY").toUpperCase();
      const conv = row._count._all;
      const rate = getPriceForCategoryCountry(cat, guessedCountry);
      const entry =
        categoryAgg[cat] ??
        (categoryAgg[cat] = { conversations: 0, messages: 0, cost: 0, estimated: true });
      entry.messages += conv;
      entry.cost += rate * conv;
      entry.estimated = true;
    }
  }

  const totalCost = Object.values(categoryAgg).reduce((s, v) => s + v.cost, 0);
  const totalConversations = Object.values(categoryAgg).reduce(
    (s, v) => s + v.conversations,
    0,
  );

  // ── 5) Per-template roll-up ──────────────────────────────────────────
  const templateRows = byTemplateRows
    .filter((r) => r.templateName)
    .map((r) => {
      const tpl = tplByName.get(r.templateName as string);
      const localSent = r._count._all;
      const meta = tpl?.metaId ? templateAnalytics[tpl.metaId] : undefined;
      const sent = meta?.sent ?? localSent;
      const cat = (tpl?.category ?? "UTILITY").toUpperCase();
      const rate = getPriceForCategoryCountry(cat, guessedCountry);
      // Per-template cost — best-effort estimate (Meta does not split cost
      // per template; only per category). We pro-rate the category cost by
      // share of sends, falling back to pricing-table × sends.
      const catTotal = categoryAgg[cat];
      const catSendShare =
        catTotal && catTotal.messages > 0
          ? Math.min(1, sent / catTotal.messages)
          : null;
      const cost =
        catSendShare !== null && catTotal && catTotal.cost > 0
          ? catTotal.cost * catSendShare
          : rate * sent;
      return {
        name: r.templateName as string,
        templateId: tpl?.id ?? null,
        metaId: tpl?.metaId ?? null,
        language: tpl?.language ?? null,
        category: tpl?.category ?? null,
        status: tpl?.status ?? null,
        sent,
        sentLocal: localSent,
        delivered: meta?.delivered ?? null,
        read: meta?.read ?? null,
        estimatedCost: round2(cost),
        rateUsed: rate,
        costEstimated: catTotal?.estimated !== false || sent !== meta?.sent,
      };
    })
    .sort((a, b) => b.sent - a.sent);

  // Daily sparkline — simple count by day for the chart.
  const daily = await prisma.$queryRawUnsafe<{ d: Date; n: bigint }[]>(
    `SELECT DATE(created_at) AS d, COUNT(*)::bigint AS n
       FROM whatsapp_messages
      WHERE direction = 'outbound' AND created_at >= $1
   GROUP BY DATE(created_at)
   ORDER BY d ASC`,
    new Date(startMs),
  );
  const dailySeries = daily.map((r) => ({
    date: r.d.toISOString().slice(0, 10),
    sent: Number(r.n),
  }));

  return NextResponse.json({
    range: { days, startMs, endMs },
    local: {
      sent: outboundCounts,
      delivered: deliveredLocal,
      read: readLocal,
      failed: failedLocal,
      lastSentAt: lastMsg?.createdAt ?? null,
    },
    meta: {
      conversations: totalConversations,
      cost: round2(totalCost),
      currency: metaCurrency,
      hasMetaCost: metaConversations.some((d) => typeof d.cost === "number") ||
        metaPricing.some((d) => typeof d.cost === "number"),
      error: metaError,
      lastSyncedAt: new Date().toISOString(),
    },
    byCategory: Object.entries(categoryAgg).map(([category, v]) => ({
      category,
      conversations: v.conversations,
      messages: v.messages,
      cost: round2(v.cost),
      estimated: v.estimated,
    })),
    byTemplate: templateRows,
    daily: dailySeries,
    guessedCountry,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function guessCountryFromDial(dial: string): string {
  const map: Record<string, string> = {
    "962": "JO",
    "966": "SA",
    "971": "AE",
    "20": "EG",
    "974": "QA",
    "973": "BH",
    "965": "KW",
    "968": "OM",
    "961": "LB",
    "967": "YE",
    "964": "IQ",
    "970": "PS",
    "212": "MA",
    "213": "DZ",
    "216": "TN",
    "1": "US",
    "44": "GB",
    "49": "DE",
    "33": "FR",
    "39": "IT",
    "90": "TR",
    "91": "IN",
  };
  // Check progressively longer prefixes
  for (let i = 4; i >= 1; i -= 1) {
    const key = dial.slice(0, i);
    if (map[key]) return map[key];
  }
  return "JO";
}
