"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  FileText,
  CalendarPlus,
  Wrench,
  ListChecks,
  Wallet,
  BedDouble,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AssistantAction {
  id: number;
  kind: string;
  summary: string;
  payload: unknown;
  status: "pending" | "confirmed" | "executed" | "rejected" | "failed" | "expired";
  executedRefId: string | null;
  errorMessage: string | null;
  expiresAt: string;
  createdAt: string;
  executedAt: string | null;
}

interface Props {
  action: AssistantAction;
  onConfirm: () => Promise<void>;
  onReject: () => Promise<void>;
}

const KIND_META: Record<string, { label: string; icon: typeof FileText }> = {
  journal_entry: { label: "قيد محاسبي", icon: FileText },
  reservation_create: { label: "حجز جديد", icon: CalendarPlus },
  maintenance_create: { label: "طلب صيانة", icon: Wrench },
  task_create: { label: "بطاقة مهمة", icon: ListChecks },
  payroll_advance: { label: "سُلفة موظف", icon: Wallet },
  unit_status_change: { label: "تغيير حالة وحدة", icon: BedDouble },
};

export function ActionDraftCard({ action, onConfirm, onReject }: Props) {
  const meta = KIND_META[action.kind] ?? { label: action.kind, icon: FileText };
  const Icon = meta.icon;
  const [working, setWorking] = useState<"confirm" | "reject" | null>(null);

  const isPending = action.status === "pending";
  const isExecuted = action.status === "executed";
  const isFailed = action.status === "failed";
  const isExpired = action.status === "expired";
  const isRejected = action.status === "rejected";

  const cardTone = isExecuted
    ? "border-emerald-300 bg-emerald-50"
    : isFailed
      ? "border-red-300 bg-red-50"
      : isRejected || isExpired
        ? "border-gray-300 bg-gray-50 opacity-70"
        : "border-amber-300 bg-amber-50";

  const handle = async (kind: "confirm" | "reject") => {
    setWorking(kind);
    try {
      if (kind === "confirm") await onConfirm();
      else await onReject();
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className={cn("rounded-xl border-2 p-3 shadow-sm", cardTone)}>
      <div className="flex items-start gap-2 mb-2">
        <div className="bg-white rounded-md p-1.5 border border-gray-200">
          <Icon size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">
              {meta.label} — مسودة
            </span>
            <StatusBadge status={action.status} />
          </div>
          <p className="text-sm font-medium text-gray-800 mt-0.5">{action.summary}</p>
        </div>
      </div>

      <DraftBody kind={action.kind} payload={action.payload} />

      {action.errorMessage && (
        <div className="mt-2 px-2 py-1.5 rounded bg-red-100 border border-red-200 text-xs text-red-700 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{action.errorMessage}</span>
        </div>
      )}

      {isPending && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => handle("confirm")}
            disabled={working !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium"
          >
            {working === "confirm" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            تأكيد التنفيذ
          </button>
          <button
            onClick={() => handle("reject")}
            disabled={working !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-gray-300 hover:border-red-400 hover:text-red-600 text-gray-700 text-xs font-medium disabled:opacity-50"
          >
            {working === "reject" ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            إلغاء
          </button>
          <span className="text-[11px] text-gray-500 flex items-center gap-1 mr-auto">
            <Clock size={11} />
            تنتهي صلاحيتها {formatRelative(action.expiresAt)}
          </span>
        </div>
      )}

      {isExecuted && action.executedRefId && (
        <div className="mt-2 text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 size={14} />
          تم التنفيذ — المرجع: <span className="font-mono">{action.executedRefId}</span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AssistantAction["status"] }) {
  const map: Record<AssistantAction["status"], { label: string; cls: string }> = {
    pending: { label: "بانتظار التأكيد", cls: "bg-amber-100 text-amber-800" },
    confirmed: { label: "قيد التنفيذ", cls: "bg-blue-100 text-blue-800" },
    executed: { label: "تمّت", cls: "bg-emerald-100 text-emerald-800" },
    rejected: { label: "ملغاة", cls: "bg-gray-200 text-gray-700" },
    failed: { label: "فشلت", cls: "bg-red-100 text-red-700" },
    expired: { label: "منتهية", cls: "bg-gray-200 text-gray-600" },
  };
  const m = map[status];
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold", m.cls)}>{m.label}</span>
  );
}

// ──────────────────────── per-kind body ────────────────────────

function DraftBody({ kind, payload }: { kind: string; payload: unknown }) {
  if (typeof payload !== "object" || payload === null) return null;
  switch (kind) {
    case "journal_entry":
      return <JournalBody payload={payload as JournalPayload} />;
    case "reservation_create":
      return <ReservationBody payload={payload as Record<string, unknown>} />;
    case "maintenance_create":
      return <MaintenanceBody payload={payload as Record<string, unknown>} />;
    case "task_create":
      return <TaskBody payload={payload as Record<string, unknown>} />;
    case "payroll_advance":
      return <AdvanceBody payload={payload as Record<string, unknown>} />;
    case "unit_status_change":
      return <UnitStatusBody payload={payload as Record<string, unknown>} />;
    default:
      return (
        <pre className="text-[11px] bg-white border border-gray-200 rounded p-2 overflow-auto max-h-40 text-gray-700">
          {JSON.stringify(payload, null, 2)}
        </pre>
      );
  }
}

interface JournalLine {
  accountCode: string;
  accountName?: string | null;
  partyId?: number | null;
  partyName?: string | null;
  costCenterCode?: string | null;
  costCenterName?: string | null;
  debit?: number;
  credit?: number;
  description?: string | null;
}
interface JournalPayload {
  date: string;
  description: string;
  reference?: string | null;
  lines: JournalLine[];
  totals?: { debit: number; credit: number };
}

function JournalBody({ payload }: { payload: JournalPayload }) {
  const totalDebit =
    payload.totals?.debit ?? payload.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit =
    payload.totals?.credit ?? payload.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden text-xs">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="text-gray-600">
          <span className="text-gray-400">التاريخ: </span>
          <span className="font-semibold text-gray-700">{payload.date}</span>
        </span>
        {payload.reference && (
          <span className="text-gray-600">
            <span className="text-gray-400">مرجع: </span>
            <span className="font-semibold text-gray-700">{payload.reference}</span>
          </span>
        )}
        <span className="text-gray-600">
          <span className="text-gray-400">المصدر: </span>
          <span className="font-semibold text-gray-700">المساعد الذكي</span>
        </span>
      </div>
      {payload.description && (
        <div className="px-3 py-1.5 bg-amber-50/60 border-b border-amber-100 text-[11px] text-gray-700">
          <span className="text-gray-500">وصف القيد: </span>
          {payload.description}
        </div>
      )}
      <table className="w-full">
        <thead className="bg-gray-50 text-gray-600 text-[10px] uppercase">
          <tr>
            <th className="text-right px-2 py-1.5 font-semibold w-[42%]">الحساب</th>
            <th className="text-right px-2 py-1.5 font-semibold">الطرف / مركز التكلفة / الوصف</th>
            <th className="text-left px-2 py-1.5 font-semibold w-20">مدين</th>
            <th className="text-left px-2 py-1.5 font-semibold w-20">دائن</th>
          </tr>
        </thead>
        <tbody>
          {payload.lines.map((l, i) => (
            <tr key={i} className="border-t border-gray-100 align-top">
              <td className="px-2 py-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-gray-900 font-bold">{l.accountCode}</span>
                  {l.accountName && (
                    <span className="text-gray-700">{l.accountName}</span>
                  )}
                </div>
              </td>
              <td className="px-2 py-1.5 text-gray-700">
                <div className="space-y-0.5">
                  {l.partyName && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">الطرف:</span>
                      <span className="font-medium text-gray-800">{l.partyName}</span>
                      {l.partyId != null && (
                        <span className="text-[10px] text-gray-400 font-mono">
                          #{l.partyId}
                        </span>
                      )}
                    </div>
                  )}
                  {l.costCenterCode && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">مركز تكلفة:</span>
                      <span className="font-mono text-gray-700">{l.costCenterCode}</span>
                      {l.costCenterName && (
                        <span className="text-gray-700">— {l.costCenterName}</span>
                      )}
                    </div>
                  )}
                  {l.description && (
                    <div className="text-[11px] text-gray-600">{l.description}</div>
                  )}
                  {!l.partyName && !l.costCenterCode && !l.description && (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              </td>
              <td className="px-2 py-1.5 text-left tabular-nums font-medium text-gray-900">
                {l.debit ? Number(l.debit).toFixed(2) : ""}
              </td>
              <td className="px-2 py-1.5 text-left tabular-nums font-medium text-gray-900">
                {l.credit ? Number(l.credit).toFixed(2) : ""}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 font-bold">
          <tr>
            <td className="px-2 py-1.5" colSpan={2}>
              المجموع
            </td>
            <td className="px-2 py-1.5 text-left tabular-nums">{totalDebit.toFixed(2)}</td>
            <td className="px-2 py-1.5 text-left tabular-nums">{totalCredit.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      {!balanced && (
        <div className="px-3 py-1.5 bg-red-50 border-t border-red-200 text-[11px] text-red-700">
          قيد غير متوازن! الفرق: {(totalDebit - totalCredit).toFixed(2)}
        </div>
      )}
    </div>
  );
}

function ReservationBody({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2.5 text-xs space-y-1">
      <KV label="الضيف" value={String(payload.guestName ?? "")} />
      <KV label="الوحدة" value={String(payload.unitNumber ?? "")} />
      <KV label="عدد الليالي" value={String(payload.numNights ?? "")} />
      <KV label="السعر/ليلة" value={`${Number(payload.unitPrice ?? 0).toFixed(2)} د.أ`} />
      <KV label="الإجمالي" value={`${Number(payload.totalAmount ?? 0).toFixed(2)} د.أ`} />
      <KV label="المدفوع" value={`${Number(payload.paidAmount ?? 0).toFixed(2)} د.أ`} />
      <KV label="المتبقي" value={`${Number(payload.remaining ?? 0).toFixed(2)} د.أ`} />
      {payload.notes ? <KV label="ملاحظات" value={String(payload.notes)} /> : null}
    </div>
  );
}

function MaintenanceBody({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2.5 text-xs space-y-1">
      <KV label="الوحدة" value={String(payload.unitNumber ?? "")} />
      <KV label="الوصف" value={String(payload.description ?? "")} />
      {payload.contractor ? <KV label="الفني" value={String(payload.contractor)} /> : null}
      {payload.cost ? <KV label="التكلفة" value={`${Number(payload.cost).toFixed(2)} د.أ`} /> : null}
      {payload.notes ? <KV label="ملاحظات" value={String(payload.notes)} /> : null}
    </div>
  );
}

function TaskBody({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2.5 text-xs space-y-1">
      <KV label="اللوحة" value={String(payload.boardName ?? "")} />
      <KV label="العنوان" value={String(payload.title ?? "")} />
      {payload.description ? (
        <KV label="الوصف" value={String(payload.description)} />
      ) : null}
      {payload.priority ? <KV label="الأولوية" value={String(payload.priority)} /> : null}
      {payload.dueAt ? (
        <KV label="موعد الاستحقاق" value={new Date(String(payload.dueAt)).toLocaleString("ar")} />
      ) : null}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  available: "متاحة",
  occupied: "مشغولة",
  maintenance: "صيانة",
};

function UnitStatusBody({ payload }: { payload: Record<string, unknown> }) {
  const from = String(payload.fromStatus ?? "");
  const to = String(payload.toStatus ?? "");
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2.5 text-xs space-y-1">
      <KV label="الوحدة" value={String(payload.unitNumber ?? "")} />
      <KV label="من حالة" value={STATUS_LABELS[from] ?? from} />
      <KV label="إلى حالة" value={STATUS_LABELS[to] ?? to} />
      {payload.reason ? <KV label="السبب" value={String(payload.reason)} /> : null}
    </div>
  );
}

function AdvanceBody({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2.5 text-xs space-y-1">
      <KV label="الموظف" value={String(payload.partyName ?? "")} />
      <KV label="القيمة" value={`${Number(payload.amount ?? 0).toFixed(2)} د.أ`} />
      <KV label="وسيلة الصرف" value={String(payload.paymentMethod ?? "cash")} />
      <KV label="التاريخ" value={String(payload.date ?? "")} />
      {payload.notes ? <KV label="ملاحظات" value={String(payload.notes)} /> : null}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-gray-500 min-w-[80px]">{label}:</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function formatRelative(iso: string): string {
  const target = new Date(iso).getTime();
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "الآن";
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `بعد ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  return `بعد ${hours} ساعة`;
}
