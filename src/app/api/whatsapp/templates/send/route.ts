import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { sendTemplate, isWhatsAppApiError } from "@/lib/whatsapp/client";
import {
  buildSendComponents,
  inspectTemplate,
} from "@/lib/whatsapp/template-helpers";
import { normalizePhone } from "@/lib/phone";
import { beginOutboundLog, finishOutboundLog } from "@/lib/whatsapp/log-outbound";

/**
 * POST /api/whatsapp/templates/send
 *
 * Generic "send any approved template" endpoint. Resolves the template
 * by name from our local cache (synced from Meta), introspects its
 * variables, and builds the exact `components` payload the Cloud API
 * needs from the operator-supplied values map. Adding a brand new
 * template at Meta requires zero code changes — sync it once and it
 * becomes sendable from this endpoint.
 *
 * Body:
 *   {
 *     name: string,                 // template name (e.g. "otp_login_ar")
 *     language?: string,            // defaults to template's stored language
 *     to: string,                   // recipient phone (any common format)
 *     values?: Record<string,string>// keyed by TemplateVariable.id
 *   }
 */
export async function POST(request: Request) {
  try {
    await requirePermission("whatsapp:send_template");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  let body: {
    name?: unknown;
    language?: unknown;
    to?: unknown;
    values?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "صيغة الطلب غير صالحة" },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const toRaw = typeof body.to === "string" ? body.to.trim() : "";
  const language =
    typeof body.language === "string" && body.language.trim().length > 0
      ? body.language.trim()
      : undefined;
  const values =
    body.values && typeof body.values === "object" && !Array.isArray(body.values)
      ? (body.values as Record<string, string>)
      : {};

  if (!name)
    return NextResponse.json(
      { error: "اسم القالب مطلوب" },
      { status: 400 },
    );

  const phone = normalizePhone(toRaw);
  if (!phone)
    return NextResponse.json(
      { error: "رقم الهاتف غير صالح" },
      { status: 400 },
    );

  // Resolve from local cache. We keep a row per template synced from Meta.
  const tpl = await prisma.whatsAppTemplate.findFirst({
    where: language ? { name, language } : { name },
    orderBy: { lastSyncedAt: "desc" },
  });

  if (!tpl) {
    return NextResponse.json(
      {
        error:
          "القالب غير موجود محلياً. اضغط \"مزامنة من Meta\" ثم حاول مجدداً.",
      },
      { status: 404 },
    );
  }

  if (tpl.status !== "APPROVED") {
    return NextResponse.json(
      {
        error: `القالب "${tpl.name}" لم يُعتمد بعد عند Meta (الحالة: ${tpl.status}). لا يمكن إرسال قالب غير معتمد.`,
      },
      { status: 422 },
    );
  }

  // Build the components array. `inspectTemplate` runs a second time inside
  // `buildSendComponents`, but the cost is negligible and the symmetry helps
  // give the user a clear error before hitting Meta.
  const inspected = inspectTemplate(tpl.components);
  let components: unknown[];
  try {
    components = buildSendComponents({ components: tpl.components, values });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تجهيز محتوى القالب" },
      { status: 400 },
    );
  }

  const toDigits = phone.replace(/^\+/, "");
  // Optimistic inbox row so the send appears in /whatsapp even if Meta is slow.
  const handle = await beginOutboundLog({
    to: toDigits,
    type: "template",
    body: null,
    templateName: tpl.name,
    origin: "templates/send",
  });

  try {
    const meta = await sendTemplate({
      to: toDigits,
      templateName: tpl.name,
      language: tpl.language,
      components: inspected.isStatic ? [] : components,
    });
    if (handle) {
      await finishOutboundLog({
        rowId: handle.rowId,
        conversationId: handle.conversationId,
        contactPhone: toDigits,
        ok: { wamid: meta.messages?.[0]?.id ?? null, raw: meta },
      });
    }
    return NextResponse.json({
      ok: true,
      messageId: meta.messages?.[0]?.id ?? null,
      to: phone,
      template: tpl.name,
      language: tpl.language,
      sentVariables: inspected.variables.length,
    });
  } catch (err) {
    if (handle) {
      await finishOutboundLog({
        rowId: handle.rowId,
        conversationId: handle.conversationId,
        contactPhone: toDigits,
        err,
      });
    }
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      {
        error:
          apiErr?.message ?? (err as Error).message ?? "تعذّر الإرسال عبر WhatsApp",
        meta: apiErr
          ? {
              status: apiErr.status,
              code: apiErr.code,
              subcode: apiErr.subcode,
              fbtraceId: apiErr.fbtraceId,
            }
          : null,
      },
      { status: apiErr?.status ?? 502 },
    );
  }
}

/**
 * GET /api/whatsapp/templates/send?name=...&language=...
 *
 * Returns the inspected variables for a template, so the UI can render
 * a form dynamically without duplicating the introspection logic.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("whatsapp:send_template");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim();
  const language = (url.searchParams.get("language") ?? "").trim() || undefined;

  if (!name)
    return NextResponse.json(
      { error: "اسم القالب مطلوب" },
      { status: 400 },
    );

  const tpl = await prisma.whatsAppTemplate.findFirst({
    where: language ? { name, language } : { name },
    orderBy: { lastSyncedAt: "desc" },
  });
  if (!tpl)
    return NextResponse.json(
      { error: "القالب غير موجود محلياً" },
      { status: 404 },
    );

  const inspected = inspectTemplate(tpl.components);
  return NextResponse.json({
    name: tpl.name,
    language: tpl.language,
    category: tpl.category,
    status: tpl.status,
    ...inspected,
  });
}
