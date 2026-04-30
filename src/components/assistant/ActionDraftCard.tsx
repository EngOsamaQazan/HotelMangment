"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  Pencil,
  Plus,
  Trash2,
  Save,
  Search,
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
  /**
   * Optional callback the chat container provides so the card can refresh
   * its own state after a successful inline edit. The container then
   * re-fetches messages + actions, mirroring the existing confirm/reject
   * flow.
   */
  onUpdated?: () => Promise<void>;
}

const KIND_META: Record<string, { label: string; icon: typeof FileText }> = {
  journal_entry: { label: "قيد محاسبي", icon: FileText },
  reservation_create: { label: "حجز جديد", icon: CalendarPlus },
  maintenance_create: { label: "طلب صيانة", icon: Wrench },
  task_create: { label: "بطاقة مهمة", icon: ListChecks },
  payroll_advance: { label: "سُلفة موظف", icon: Wallet },
  unit_status_change: { label: "تغيير حالة وحدة", icon: BedDouble },
};

const EDITABLE_KINDS = new Set([
  "journal_entry",
  "reservation_create",
  "maintenance_create",
  "task_create",
  "payroll_advance",
  "unit_status_change",
]);

export function ActionDraftCard({ action, onConfirm, onReject, onUpdated }: Props) {
  const meta = KIND_META[action.kind] ?? { label: action.kind, icon: FileText };
  const Icon = meta.icon;
  const [working, setWorking] = useState<"confirm" | "reject" | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const isPending = action.status === "pending";
  const isExecuted = action.status === "executed";
  const isFailed = action.status === "failed";
  const isExpired = action.status === "expired";
  const isRejected = action.status === "rejected";
  const canEdit = isPending && EDITABLE_KINDS.has(action.kind);

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

  const submitPatch = useCallback(
    async (payloadPatch: Record<string, unknown>, summary?: string | null) => {
      setSaving(true);
      setEditError(null);
      try {
        const res = await fetch(`/api/assistant/actions/${action.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payloadPatch,
            ...(summary != null ? { summary } : {}),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setEditError(json.error || "فشل تحديث المسودة");
          return false;
        }
        setEditing(false);
        if (onUpdated) await onUpdated();
        return true;
      } finally {
        setSaving(false);
      }
    },
    [action.id, onUpdated],
  );

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

      {editing ? (
        <DraftEditor
          kind={action.kind}
          payload={action.payload}
          summary={action.summary}
          onCancel={() => {
            setEditing(false);
            setEditError(null);
          }}
          onSubmit={submitPatch}
          saving={saving}
          error={editError}
        />
      ) : (
        <DraftBody kind={action.kind} payload={action.payload} />
      )}

      {action.errorMessage && (
        <div className="mt-2 px-2 py-1.5 rounded bg-red-100 border border-red-200 text-xs text-red-700 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{action.errorMessage}</span>
        </div>
      )}

      {isPending && !editing && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handle("confirm")}
            disabled={working !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium"
          >
            {working === "confirm" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            تأكيد التنفيذ
          </button>
          {canEdit && (
            <button
              onClick={() => {
                setEditing(true);
                setEditError(null);
              }}
              disabled={working !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-gray-300 hover:border-amber-400 hover:text-amber-700 text-gray-700 text-xs font-medium disabled:opacity-50"
            >
              <Pencil size={14} />
              تعديل
            </button>
          )}
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

// ──────────────────────── per-kind body (read-only) ────────────────────────

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

// ──────────────────────── editors ────────────────────────

interface EditorProps {
  kind: string;
  payload: unknown;
  summary: string;
  onCancel: () => void;
  onSubmit: (
    payloadPatch: Record<string, unknown>,
    summary?: string | null,
  ) => Promise<boolean>;
  saving: boolean;
  error: string | null;
}

function DraftEditor(props: EditorProps) {
  switch (props.kind) {
    case "journal_entry":
      return <JournalEditor {...props} />;
    case "reservation_create":
      return <ReservationEditor {...props} />;
    case "maintenance_create":
      return <MaintenanceEditor {...props} />;
    case "task_create":
      return <TaskEditor {...props} />;
    case "payroll_advance":
      return <AdvanceEditor {...props} />;
    case "unit_status_change":
      return <UnitStatusEditor {...props} />;
    default:
      return (
        <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded p-2">
          هذا النوع من المسودات لا يدعم التعديل بعد. ألغ المسودة واطلب من المساعد إنشاء بديل.
        </div>
      );
  }
}

function EditorShell({
  saving,
  error,
  onCancel,
  onSubmit,
  children,
  disabled,
}: {
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-amber-300 p-3 text-xs space-y-2 shadow-inner">
      {children}
      {error && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        <button
          onClick={onSubmit}
          disabled={saving || disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-medium"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          حفظ التعديل
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs"
        >
          <XCircle size={14} />
          إلغاء التعديل
        </button>
      </div>
    </div>
  );
}

// ─── Journal entry editor ──────────────────────────────────────────────

interface DraftLine {
  accountCode: string;
  accountName: string | null;
  partyId: number | null;
  partyName: string | null;
  costCenterCode: string | null;
  costCenterName: string | null;
  debit: number;
  credit: number;
  description: string | null;
}

interface AccountOption {
  id: number;
  code: string;
  name: string;
  type: string;
}
interface PartyOption {
  id: number;
  name: string;
  type: string;
}
interface CostCenterOption {
  id: number;
  code: string;
  name: string;
}

function JournalEditor({ payload, onCancel, onSubmit, saving, error }: EditorProps) {
  const initial = payload as JournalPayload;
  const [date, setDate] = useState<string>(initial.date);
  const [description, setDescription] = useState<string>(initial.description ?? "");
  const [reference, setReference] = useState<string>(initial.reference ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    (initial.lines ?? []).map((l) => ({
      accountCode: l.accountCode,
      accountName: l.accountName ?? null,
      partyId: l.partyId ?? null,
      partyName: l.partyName ?? null,
      costCenterCode: l.costCenterCode ?? null,
      costCenterName: l.costCenterName ?? null,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      description: l.description ?? null,
    })),
  );

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

  const update = (i: number, patch: Partial<DraftLine>) =>
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) =>
    setLines((arr) => (arr.length > 2 ? arr.filter((_, idx) => idx !== i) : arr));
  const append = () =>
    setLines((arr) => [
      ...arr,
      {
        accountCode: "",
        accountName: null,
        partyId: null,
        partyName: null,
        costCenterCode: null,
        costCenterName: null,
        debit: 0,
        credit: 0,
        description: null,
      },
    ]);

  const submit = async () => {
    await onSubmit({
      date,
      description,
      reference: reference.trim() || null,
      lines: lines.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        partyId: l.partyId,
        partyName: l.partyName,
        costCenterCode: l.costCenterCode,
        costCenterName: l.costCenterName,
        debit: l.debit || 0,
        credit: l.credit || 0,
        description: l.description,
      })),
    });
  };

  return (
    <EditorShell
      saving={saving}
      error={error}
      onCancel={onCancel}
      onSubmit={submit}
      disabled={!balanced || lines.length < 2}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Field label="تاريخ القيد">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-amber-500 focus:outline-none"
          />
        </Field>
        <Field label="مرجع (اختياري)">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="فاتورة #/إيصال"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-amber-500 focus:outline-none"
          />
        </Field>
        <Field label="الوصف العام">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-amber-500 focus:outline-none"
          />
        </Field>
      </div>

      <div className="space-y-2">
        {lines.map((line, i) => (
          <div
            key={i}
            className="border border-gray-200 rounded-md p-2 bg-gray-50 grid grid-cols-1 md:grid-cols-12 gap-1.5"
          >
            <div className="md:col-span-4">
              <Field label="الحساب">
                <AccountPicker
                  current={
                    line.accountCode
                      ? { code: line.accountCode, name: line.accountName ?? "" }
                      : null
                  }
                  onSelect={(acc) =>
                    update(i, { accountCode: acc.code, accountName: acc.name })
                  }
                />
              </Field>
            </div>
            <div className="md:col-span-3">
              <Field label="طرف (اختياري)">
                <PartyPicker
                  current={
                    line.partyId != null
                      ? { id: line.partyId, name: line.partyName ?? "" }
                      : null
                  }
                  onSelect={(p) => update(i, { partyId: p.id, partyName: p.name })}
                  onClear={() => update(i, { partyId: null, partyName: null })}
                />
              </Field>
            </div>
            <div className="md:col-span-3">
              <Field label="مركز تكلفة">
                <CostCenterPicker
                  current={
                    line.costCenterCode
                      ? {
                          code: line.costCenterCode,
                          name: line.costCenterName ?? "",
                        }
                      : null
                  }
                  onSelect={(cc) =>
                    update(i, { costCenterCode: cc.code, costCenterName: cc.name })
                  }
                  onClear={() =>
                    update(i, { costCenterCode: null, costCenterName: null })
                  }
                />
              </Field>
            </div>
            <div className="md:col-span-1">
              <Field label="مدين">
                <input
                  inputMode="decimal"
                  value={line.debit ? line.debit : ""}
                  onChange={(e) =>
                    update(i, { debit: parseAmount(e.target.value), credit: 0 })
                  }
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1 tabular-nums focus:border-amber-500 focus:outline-none"
                />
              </Field>
            </div>
            <div className="md:col-span-1">
              <Field label="دائن">
                <input
                  inputMode="decimal"
                  value={line.credit ? line.credit : ""}
                  onChange={(e) =>
                    update(i, { credit: parseAmount(e.target.value), debit: 0 })
                  }
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1 tabular-nums focus:border-amber-500 focus:outline-none"
                />
              </Field>
            </div>
            <div className="md:col-span-12 flex items-center gap-1.5">
              <input
                value={line.description ?? ""}
                onChange={(e) =>
                  update(i, { description: e.target.value || null })
                }
                placeholder="وصف السطر (اختياري)"
                className="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={() => remove(i)}
                disabled={lines.length <= 2}
                className="p-1 rounded text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                title="حذف السطر"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={append}
          className="text-[11px] text-amber-700 hover:bg-amber-50 px-2 py-1 rounded inline-flex items-center gap-1"
        >
          <Plus size={12} /> إضافة سطر
        </button>
      </div>

      <div
        className={cn(
          "rounded px-2 py-1.5 text-[11px] flex items-center justify-between",
          balanced
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200",
        )}
      >
        <span>
          مدين: <span className="tabular-nums font-bold">{totalDebit.toFixed(2)}</span> ·
          دائن: <span className="tabular-nums font-bold">{totalCredit.toFixed(2)}</span>
        </span>
        <span>
          {balanced
            ? "متوازن"
            : `غير متوازن: الفرق ${(totalDebit - totalCredit).toFixed(2)}`}
        </span>
      </div>
    </EditorShell>
  );
}

function parseAmount(text: string): number {
  const cleaned = text.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] text-gray-500 mb-0.5 block">{label}</span>
      {children}
    </label>
  );
}

// ─── Lookup pickers ───────────────────────────────────────────────────

interface PickerProps<T> {
  current: T | null;
  onSelect: (value: T) => void;
  onClear?: () => void;
}

function AccountPicker({
  current,
  onSelect,
}: PickerProps<{ code: string; name: string }>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/assistant/lookup/accounts?q=${encodeURIComponent(q)}&limit=20`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const json = await res.json();
          setResults(Array.isArray(json.accounts) ? json.accounts : []);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-right text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:border-amber-400 focus:outline-none focus:border-amber-500"
      >
        {current ? (
          <span className="flex items-baseline gap-1">
            <span className="font-mono font-bold text-gray-900">{current.code}</span>
            <span className="text-gray-700 truncate">{current.name}</span>
          </span>
        ) : (
          <span className="text-gray-400">— اختر حساباً —</span>
        )}
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 w-full max-w-sm bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 p-1">
            <div className="relative">
              <Search size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث برقم أو اسم الحساب..."
                className="w-full pr-7 pl-2 py-1 text-xs border border-gray-200 rounded focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>
          {loading && (
            <div className="p-2 text-center text-[11px] text-gray-400">
              <Loader2 size={12} className="inline animate-spin" /> جاري البحث…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-2 text-center text-[11px] text-gray-400">لا توجد نتائج</div>
          )}
          {results.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onSelect({ code: a.code, name: a.name });
                setOpen(false);
                setQ("");
              }}
              className="w-full text-right px-2 py-1.5 text-xs hover:bg-amber-50 border-b border-gray-100 last:border-b-0 flex items-baseline gap-1.5"
            >
              <span className="font-mono font-bold text-gray-900 min-w-[3rem]">
                {a.code}
              </span>
              <span className="text-gray-700 flex-1">{a.name}</span>
              <span className="text-[9px] text-gray-400 uppercase">{a.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PartyPicker({
  current,
  onSelect,
  onClear,
}: PickerProps<{ id: number; name: string }>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/assistant/lookup/parties?q=${encodeURIComponent(q)}&limit=15`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const json = await res.json();
          setResults(Array.isArray(json.parties) ? json.parties : []);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 text-right text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:border-amber-400 focus:outline-none truncate"
        >
          {current ? (
            <span className="text-gray-800 font-medium truncate">{current.name}</span>
          ) : (
            <span className="text-gray-400">— لا طرف —</span>
          )}
        </button>
        {current && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded text-gray-500 hover:bg-gray-100"
            aria-label="إزالة الطرف"
          >
            <XCircle size={12} />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-30 top-full mt-1 w-full max-w-xs bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 p-1">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم..."
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:border-amber-400 focus:outline-none"
            />
          </div>
          {loading && (
            <div className="p-2 text-center text-[11px] text-gray-400">
              <Loader2 size={12} className="inline animate-spin" />
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-2 text-center text-[11px] text-gray-400">لا توجد نتائج</div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect({ id: p.id, name: p.name });
                setOpen(false);
                setQ("");
              }}
              className="w-full text-right px-2 py-1.5 text-xs hover:bg-amber-50 border-b border-gray-100 last:border-b-0"
            >
              <span className="text-gray-800">{p.name}</span>
              <span className="text-[9px] text-gray-400 mr-1">({p.type})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CostCenterPicker({
  current,
  onSelect,
  onClear,
}: PickerProps<{ code: string; name: string }>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CostCenterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/assistant/lookup/cost-centers?q=${encodeURIComponent(q)}&limit=15`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const json = await res.json();
          setResults(Array.isArray(json.costCenters) ? json.costCenters : []);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 text-right text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:border-amber-400 focus:outline-none truncate"
        >
          {current ? (
            <span className="flex items-baseline gap-1">
              <span className="font-mono text-gray-700">{current.code}</span>
              <span className="text-gray-700 truncate">{current.name}</span>
            </span>
          ) : (
            <span className="text-gray-400">— لا مركز —</span>
          )}
        </button>
        {current && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="p-1 rounded text-gray-500 hover:bg-gray-100"
            aria-label="إزالة مركز التكلفة"
          >
            <XCircle size={12} />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-30 top-full mt-1 w-full max-w-xs bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 p-1">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث برمز أو اسم..."
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:border-amber-400 focus:outline-none"
            />
          </div>
          {loading && (
            <div className="p-2 text-center text-[11px] text-gray-400">
              <Loader2 size={12} className="inline animate-spin" />
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-2 text-center text-[11px] text-gray-400">لا توجد نتائج</div>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect({ code: c.code, name: c.name });
                setOpen(false);
                setQ("");
              }}
              className="w-full text-right px-2 py-1.5 text-xs hover:bg-amber-50 border-b border-gray-100 last:border-b-0 flex items-baseline gap-1"
            >
              <span className="font-mono text-gray-700">{c.code}</span>
              <span className="text-gray-800 truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reservation editor ──────────────────────────────────────────────

function ReservationEditor({ payload, onCancel, onSubmit, saving, error }: EditorProps) {
  const initial = payload as Record<string, unknown>;
  const [guestName, setGuestName] = useState<string>(String(initial.guestName ?? ""));
  const [phone, setPhone] = useState<string>(String(initial.phone ?? ""));
  const [unitPrice, setUnitPrice] = useState<number>(Number(initial.unitPrice ?? 0));
  const [numNights, setNumNights] = useState<number>(Number(initial.numNights ?? 1));
  const [paidAmount, setPaidAmount] = useState<number>(Number(initial.paidAmount ?? 0));
  const [notes, setNotes] = useState<string>(String(initial.notes ?? ""));
  const totalAmount = +(unitPrice * numNights).toFixed(2);
  const remaining = +(totalAmount - paidAmount).toFixed(2);

  const submit = () =>
    onSubmit({
      guestName: guestName.trim(),
      phone: phone.trim() || null,
      unitPrice,
      numNights,
      totalAmount,
      paidAmount,
      remaining,
      notes: notes.trim() || null,
    });

  return (
    <EditorShell saving={saving} error={error} onCancel={onCancel} onSubmit={submit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Field label="اسم الضيف">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
          />
        </Field>
        <Field label="الهاتف">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
          />
        </Field>
        <Field label="سعر الليلة">
          <input
            inputMode="decimal"
            value={unitPrice ? unitPrice : ""}
            onChange={(e) => setUnitPrice(parseAmount(e.target.value))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 tabular-nums"
          />
        </Field>
        <Field label="عدد الليالي">
          <input
            inputMode="numeric"
            value={numNights}
            onChange={(e) => setNumNights(Math.max(1, Number(e.target.value) || 1))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 tabular-nums"
          />
        </Field>
        <Field label="الإجمالي (محسوب)">
          <input
            disabled
            value={totalAmount.toFixed(2)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50 tabular-nums"
          />
        </Field>
        <Field label="المدفوع">
          <input
            inputMode="decimal"
            value={paidAmount ? paidAmount : ""}
            onChange={(e) => setPaidAmount(parseAmount(e.target.value))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 tabular-nums"
          />
        </Field>
        <Field label="المتبقي (محسوب)">
          <input
            disabled
            value={remaining.toFixed(2)}
            className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-gray-50 tabular-nums"
          />
        </Field>
      </div>
      <Field label="ملاحظات">
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        />
      </Field>
    </EditorShell>
  );
}

// ─── Maintenance / Task / Advance / UnitStatus editors ────────────────

function MaintenanceEditor({ payload, onCancel, onSubmit, saving, error }: EditorProps) {
  const initial = payload as Record<string, unknown>;
  const [description, setDescription] = useState<string>(String(initial.description ?? ""));
  const [contractor, setContractor] = useState<string>(String(initial.contractor ?? ""));
  const [cost, setCost] = useState<number>(Number(initial.cost ?? 0));
  const [notes, setNotes] = useState<string>(String(initial.notes ?? ""));

  return (
    <EditorShell
      saving={saving}
      error={error}
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          description: description.trim(),
          contractor: contractor.trim() || null,
          cost,
          notes: notes.trim() || null,
        })
      }
    >
      <Field label="وصف العطل">
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الفنّي (اختياري)">
          <input
            value={contractor}
            onChange={(e) => setContractor(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
          />
        </Field>
        <Field label="التكلفة">
          <input
            inputMode="decimal"
            value={cost ? cost : ""}
            onChange={(e) => setCost(parseAmount(e.target.value))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 tabular-nums"
          />
        </Field>
      </div>
      <Field label="ملاحظات">
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        />
      </Field>
    </EditorShell>
  );
}

function TaskEditor({ payload, onCancel, onSubmit, saving, error }: EditorProps) {
  const initial = payload as Record<string, unknown>;
  const [title, setTitle] = useState<string>(String(initial.title ?? ""));
  const [description, setDescription] = useState<string>(String(initial.description ?? ""));
  const [priority, setPriority] = useState<string>(String(initial.priority ?? "normal"));

  return (
    <EditorShell
      saving={saving}
      error={error}
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          title: title.trim(),
          description: description.trim() || null,
          priority,
        })
      }
    >
      <Field label="عنوان البطاقة">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        />
      </Field>
      <Field label="الوصف">
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        />
      </Field>
      <Field label="الأولوية">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        >
          <option value="low">منخفضة</option>
          <option value="normal">عادية</option>
          <option value="high">مرتفعة</option>
          <option value="urgent">عاجلة</option>
        </select>
      </Field>
    </EditorShell>
  );
}

function AdvanceEditor({ payload, onCancel, onSubmit, saving, error }: EditorProps) {
  const initial = payload as Record<string, unknown>;
  const [amount, setAmount] = useState<number>(Number(initial.amount ?? 0));
  const [paymentMethod, setPaymentMethod] = useState<string>(
    String(initial.paymentMethod ?? "cash"),
  );
  const [date, setDate] = useState<string>(String(initial.date ?? new Date().toISOString().slice(0, 10)));
  const [notes, setNotes] = useState<string>(String(initial.notes ?? ""));

  return (
    <EditorShell
      saving={saving}
      error={error}
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          amount,
          paymentMethod,
          date,
          notes: notes.trim() || null,
        })
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="القيمة">
          <input
            inputMode="decimal"
            value={amount ? amount : ""}
            onChange={(e) => setAmount(parseAmount(e.target.value))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 tabular-nums"
          />
        </Field>
        <Field label="وسيلة الصرف">
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
          >
            <option value="cash">نقد</option>
            <option value="bank">بنك</option>
            <option value="wallet">محفظة إلكترونية</option>
          </select>
        </Field>
        <Field label="التاريخ">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
          />
        </Field>
      </div>
      <Field label="ملاحظات">
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        />
      </Field>
    </EditorShell>
  );
}

function UnitStatusEditor({ payload, onCancel, onSubmit, saving, error }: EditorProps) {
  const initial = payload as Record<string, unknown>;
  const [toStatus, setToStatus] = useState<string>(String(initial.toStatus ?? "available"));
  const [reason, setReason] = useState<string>(String(initial.reason ?? ""));

  return (
    <EditorShell
      saving={saving}
      error={error}
      onCancel={onCancel}
      onSubmit={() =>
        onSubmit({
          toStatus,
          reason: reason.trim() || null,
        })
      }
    >
      <Field label="الحالة الجديدة">
        <select
          value={toStatus}
          onChange={(e) => setToStatus(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        >
          <option value="available">متاحة</option>
          <option value="occupied">مشغولة</option>
          <option value="maintenance">صيانة</option>
        </select>
      </Field>
      <Field label="السبب">
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        />
      </Field>
    </EditorShell>
  );
}
