"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Loader2, AlertCircle, Lock, Eye, X } from "lucide-react";
import Link from "next/link";
import { cn, formatAmount } from "@/lib/utils";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  normalBalance: string;
  parentId: number | null;
  isSystem: boolean;
  isActive: boolean;
  description: string | null;
  balance?: number;
}

const TYPE_LABELS: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};

const TYPE_COLORS: Record<string, string> = {
  asset: "bg-blue-50 text-blue-700 border-blue-200",
  liability: "bg-orange-50 text-orange-700 border-orange-200",
  equity: "bg-purple-50 text-purple-700 border-purple-200",
  revenue: "bg-green-50 text-green-700 border-green-200",
  expense: "bg-red-50 text-red-700 border-red-200",
};

/**
 * Pick the most-likely parent for a freshly typed account code.
 *
 * Strategy: among accounts of the same `type`, prefer the one whose `code`
 * is the LONGEST proper prefix of the new code, falling back to the
 * type's root account (e.g. "5000" for any 5xxx expense).
 *
 * Examples in this codebase's 4-digit chart:
 *   newCode="5025", type=expense → "5000 المصروفات" (root)
 *   newCode="5081", type=expense → "5080 خدمات تقنية" if it exists, else "5000"
 *   newCode="1015", type=asset   → "1010 الصندوق النقدي" if it exists, else "1000"
 */
