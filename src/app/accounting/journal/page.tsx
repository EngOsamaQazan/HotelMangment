"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookText,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Trash2,
  Calendar,
  Eye,
  Search,
} from "lucide-react";
import { cn, formatAmount, formatDate } from "@/lib/utils";
import { Pagination, usePaginatedSlice } from "@/components/Pagination";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { JournalAttachments } from "@/components/accounting/JournalAttachments";

const PAGE_SIZE = 20;

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
}

interface Party {
  id: number;
  name: string;
  type: string;
}

interface JournalLine {
  id: number;
  accountId: number;
  partyId: number | null;
  debit: number;
  credit: number;
  description: string | null;
  account: Account;
  party: Party | null;
}

interface JournalEntry {
  id: number;
  entryNumber: string;
  date: string;
  description: string;
  source: string;
  status: string;
  voidedAt: string | null;
  totalDebit: number;
  totalCredit: number;
  lines: JournalLine[];
}

interface FormLine {
  accountId: string;
  partyId: string;
  debit: string;
  credit: string;
  description: string;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "يدوي",
  reservation: "حجز",
  payment: "دفعة",
  expense: "مصروف",
  maintenance: "صيانة",
  reversal: "عكس",
  opening: "افتتاحي",
  year_close: "إقفال سنوي",
};

