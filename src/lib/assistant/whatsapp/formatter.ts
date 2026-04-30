import "server-only";
import type { AssistantAction } from "@prisma/client";

/**
 * Render an `AssistantAction` row as a plain-text WhatsApp message.
 *
 * WhatsApp text supports a tiny markdown subset (`*bold*`, `_italic_`,
 * `~strike~`, ``` ``` ``` `monospace ``` ```). We use it sparingly so the
 * messages stay readable when the recipient's client doesn't render it.
 *
 * Every message ends with the explicit confirm/reject instructions so the
 * staff member knows exactly what to type back. The handler's parser
 * looks for `أكّد A12` / `ألغِ A12` (or English `confirm A12` / `cancel A12`).
 */

const KIND_LABEL: Record<string, string> = {
  journal_entry: "قيد محاسبي",
  reservation_create: "حجز جديد",
  maintenance_create: "طلب صيانة",
  task_create: "بطاقة مهمة",
  payroll_advance: "سُلفة موظف",
  unit_status_change: "تغيير حالة وحدة",
};

interface JournalLine {
  accountCode: string;
  accountName?: string | null;
  partyName?: string | null;
  costCenterCode?: string | null;
  costCenterName?: string | null;
  debit?: number;
  credit?: number;
  description?: string | null;
}

export function formatActionForWhatsApp(action: AssistantAction): string {
  const ref = `A${action.id}`;
  const label = KIND_LABEL[action.kind] ?? action.kind;
  const lines: string[] = [];
  lines.push(`*[مسودة #${ref}]* ${label}`);
  lines.push(action.summary);
  lines.push("");

  const body = renderBody(action);
  if (body) lines.push(body);

  lines.push("");
  lines.push(`للتنفيذ أرسل: \`أكّد ${ref}\``);
  lines.push(`للإلغاء أرسل: \`ألغِ ${ref}\``);
  lines.push(`صلاحية المسودة: 30 دقيقة من إنشائها.`);
  return lines.join("\n");
}

function renderBody(action: AssistantAction): string {
  const p = action.payload as Record<string, unknown> | null;
  if (!p) return "";
  switch (action.kind) {
    case "journal_entry":
      return renderJournal(p as { lines: JournalLine[]; date: string; reference?: string | null });
    case "reservation_create":
      return renderReservation(p);
    case "maintenance_create":
      return renderMaintenance(p);
    case "task_create":
      return renderTask(p);
    case "payroll_advance":
      return renderAdvance(p);
    case "unit_status_change":
      return renderUnitStatus(p);
    default:
      return "";
  }
}

function renderJournal(p: { lines: JournalLine[]; date: string; reference?: string | null }): string {
  const out: string[] = [];
  out.push(`التاريخ: ${p.date}${p.reference ? ` — مرجع: ${p.reference}` : ""}`);
  out.push("");
  let totalD = 0;
  let totalC = 0;
  for (const l of p.lines) {
    const d = Number(l.debit) || 0;
    const c = Number(l.credit) || 0;
    totalD += d;
    totalC += c;
    const acct = l.accountName ? `${l.accountCode} ${l.accountName}` : l.accountCode;
    const dr = d > 0 ? `مدين ${d.toFixed(2)}` : "";
    const cr = c > 0 ? `دائن ${c.toFixed(2)}` : "";
    out.push(`• ${acct} — ${dr || cr}`);
    const meta: string[] = [];
    if (l.partyName) meta.push(`الطرف: ${l.partyName}`);
    if (l.costCenterCode) meta.push(`مركز: ${l.costCenterCode}${l.costCenterName ? " " + l.costCenterName : ""}`);
    if (l.description) meta.push(l.description);
    if (meta.length) out.push(`  ${meta.join(" — ")}`);
  }
  out.push("");
  out.push(`المجموع: مدين ${totalD.toFixed(2)} = دائن ${totalC.toFixed(2)}`);
  return out.join("\n");
}

function renderReservation(p: Record<string, unknown>): string {
  return [
    `الضيف: ${p.guestName ?? "—"}`,
    `الوحدة: ${p.unitNumber ?? "—"}`,
    `عدد الليالي: ${p.numNights ?? "—"}`,
    `سعر/ليلة: ${num(p.unitPrice)} د.أ`,
    `الإجمالي: ${num(p.totalAmount)} د.أ`,
    `المدفوع: ${num(p.paidAmount)} د.أ`,
    `المتبقي: ${num(p.remaining)} د.أ`,
  ].join("\n");
}

function renderMaintenance(p: Record<string, unknown>): string {
  const out = [`الوحدة: ${p.unitNumber ?? "—"}`, `الوصف: ${p.description ?? "—"}`];
  if (p.contractor) out.push(`الفني: ${p.contractor}`);
  if (p.cost) out.push(`التكلفة: ${num(p.cost)} د.أ`);
  return out.join("\n");
}

function renderTask(p: Record<string, unknown>): string {
  const out = [`اللوحة: ${p.boardName ?? "—"}`, `العنوان: ${p.title ?? "—"}`];
  if (p.priority) out.push(`الأولوية: ${p.priority}`);
  if (p.dueAt) out.push(`الاستحقاق: ${new Date(String(p.dueAt)).toLocaleString("ar")}`);
  return out.join("\n");
}

function renderAdvance(p: Record<string, unknown>): string {
  return [
    `الموظف: ${p.partyName ?? "—"}`,
    `القيمة: ${num(p.amount)} د.أ`,
    `وسيلة الصرف: ${p.paymentMethod ?? "cash"}`,
    `التاريخ: ${p.date ?? "—"}`,
  ].join("\n");
}

function renderUnitStatus(p: Record<string, unknown>): string {
  return [
    `الوحدة: ${p.unitNumber ?? "—"}`,
    `من: ${p.fromStatus ?? "—"} → إلى: ${p.toStatus ?? "—"}`,
    p.reason ? `السبب: ${p.reason}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function num(v: unknown): string {
  return Number(v ?? 0).toFixed(2);
}

// ─────────── Action-id parser ───────────

/**
 * Parse a staff text reply to extract a confirm / reject command. Accepts:
 *   • "أكّد A12" / "اكد A12" / "تأكيد A12"
 *   • "ألغِ A12" / "الغ A12" / "إلغاء A12"
 *   • "confirm A12" / "cancel A12"
 * Returns null when nothing matches.
 */
export function parseActionCommand(
  text: string,
): { kind: "confirm" | "reject"; actionId: number } | null {
  const t = text.trim().toLowerCase();
  const idMatch = t.match(/a\s*(\d+)/);
  if (!idMatch) return null;
  const actionId = Number(idMatch[1]);
  if (!Number.isInteger(actionId) || actionId <= 0) return null;

  if (/(?:^|\s)(أكّد|اكّد|اكد|أكد|تأكيد|تاكيد|confirm|ok)(?:\s|$)/.test(t)) {
    return { kind: "confirm", actionId };
  }
  if (/(?:^|\s)(ألغِ|الغ|الغي|إلغاء|الغاء|cancel|reject)(?:\s|$)/.test(t)) {
    return { kind: "reject", actionId };
  }
  return null;
}

/** Special verbs the bot understands without an action id. */
export function parseSessionCommand(text: string): "logout" | "help" | null {
  const t = text.trim().toLowerCase();
  if (/^(خروج|انهاء|إنهاء|logout|exit|quit)$/.test(t)) return "logout";
  if (/^(مساعدة|مساعده|help|\?)$/.test(t)) return "help";
  return null;
}