function suggestParent(
  newCode: string,
  type: string,
  pool: Account[],
): Account | null {
  const code = (newCode || "").trim();
  if (!code) return null;
  const candidates = pool
    .filter((a) => a.type === type && a.code !== code)
    .filter((a) => code.startsWith(a.code) && a.code.length < code.length);
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.code.length - a.code.length);
    return candidates[0];
  }
  // Fallback: the root of the same type (parentId == null with shortest code).
  const roots = pool
    .filter((a) => a.type === type && a.parentId == null)
    .sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
  return roots[0] ?? null;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "asset" as "asset" | "liability" | "equity" | "revenue" | "expense",
    subtype: "",
    normalBalance: "debit" as "debit" | "credit",
    parentId: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  /** Tracks whether the user has explicitly chosen a parent. Once true, the
   *  auto-suggest stops overriding their choice. */
  const [parentTouched, setParentTouched] = useState(false);

  const suggestedParent = useMemo(
    () => suggestParent(form.code, form.type, accounts),
    [form.code, form.type, accounts],
  );

  /** id → account map for cheap parent lookups in the table. */
  const accountById = useMemo(() => {
    const m = new Map<number, Account>();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);

  // Auto-fill the parent based on the typed code, but never override an
  // explicit user pick (`parentTouched`).
  useEffect(() => {
    if (parentTouched) return;
    const next = suggestedParent ? String(suggestedParent.id) : "";
    if (next !== form.parentId) {
      setForm((f) => ({ ...f, parentId: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedParent, parentTouched]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ balances: "1" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/accounting/accounts?${params}`);
      if (!res.ok) throw new Error("فشل تحميل الحسابات");
      const json = await res.json();
      setAccounts(json.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          parentId: form.parentId || null,
          normalBalance:
            ["asset", "expense"].includes(form.type) ? "debit" : "credit",
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "فشل إضافة الحساب");
      }
      setShowForm(false);
      setForm({
        code: "",
        name: "",
        type: "asset",
        subtype: "",
        normalBalance: "debit",
        parentId: "",
        description: "",
      });
      setParentTouched(false);
      fetchAccounts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="دليل الحسابات"
        icon={<BookOpen size={24} />}
        actions={
          <Can permission="accounting.accounts:create">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium tap-44"
            >
              <Plus size={18} />
              <span>إضافة حساب</span>
            </button>
          </Can>
        }
      />

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {[
          { key: "all", label: "الكل" },
          { key: "asset", label: "الأصول" },
          { key: "liability", label: "الخصوم" },
          { key: "equity", label: "حقوق الملكية" },
          { key: "revenue", label: "الإيرادات" },
          { key: "expense", label: "المصروفات" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTypeFilter(t.key)}
            className={cn(
              "shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors border tap-44",
              typeFilter === t.key
                ? "bg-primary text-white border-primary"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <AlertCircle size={36} className="text-danger" />
          <p className="text-danger">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-right px-4 py-3 font-medium">الرمز</th>
                  <th className="text-right px-4 py-3 font-medium">اسم الحساب</th>
                  <th className="text-right px-4 py-3 font-medium">النوع</th>
                  <th className="text-right px-4 py-3 font-medium">الرصيد الطبيعي</th>
                  <th className="text-right px-4 py-3 font-medium">الرصيد الحالي</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono font-medium text-primary">
                      {a.code}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {a.name}
                      {a.parentId != null && accountById.get(a.parentId) && (
                        <span className="block text-[11px] text-gray-400 mt-0.5">
                          تحت:{" "}
                          <span className="font-mono">
                            {accountById.get(a.parentId)!.code}
                          </span>{" "}
                          {accountById.get(a.parentId)!.name}
                        </span>
                      )}
                      {a.description && (
                        <span className="block text-xs text-gray-400 mt-0.5">
                          {a.description}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block px-2.5 py-1 text-xs font-medium rounded-full border",
                          TYPE_COLORS[a.type]
                        )}
                      >
                        {TYPE_LABELS[a.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.normalBalance === "debit" ? "مدين" : "دائن"}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 font-bold",
                        (a.balance ?? 0) > 0
                          ? "text-green-700"
                          : (a.balance ?? 0) < 0
                          ? "text-red-700"
                          : "text-gray-400"
                      )}
                    >
                      {formatAmount(a.balance ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      {a.isSystem && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <Lock size={12} />
                          نظامي
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/accounting/ledger?accountId=${a.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Eye size={14} /> الأستاذ
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {accounts.map((a) => (
              <div key={a.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-primary text-sm">
                        {a.code}
                      </span>
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border",
                          TYPE_COLORS[a.type],
                        )}
                      >
                        {TYPE_LABELS[a.type]}
                      </span>
                      {a.isSystem && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                          <Lock size={10} /> نظامي
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-1 break-words">
                      {a.name}
                    </p>
                    {a.parentId != null && accountById.get(a.parentId) && (
                      <p className="text-[11px] text-gray-400 mt-0.5 break-words">
                        تحت:{" "}
                        <span className="font-mono">
                          {accountById.get(a.parentId)!.code}
                        </span>{" "}
                        {accountById.get(a.parentId)!.name}
                      </p>
                    )}
                    {a.description && (
                      <p className="text-xs text-gray-400 mt-0.5 break-words">
                        {a.description}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/accounting/ledger?accountId=${a.id}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                  >
                    <Eye size={14} /> الأستاذ
                  </Link>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-500">
                    طبيعة: {a.normalBalance === "debit" ? "مدين" : "دائن"}
                  </span>
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      (a.balance ?? 0) > 0
                        ? "text-green-700"
                        : (a.balance ?? 0) < 0
                          ? "text-red-700"
                          : "text-gray-400",
                    )}
                  >
                    {formatAmount(a.balance ?? 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg overflow-hidden max-h-[95vh] flex flex-col">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex items-center justify-between border-b shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-gray-800">إضافة حساب جديد</h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-gray-200"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    رمز الحساب
                  </label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="مثال: 5060"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    النوع
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as typeof form.type,
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="asset">أصل</option>
                    <option value="liability">خصم</option>
                    <option value="equity">حقوق ملكية</option>
                    <option value="revenue">إيراد</option>
                    <option value="expense">مصروف</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  اسم الحساب
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    الحساب الأب
                  </label>
                  {parentTouched && suggestedParent && (
                    <button
                      type="button"
                      onClick={() => setParentTouched(false)}
                      className="text-[11px] text-primary hover:underline"
                      title="استخدام الاقتراح التلقائي"
                    >
                      اقتراح: {suggestedParent.code} — {suggestedParent.name}
                    </button>
                  )}
                </div>
                <SearchableSelect
                  value={form.parentId}
                  onValueChange={(v) => {
                    setParentTouched(true);
                    setForm((f) => ({ ...f, parentId: v }));
                  }}
                  options={accounts
                    .filter((a) => a.type === form.type && a.code !== form.code)
                    .map((a) => ({
                      value: String(a.id),
                      label: `${a.code} - ${a.name}`,
                      searchText: `${a.code} ${a.name}`,
                    }))}
                  placeholder="(بدون أب — حساب جذري)"
                  searchPlaceholder="بحث في الحسابات..."
                  emptyMessage="لا يوجد حساب من نفس النوع"
                  clearable
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  يحدد مكان الحساب في شجرة الحسابات. عادةً اختر الحساب الجذري
                  من نفس النوع (مثلاً 5000 المصروفات لأي حساب 5xxx).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الوصف (اختياري)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setParentTouched(false);
                  }}
                  className="px-4 sm:px-6 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark font-medium text-sm disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Plus size={18} />
                  )}
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
