"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  Scissors,
  Plus,
  Pencil,
  Power,
  Trash2,
  X,
  Calendar,
  CheckCircle,
  Info,
} from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

type CalcType = "fixed" | "percent_gross" | "percent_net";
type Mode = "continuous" | "installment";
type Category = "insurance" | "permit" | "court" | "loan" | "other";

interface DeductionRow {
  id: number;
  name: string;
  category: Category;
  calcType: CalcType;
  amount: number | null;
  percent: number | null;
  mode: Mode;
  totalAmount: number | null;
  startYear: number;
  startMonth: number;
  endYear: number | null;
  endMonth: number | null;
  priority: number;
  isActive: boolean;
  notes: string | null;
  liabilityAccount: { id: number; code: string; name: string } | null;
  appliedSoFar: number;
  lastAppliedAt: { year: number; month: number } | null;
  remaining: number | null;
}

interface AccountOpt {
  id: number;
  code: string;
  name: string;
  type: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  insurance: "تأمين صحي",
  permit: "تصريح عمل",
  court: "حكم محكمة",
  loan: "قرض/سلفة طويلة",
  other: "أخرى",
};

const CALC_LABEL: Record<CalcType, string> = {
  fixed: "مبلغ ثابت",
  percent_gross: "% من الإجمالي",
  percent_net: "% من الصافي",
};

const MODE_LABEL: Record<Mode, string> = {
  continuous: "مستمر",
  installment: "أقساط",
};

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function ymLabel(y: number | null | undefined, m: number | null | undefined) {
  if (y == null || m == null) return "—";
  return `${ARABIC_MONTHS[m - 1]} ${y}`;
}

const today = new Date();