function emptyLine(): FormLine {
  return {
    accountId: "",
    partyId: "",
    debit: "",
    credit: "",
    description: "",
  };
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parties, setParties] = useState<Party[]>([]);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    reference: "",
    lines: [emptyLine(), emptyLine()],
  });

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/accounting/journal?${params}`);
      if (!res.ok) throw new Error("فشل تحميل القيود");
      const json = await res.json();
      setEntries(json.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, sourceFilter, search]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Any filter change should bring the user back to the first page.
  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, sourceFilter, search]);

  const pagedEntries = usePaginatedSlice(entries, page, PAGE_SIZE);

  useEffect(() => {
    if (showForm) {
      Promise.all([
        fetch("/api/accounting/accounts").then((r) => r.json()),
        fetch("/api/accounting/parties").then((r) => r.json()),
      ]).then(([a, p]) => {
        setAccounts(a.accounts || []);
        setParties(p.parties || []);
      });
    }
  }, [showForm]);

  const totals = form.lines.reduce(
    (t, l) => ({
      debit: t.debit + (parseFloat(l.debit) || 0),
      credit: t.credit + (parseFloat(l.credit) || 0),
    }),
    { debit: 0, credit: 0 }
  );
  const isBalanced = Math.abs(totals.debit - totals.credit) < 0.005 && totals.debit > 0;

  function addLine() {
    setForm({ ...form, lines: [...form.lines, emptyLine()] });
  }

  function removeLine(idx: number) {
    if (form.lines.length <= 2) return;
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
  }

  function updateLine(idx: number, patch: Partial<FormLine>) {
    const next = [...form.lines];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, lines: next });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isBalanced) {
      alert("القيد غير متوازن");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/accounting/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          description: form.description,
          reference: form.reference || null,
          lines: form.lines
            .filter(
              (l) =>
                l.accountId &&
                (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0)
            )
            .map((l) => ({
              accountId: Number(l.accountId),
              partyId: l.partyId ? Number(l.partyId) : null,
              debit: l.debit ? Number(l.debit) : 0,
              credit: l.credit ? Number(l.credit) : 0,
              description: l.description || null,
            })),
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "فشل");
      }
      const created = await res.json();

      if (pendingAttachments.length > 0 && created?.id) {
        const fd = new FormData();
        for (const f of pendingAttachments) fd.append("files", f);
        const upRes = await fetch(
          `/api/accounting/journal/${created.id}/attachments`,
          { method: "POST", body: fd }
        );
        if (!upRes.ok) {
          const j = await upRes.json().catch(() => ({}));
          alert(
            "تم حفظ القيد لكن فشل رفع بعض المرفقات: " +
              (j.error || "خطأ غير معروف") +
              "\nيمكنك إعادة رفعها من شاشة عرض القيد."
          );
        }
      }

      setShowForm(false);
      setPendingAttachments([]);
      setForm({
        date: new Date().toISOString().split("T")[0],
        description: "",
        reference: "",
        lines: [emptyLine(), emptyLine()],
      });
      fetchEntries();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="القيود المحاسبية"
        icon={<BookText size={24} />}
        actions={
          <Can permission="accounting.journal:create">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium tap-44"
            >
              <Plus size={18} /> <span>قيد يدوي</span>
            </button>
          </Can>
        }
      />

      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm">
        <FilterBar>
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-xs text-gray-400 shrink-0">من</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm w-full min-w-0"
            />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-xs text-gray-400 shrink-0">إلى</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm w-full min-w-0"
            />
          </div>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm min-w-0"
          >
            <option value="all">كل المصادر</option>
            <option value="manual">يدوي</option>
            <option value="reservation">حجز</option>
            <option value="payment">دفعة</option>
            <option value="expense">مصروف</option>
            <option value="maintenance">صيانة</option>
            <option value="reversal">عكس</option>
          </select>
          <div className="flex items-center gap-2 flex-1 min-w-[10rem]">
            <Search size={16} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="رقم القيد أو الوصف"
              className="w-full border rounded-lg px-3 py-1.5 text-sm min-w-0"
            />
          </div>
        </FilterBar>
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
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <BookText size={48} className="mb-3 opacity-50" />
          <p>لا توجد قيود</p>
        </div>
      ) : (
        <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-right px-4 py-3 font-medium">رقم القيد</th>
                  <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                  <th className="text-right px-4 py-3 font-medium">البيان</th>
                  <th className="text-right px-4 py-3 font-medium">المصدر</th>
                  <th className="text-right px-4 py-3 font-medium">المبلغ</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedEntries.map((e) => {
                  const isVoided = Boolean(e.voidedAt) || e.status === "void";
                  return (
                  <tr
                    key={e.id}
                    className={cn(
                      "hover:bg-gray-50/50",
                      isVoided && "opacity-60 line-through"
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-primary">
                      {e.entryNumber}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      <Calendar size={12} className="inline ml-1 text-gray-400" />
                      {formatDate(e.date)}
                    </td>
                    <td className="px-4 py-3 text-gray-800">{e.description}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                        {SOURCE_LABELS[e.source] || e.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-primary">
                      {formatAmount(e.totalDebit)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block px-2.5 py-1 text-xs font-medium rounded-full",
                          isVoided
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        )}
                      >
                        {isVoided ? "معكوس" : "مرحّل"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/accounting/journal/${e.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Eye size={14} /> عرض
                      </Link>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-gray-100">
            {pagedEntries.map((e) => {
              const isVoided = Boolean(e.voidedAt) || e.status === "void";
              return (
              <div
                key={e.id}
                className={cn(
                  "p-3 space-y-2",
                  isVoided && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-primary text-sm font-semibold">
                        {e.entryNumber}
                      </span>
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 text-[10px] font-medium rounded-full",
                          isVoided
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700",
                        )}
                      >
                        {isVoided ? "معكوس" : "مرحّل"}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "text-sm text-gray-800 mt-1 break-words",
                        isVoided && "line-through",
                      )}
                    >
                      {e.description}
                    </p>
                  </div>
                  <span className="font-bold text-primary text-sm tabular-nums shrink-0">
                    {formatAmount(e.totalDebit)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDate(e.date)}
                  </span>
                  <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                    {SOURCE_LABELS[e.source] || e.source}
                  </span>
                  <Link
                    href={`/accounting/journal/${e.id}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Eye size={14} /> عرض
                  </Link>
                </div>
              </div>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-gold/20">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={entries.length}
              onChange={setPage}
            />
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-4xl overflow-hidden sm:my-8 max-h-[95vh] flex flex-col">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex items-center justify-between border-b shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-gray-800">قيد يدوي جديد</h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-gray-200"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) =>
                      setForm({ ...form, date: e.target.value })
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    البيان
                  </label>
                  <input
                    type="text"
                    required
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    أسطر القيد
                  </label>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus size={12} /> إضافة سطر
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="px-2 py-2 text-right font-medium">الحساب</th>
                        <th className="px-2 py-2 text-right font-medium">الطرف</th>
                        <th className="px-2 py-2 text-right font-medium">مدين</th>
                        <th className="px-2 py-2 text-right font-medium">دائن</th>
                        <th className="px-2 py-2 text-right font-medium">بيان</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.lines.map((line, idx) => (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="px-2 py-1">
                            <select
                              value={line.accountId}
                              onChange={(e) =>
                                updateLine(idx, { accountId: e.target.value })
                              }
                              className="w-full border rounded px-2 py-1.5 text-xs"
                              required
                            >
                              <option value="">—</option>
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} - {a.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <select
                              value={line.partyId}
                              onChange={(e) =>
                                updateLine(idx, { partyId: e.target.value })
                              }
                              className="w-full border rounded px-2 py-1.5 text-xs"
                            >
                              <option value="">—</option>
                              {parties.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.debit}
                              onChange={(e) =>
                                updateLine(idx, {
                                  debit: e.target.value,
                                  credit: e.target.value ? "" : line.credit,
                                })
                              }
                              className="w-24 border rounded px-2 py-1.5 text-xs text-left"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.credit}
                              onChange={(e) =>
                                updateLine(idx, {
                                  credit: e.target.value,
                                  debit: e.target.value ? "" : line.debit,
                                })
                              }
                              className="w-24 border rounded px-2 py-1.5 text-xs text-left"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) =>
                                updateLine(idx, { description: e.target.value })
                              }
                              className="w-full border rounded px-2 py-1.5 text-xs"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              disabled={form.lines.length <= 2}
                              className="text-danger hover:bg-red-50 rounded p-1 disabled:opacity-30"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-bold">
                        <td className="px-2 py-2" colSpan={2}>
                          الإجمالي
                        </td>
                        <td className="px-2 py-2">{formatAmount(totals.debit)}</td>
                        <td className="px-2 py-2">{formatAmount(totals.credit)}</td>
                        <td
                          className={cn(
                            "px-2 py-2",
                            isBalanced ? "text-green-700" : "text-red-700"
                          )}
                          colSpan={2}
                        >
                          {isBalanced
                            ? "متوازن ✓"
                            : `فرق: ${formatAmount(Math.abs(totals.debit - totals.credit))}`}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  مرجع (اختياري)
                </label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) =>
                    setForm({ ...form, reference: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="border-t border-gray-100 pt-3">
                <JournalAttachments
                  onPendingFilesChange={setPendingAttachments}
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 sm:px-6 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting || !isBalanced}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark font-medium text-sm disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Plus size={18} />
                  )}
                  حفظ القيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