export default function DeductionsPage() {
  const params = useParams();
  const partyId = params.partyId as string;

  const [data, setData] = useState<{
    party: { id: number; name: string; isActive: boolean };
    deductions: DeductionRow[];
  } | null>(null);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [editing, setEditing] = useState<DeductionRow | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/accounting/payroll/${partyId}/deductions`),
        fetch(`/api/accounting/accounts?type=liability`).catch(() => null),
      ]);
      if (!r1.ok) {
        const j = await r1.json().catch(() => ({}));
        throw new Error(j.error || "فشل التحميل");
      }
      setData(await r1.json());
      if (r2 && r2.ok) {
        const j = await r2.json();
        setAccounts(
          (j.accounts as AccountOpt[]).filter((a) => a.type === "liability")
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const active = useMemo(
    () => data?.deductions.filter((d) => d.isActive) ?? [],
    [data]
  );
  const inactive = useMemo(
    () => data?.deductions.filter((d) => !d.isActive) ?? [],
    [data]
  );

  async function handleSave(payload: Record<string, unknown>, id?: number) {
    const url = id
      ? `/api/accounting/payroll/${partyId}/deductions/${id}`
      : `/api/accounting/payroll/${partyId}/deductions`;
    const res = await fetch(url, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "فشل الحفظ");
    setFlash(id ? "تم تعديل الاقتطاع" : "تم إنشاء الاقتطاع");
    setEditing(null);
    setCreating(false);
    await fetchAll();
  }

  async function handleEnd(d: DeductionRow) {
    if (!confirm(`هل تريد إيقاف "${d.name}" بدءاً من هذا الشهر؟`)) return;
    const res = await fetch(
      `/api/accounting/payroll/${partyId}/deductions/${d.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: false,
          endYear: today.getFullYear(),
          endMonth: today.getMonth() + 1,
        }),
      }
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j.error || "فشل الإيقاف");
      return;
    }
    setFlash(`تم إيقاف "${d.name}"`);
    await fetchAll();
  }

  async function handleDelete(d: DeductionRow) {
    if (!confirm(`هل تريد حذف "${d.name}" نهائياً؟`)) return;
    const res = await fetch(
      `/api/accounting/payroll/${partyId}/deductions/${d.id}`,
      { method: "DELETE" }
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j.error || "فشل الحذف");
      return;
    }
    setFlash(
      j.mode === "soft_delete"
        ? "تم أرشفة الاقتطاع (لوجود تطبيقات سابقة)"
        : "تم حذف الاقتطاع"
    );
    await fetchAll();
  }

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <div className="flex flex-col items-center py-20 gap-3">
          <AlertCircle size={48} className="text-danger" />
          <p className="text-danger">{error ?? "خطأ"}</p>
          <Link
            href={`/accounting/payroll/${partyId}`}
            className="text-primary hover:underline"
          >
            العودة
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={`اقتطاعات الراتب — ${data.party.name}`}
        icon={<Scissors size={22} />}
        backHref={`/accounting/payroll/${partyId}`}
        actions={
          <Can permission="accounting.parties:manage_deductions">
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark border border-gold/40 shadow-md transition-colors tap-44"
            >
              <Plus size={16} /> اقتطاع جديد
            </button>
          </Can>
        }
      />

      {flash && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-sm text-green-800">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <span className="flex-1">{flash}</span>
          <button
            onClick={() => setFlash(null)}
            className="p-1 rounded hover:bg-green-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-800 leading-relaxed">
        <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
        <p>
          الاقتطاعات لا تظهر كمصروف — هي خصومات على الموظف تُسجَّل دائناً على
          حساب خصوم محدّد (تأمين، محكمة، إلخ) عند تسجيل الراتب الشهري. يمكن أن
          يكون الاقتطاع <span className="font-semibold">مستمرّاً</span> (شهرياً
          بلا حد) أو <span className="font-semibold">أقساطاً</span> (إجمالي
          ينتهي بانتهاء سداده). النِّسب تُحسب إما من الإجمالي أو من الصافي بعد
          الخصومات الأخرى.
        </p>
      </div>

      <DeductionTable
        title="اقتطاعات نشطة"
        rows={active}
        onEdit={(d) => setEditing(d)}
        onEnd={handleEnd}
        onDelete={handleDelete}
      />

      {inactive.length > 0 && (
        <DeductionTable
          title="أرشيف منتهية"
          rows={inactive}
          onEdit={(d) => setEditing(d)}
          onEnd={null}
          onDelete={handleDelete}
          archived
        />
      )}

      {(creating || editing) && (
        <DeductionModal
          mode={creating ? "create" : "edit"}
          row={editing}
          accounts={accounts}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </PageShell>
  );
}

function DeductionTable({
  title,
  rows,
  onEdit,
  onEnd,
  onDelete,
  archived,
}: {
  title: string;
  rows: DeductionRow[];
  onEdit: (d: DeductionRow) => void;
  onEnd: ((d: DeductionRow) => void) | null;
  onDelete: (d: DeductionRow) => void;
  archived?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
      <div
        className={cn(
          "px-5 py-3 font-bold",
          archived ? "bg-gray-100 text-gray-600" : "bg-green-50 text-green-800"
        )}
      >
        {title} ({rows.length})
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="text-right px-4 py-3 font-medium">الاسم</th>
              <th className="text-right px-4 py-3 font-medium">الفئة</th>
              <th className="text-right px-4 py-3 font-medium">النوع</th>
              <th className="text-right px-4 py-3 font-medium">القيمة</th>
              <th className="text-right px-4 py-3 font-medium">الوضع</th>
              <th className="text-right px-4 py-3 font-medium">الفترة</th>
              <th className="text-right px-4 py-3 font-medium">التقدّم</th>
              <th className="text-right px-4 py-3 font-medium">حساب الخصوم</th>
              <th className="text-left px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((d) => (
              <tr key={d.id} className={cn(archived && "opacity-60")}>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {d.name}
                  {d.notes && (
                    <p className="text-xs text-gray-400 mt-0.5">{d.notes}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {CATEGORY_LABEL[d.category]}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {CALC_LABEL[d.calcType]}
                </td>
                <td className="px-4 py-3 font-medium tabular-nums">
                  {d.calcType === "fixed"
                    ? `${formatAmount(d.amount ?? 0)} د.أ`
                    : `${((d.percent ?? 0) * 100).toFixed(2)}%`}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {MODE_LABEL[d.mode]}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  من {ymLabel(d.startYear, d.startMonth)}
                  {d.endYear && (
                    <span className="block">
                      حتى {ymLabel(d.endYear, d.endMonth)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums">
                  {d.mode === "installment" && d.totalAmount != null ? (
                    <>
                      <div className="text-green-700 font-medium">
                        {formatAmount(d.appliedSoFar)} /{" "}
                        {formatAmount(d.totalAmount)}
                      </div>
                      <div className="text-red-600">
                        متبقي {formatAmount(d.remaining ?? 0)}
                      </div>
                    </>
                  ) : (
                    <span className="text-gray-500">
                      {d.appliedSoFar > 0
                        ? `${formatAmount(d.appliedSoFar)} د.أ`
                        : "—"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {d.liabilityAccount
                    ? `${d.liabilityAccount.code} — ${d.liabilityAccount.name}`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Can permission="accounting.parties:manage_deductions">
                      <button
                        onClick={() => onEdit(d)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                        title="تعديل"
                      >
                        <Pencil size={14} />
                      </button>
                      {onEnd && (
                        <button
                          onClick={() => onEnd(d)}
                          className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
                          title="إيقاف"
                        >
                          <Power size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(d)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Can>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-gray-100">
        {rows.map((d) => (
          <div key={d.id} className={cn("p-3 space-y-2", archived && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800">{d.name}</p>
                <p className="text-xs text-gray-400">
                  {CATEGORY_LABEL[d.category]} · {CALC_LABEL[d.calcType]} ·{" "}
                  {MODE_LABEL[d.mode]}
                </p>
              </div>
              <div className="text-left shrink-0">
                <p className="font-bold tabular-nums text-primary">
                  {d.calcType === "fixed"
                    ? `${formatAmount(d.amount ?? 0)} د.أ`
                    : `${((d.percent ?? 0) * 100).toFixed(2)}%`}
                </p>
              </div>
            </div>
            {d.mode === "installment" && d.totalAmount != null && (
              <div className="text-xs tabular-nums">
                <span className="text-green-700">
                  {formatAmount(d.appliedSoFar)}/{formatAmount(d.totalAmount)}
                </span>{" "}
                <span className="text-red-600">
                  · متبقي {formatAmount(d.remaining ?? 0)}
                </span>
              </div>
            )}
            <div className="text-xs text-gray-500">
              من {ymLabel(d.startYear, d.startMonth)}
              {d.endYear && ` حتى ${ymLabel(d.endYear, d.endMonth)}`}
            </div>
            <Can permission="accounting.parties:manage_deductions">
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => onEdit(d)}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs flex items-center gap-1"
                >
                  <Pencil size={12} /> تعديل
                </button>
                {onEnd && (
                  <button
                    onClick={() => onEnd(d)}
                    className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs flex items-center gap-1"
                  >
                    <Power size={12} /> إيقاف
                  </button>
                )}
                <button
                  onClick={() => onDelete(d)}
                  className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs flex items-center gap-1"
                >
                  <Trash2 size={12} /> حذف
                </button>
              </div>
            </Can>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeductionModal({
  mode,
  row,
  accounts,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  row: DeductionRow | null;
  accounts: AccountOpt[];
  onClose: () => void;
  onSave: (payload: Record<string, unknown>, id?: number) => Promise<void>;
}) {
  const isEdit = mode === "edit" && row != null;

  // For edits we limit to: name, notes, priority, endYear/Month, isActive, liabilityAccountId
  const [name, setName] = useState(row?.name ?? "");
  const [category, setCategory] = useState<Category>(
    (row?.category as Category) ?? "other"
  );
  const [calcType, setCalcType] = useState<CalcType>(
    (row?.calcType as CalcType) ?? "fixed"
  );
  const [amountStr, setAmountStr] = useState(
    row?.amount != null ? String(row.amount) : ""
  );
  const [percentStr, setPercentStr] = useState(
    row?.percent != null ? String((row.percent * 100).toFixed(2)) : ""
  );
  const [modeVal, setModeVal] = useState<Mode>(
    (row?.mode as Mode) ?? "continuous"
  );
  const [totalStr, setTotalStr] = useState(
    row?.totalAmount != null ? String(row.totalAmount) : ""
  );
  const [startYear, setStartYear] = useState<number>(
    row?.startYear ?? today.getFullYear()
  );
  const [startMonth, setStartMonth] = useState<number>(
    row?.startMonth ?? today.getMonth() + 1
  );
  const [hasEnd, setHasEnd] = useState<boolean>(row?.endYear != null);
  const [endYear, setEndYear] = useState<number>(
    row?.endYear ?? today.getFullYear() + 1
  );
  const [endMonth, setEndMonth] = useState<number>(
    row?.endMonth ?? today.getMonth() + 1
  );
  const [accountId, setAccountId] = useState<number | "">(
    row?.liabilityAccount?.id ?? ""
  );
  const [notes, setNotes] = useState(row?.notes ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!name.trim()) return setErr("الاسم مطلوب");

    const payload: Record<string, unknown> = {
      name: name.trim(),
      notes: notes.trim() || null,
      liabilityAccountId: accountId === "" ? null : Number(accountId),
      endYear: hasEnd ? endYear : null,
      endMonth: hasEnd ? endMonth : null,
    };

    if (!isEdit) {
      payload.category = category;
      payload.calcType = calcType;
      payload.mode = modeVal;
      payload.startYear = startYear;
      payload.startMonth = startMonth;

      if (calcType === "fixed") {
        const a = Number(amountStr);
        if (!Number.isFinite(a) || a <= 0)
          return setErr("المبلغ يجب أن يكون أكبر من صفر");
        payload.amount = a;
      } else {
        const p = Number(percentStr);
        if (!Number.isFinite(p) || p <= 0 || p > 100)
          return setErr("النسبة يجب أن تكون بين 0 و 100");
        payload.percent = p;
      }
      if (modeVal === "installment") {
        const t = Number(totalStr);
        if (!Number.isFinite(t) || t <= 0)
          return setErr("الإجمالي مطلوب لوضع الأقساط");
        payload.totalAmount = t;
      }
    }

    setSubmitting(true);
    try {
      await onSave(payload, row?.id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  const yearOpts = useMemo(() => {
    const y = today.getFullYear();
    return Array.from({ length: 10 }, (_, i) => y - 1 + i);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100 shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
            <Scissors size={20} className="text-primary" />
            {isEdit ? "تعديل اقتطاع" : "اقتطاع جديد"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors shrink-0 disabled:opacity-50"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              الاسم
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="مثال: تأمين صحي شركة الفجر"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              autoFocus
            />
          </div>

          {!isEdit && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الفئة
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    نوع الحساب
                  </label>
                  <select
                    value={calcType}
                    onChange={(e) => setCalcType(e.target.value as CalcType)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    {Object.entries(CALC_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {calcType === "fixed" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المبلغ الشهري (د.أ)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    النسبة (%){" "}
                    <span className="text-xs text-gray-400">
                      {calcType === "percent_gross"
                        ? "من الراتب الإجمالي + العمولات"
                        : "من الصافي بعد الخصومات الأخرى"}
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="100"
                    value={percentStr}
                    onChange={(e) => setPercentStr(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  الوضع
                </label>
                <div className="flex gap-2">
                  {(["continuous", "installment"] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setModeVal(m)}
                      className={cn(
                        "flex-1 px-4 py-2 rounded-lg text-sm border transition-colors",
                        modeVal === m
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>

              {modeVal === "installment" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المبلغ الإجمالي للأقساط (د.أ){" "}
                    <span className="text-xs text-gray-400">
                      يتوقف الاقتطاع عند بلوغ هذا المبلغ
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={totalStr}
                    onChange={(e) => setTotalStr(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Calendar size={14} /> تاريخ البدء
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={startMonth}
                    onChange={(e) => setStartMonth(Number(e.target.value))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    {ARABIC_MONTHS.map((m, i) => (
                      <option key={i + 1} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    {yearOpts.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <input
                type="checkbox"
                checked={hasEnd}
                onChange={(e) => setHasEnd(e.target.checked)}
                className="rounded"
              />
              <span>تحديد تاريخ انتهاء</span>
            </label>
            {hasEnd && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={endMonth}
                  onChange={(e) => setEndMonth(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  {ARABIC_MONTHS.map((m, i) => (
                    <option key={i + 1} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={endYear}
                  onChange={(e) => setEndYear(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  {yearOpts.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              حساب الخصوم{" "}
              <span className="text-xs text-gray-400">
                (الجهة المستفيدة من الاقتطاع)
              </span>
            </label>
            <SearchableSelect
              value={accountId === "" ? "" : String(accountId)}
              onValueChange={(v) =>
                setAccountId(v === "" ? "" : Number(v))
              }
              options={accounts.map((a) => ({
                value: String(a.id),
                label: `${a.code} — ${a.name}`,
                searchText: `${a.code} ${a.name}`,
              }))}
              placeholder="— افتراضي حسب الفئة —"
              searchPlaceholder="بحث في الحسابات..."
              clearable
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ملاحظة (اختياري)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="مثال: حكم محكمة #123 لتاريخ ..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>

          {isEdit && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              لا يمكن تعديل: نوع الحساب، المبلغ/النسبة، الوضع، إجمالي الأقساط،
              تاريخ البدء — لو احتجت ذلك أوقف هذا الاقتطاع وأنشئ غيره.
            </div>
          )}

          {err && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={16} />
              {err}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium text-sm disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <CheckCircle size={18} />
              )}
              {isEdit ? "حفظ التعديلات" : "إنشاء"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
