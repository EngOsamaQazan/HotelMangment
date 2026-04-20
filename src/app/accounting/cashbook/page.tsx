"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Pagination, usePaginatedSlice } from "@/components/Pagination";

const PAGE_SIZE = 20;
import {
  Wallet,
  Landmark,
  Smartphone,
  Plus,
  X,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Search,
  ArrowLeftRight,
} from "lucide-react";
import { cn, formatDate, formatAmount } from "@/lib/utils";

type AccountKey = "cash" | "bank" | "wallet";

const ACCOUNT_META: Record<
  AccountKey,
  { code: string; label: string; icon: typeof Wallet }
> = {
  cash: { code: "1010", label: "الصندوق النقدي", icon: Wallet },
  bank: { code: "1020", label: "الحساب البنكي", icon: Landmark },
  wallet: { code: "1030", label: "المحفظة الإلكترونية", icon: Smartphone },
};

interface AccountSummary {
  id: number;
  code: string;
  name: string;
  balance: number;
}

interface Counterpart {
  accountCode: string;
  accountName: string;
  partyName: string | null;
  debit: number;
  credit: number;
}

interface LedgerRow {
  id: number;
  date: string;
  entryId: number;
  entryNumber: string;
  entrySource: string;
  entryReference: string | null;
  description: string;
  lineDescription: string | null;
  partyId: number | null;
  partyName: string | null;
  debit: number;
  credit: number;
  balance: number;
  counterSummary: string | null;
  counterparts: Counterpart[];
}

interface LedgerData {
  account: { id: number; code: string; name: string; normalBalance: string };
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  rows: LedgerRow[];
}

interface Party {
  id: number;
  name: string;
  type: string;
}

interface FormAccount {
  id: number;
  code: string;
  name: string;
  type: string;
}

interface FormData {
  date: string;
  description: string;
  amount: string;
  type: "income" | "expense";
  reservationId: string;
  bankRef: string;
  partyId: string;
  counterAccountCode: string;
}

const PARTY_TYPE_LABELS: Record<string, string> = {
  guest: "نزيل",
  partner: "شريك",
  supplier: "مورّد",
  employee: "موظف",
  lender: "مُقرض",
  other: "أخرى",
};

const SOURCE_LABELS: Record<string, string> = {
  reservation: "حجز",
  payment: "دفعة",
  expense: "مصروف",
  maintenance: "صيانة",
  manual: "يدوي",
  reversal: "عكس قيد",
  opening: "رصيد افتتاحي",
};

const emptyForm: FormData = {
  date: "",
  description: "",
  amount: "",
  type: "income",
  reservationId: "",
  bankRef: "",
  partyId: "",
  counterAccountCode: "",
};

function buildEmptyForm(): FormData {
  return { ...emptyForm, date: new Date().toISOString().split("T")[0] };
}

export default function CashbookPage() {
  const [activeTab, setActiveTab] = useState<AccountKey>("cash");
  const [accountsMap, setAccountsMap] = useState<Record<AccountKey, AccountSummary | null>>({
    cash: null,
    bank: null,
    wallet: null,
  });
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [parties, setParties] = useState<Party[]>([]);
  const [formAccounts, setFormAccounts] = useState<FormAccount[]>([]);

  useEffect(() => {
    if (showForm && parties.length === 0) {
      fetch("/api/accounting/parties")
        .then((r) => r.json())
        .then((j) => setParties(j.parties || []))
        .catch(() => {});
    }
    if (showForm && formAccounts.length === 0) {
      fetch("/api/accounting/accounts")
        .then((r) => r.json())
        .then((j) => setFormAccounts(j.accounts || []))
        .catch(() => {});
    }
  }, [showForm, parties.length, formAccounts.length]);

  const fetchAccounts = useCallback(async () => {
    const params = new URLSearchParams({ balances: "1" });
    if (dateTo) params.set("asOf", dateTo);
    const res = await fetch(`/api/accounting/accounts?${params}`);
    if (!res.ok) throw new Error("فشل تحميل أرصدة حسابات السيولة");
    const json = await res.json();
    const next: Record<AccountKey, AccountSummary | null> = {
      cash: null,
      bank: null,
      wallet: null,
    };
    for (const a of json.accounts || []) {
      const entry: AccountSummary = {
        id: a.id,
        code: a.code,
        name: a.name,
        balance: Number(a.balance || 0),
      };
      if (a.code === "1010") next.cash = entry;
      if (a.code === "1020") next.bank = entry;
      if (a.code === "1030") next.wallet = entry;
    }
    setAccountsMap(next);
    return next;
  }, [dateTo]);

  const fetchLedger = useCallback(
    async (accId: number) => {
      const params = new URLSearchParams({ accountId: String(accId) });
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/accounting/ledger?${params}`);
      if (!res.ok) throw new Error("فشل تحميل حركات الحساب");
      const json = (await res.json()) as LedgerData;
      setLedger(json);
    },
    [dateFrom, dateTo]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const accs = await fetchAccounts();
      const target = accs[activeTab];
      if (target) {
        await fetchLedger(target.id);
      } else {
        setLedger(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchAccounts, fetchLedger]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Reset to the first ledger page when the account tab or date range changes.
  useEffect(() => {
    setPage(1);
  }, [activeTab, dateFrom, dateTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          description: form.description,
          amount: parseFloat(form.amount),
          type: form.type,
          account: activeTab,
          reservationId: form.reservationId ? parseInt(form.reservationId) : null,
          bankRef: form.bankRef || null,
          partyId: form.partyId ? parseInt(form.partyId) : null,
          counterAccountCode: form.counterAccountCode || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "فشل إضافة الحركة");
      }
      setShowForm(false);
      setForm(buildEmptyForm());
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل إضافة الحركة");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const activeMeta = ACCOUNT_META[activeTab];
  const rows = ledger?.rows ?? [];
  const pagedRows = usePaginatedSlice(rows, page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const isFirstPage = page === 1;
  const isLastPage = page === totalPages;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="border-b-2 border-gold/30 pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-block w-1 h-8 bg-gold rounded-full shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-primary">
                الدفتر النقدي
              </h1>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 leading-snug">
                يُقرأ مباشرة من القيود المحاسبية — مصدر بيانات واحد موحَّد
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setForm(buildEmptyForm());
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium w-full sm:w-auto justify-center"
          >
            <Plus size={18} />
            إضافة حركة
          </button>
        </div>
      </div>

      {/* Account balance cards (acts as tabs) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(Object.keys(ACCOUNT_META) as AccountKey[]).map((key) => {
          const meta = ACCOUNT_META[key];
          const Icon = meta.icon;
          const isActive = activeTab === key;
          const summary = accountsMap[key];
          const bal = summary?.balance ?? 0;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              disabled={!summary}
              className={cn(
                "text-right rounded-xl p-3 sm:p-4 transition-all border-2 disabled:opacity-60 disabled:cursor-not-allowed",
                isActive
                  ? "bg-primary text-white border-primary shadow-md"
                  : "bg-card-bg text-gray-800 border-transparent hover:border-primary/30 shadow-sm"
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span
                  className={cn(
                    "text-[11px] sm:text-xs font-medium truncate",
                    isActive ? "text-white/80" : "text-gray-500"
                  )}
                >
                  {meta.code} — {meta.label}
                </span>
                <Icon
                  size={20}
                  className={cn(
                    "shrink-0",
                    isActive ? "text-gold" : "text-primary/70"
                  )}
                />
              </div>
              <p
                className={cn(
                  "text-xl sm:text-2xl font-bold",
                  isActive
                    ? "text-white"
                    : bal >= 0
                      ? "text-gray-800"
                      : "text-danger"
                )}
              >
                {formatAmount(bal)} <span className="text-xs sm:text-sm font-normal">د.أ</span>
              </p>
              <p
                className={cn(
                  "text-[10px] sm:text-[11px] mt-1",
                  isActive ? "text-white/70" : "text-gray-400"
                )}
              >
                {dateTo ? `رصيد حتى ${formatDate(dateTo)}` : "الرصيد الحالي"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Date Filter */}
      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Search size={18} className="text-gray-400" />
            <span className="text-sm text-gray-500">فترة البحث:</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 sm:flex-1 sm:max-w-md">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 shrink-0">من</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full min-w-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 shrink-0">إلى</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full min-w-0"
              />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="text-xs text-danger hover:underline text-start"
            >
              مسح الفلتر
            </button>
          )}
        </div>
      </div>

      {/* Period summary */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-card-bg rounded-xl shadow-sm p-3 sm:p-5 animate-pulse"
            >
              <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
              <div className="h-8 w-32 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : ledger ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <SummaryCard
            title="الرصيد الافتتاحي"
            value={ledger.openingBalance}
            icon={ArrowLeftRight}
            color="gray"
          />
          <SummaryCard
            title={`الوارد — ${activeMeta.label}`}
            value={ledger.totalDebit}
            icon={TrendingUp}
            color="green"
          />
          <SummaryCard
            title={`الصادر — ${activeMeta.label}`}
            value={ledger.totalCredit}
            icon={TrendingDown}
            color="red"
          />
          <SummaryCard
            title="الرصيد الختامي"
            value={ledger.closingBalance}
            icon={Scale}
            color="blue"
          />
        </div>
      ) : null}

      {/* Transactions */}
      <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 px-4 text-center">
            <Wallet size={48} className="mb-3 opacity-50" />
            <p>لا توجد حركات على هذا الحساب في الفترة المحددة</p>
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Table ≥ lg */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                    <th className="text-right px-4 py-3 font-medium">رقم القيد</th>
                    <th className="text-right px-4 py-3 font-medium">البيان</th>
                    <th className="text-right px-4 py-3 font-medium">الحساب المقابل</th>
                    <th className="text-right px-4 py-3 font-medium">وارد (+)</th>
                    <th className="text-right px-4 py-3 font-medium">صادر (-)</th>
                    <th className="text-right px-4 py-3 font-medium">الرصيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ledger && ledger.openingBalance !== 0 && isFirstPage && (
                    <tr className="bg-amber-50/50 text-amber-900 text-xs">
                      <td className="px-4 py-2 font-medium">
                        {dateFrom ? formatDate(dateFrom) : "—"}
                      </td>
                      <td className="px-4 py-2">—</td>
                      <td className="px-4 py-2 font-medium" colSpan={3}>
                        الرصيد المُرحَّل (الافتتاحي)
                      </td>
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2 font-bold">
                        {formatAmount(ledger.openingBalance)}
                      </td>
                    </tr>
                  )}
                  {pagedRows.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        "transition-colors hover:bg-gray-50/50",
                        r.debit > 0 ? "bg-green-50/40" : "bg-red-50/40"
                      )}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Calendar size={14} className="text-gray-400" />
                          {formatDate(r.date)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/accounting/journal/${r.entryId}`}
                          className="text-primary-light hover:underline text-xs font-mono"
                        >
                          {r.entryNumber}
                        </Link>
                        <span className="block text-[10px] text-gray-400 mt-0.5">
                          {SOURCE_LABELS[r.entrySource] || r.entrySource}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-800">{r.description}</span>
                        {r.lineDescription && r.lineDescription !== r.description && (
                          <span className="block text-xs text-gray-400 mt-0.5">
                            {r.lineDescription}
                          </span>
                        )}
                        {r.entryReference && (
                          <span className="block text-[10px] text-gray-400 mt-0.5">
                            مرجع: {r.entryReference}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {r.counterSummary || "—"}
                        {r.partyName && (
                          <span className="block text-[10px] text-gray-400 mt-0.5">
                            طرف: {r.partyName}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-success">
                        {r.debit > 0 ? formatAmount(r.debit) : ""}
                      </td>
                      <td className="px-4 py-3 font-medium text-danger">
                        {r.credit > 0 ? formatAmount(r.credit) : ""}
                      </td>
                      <td className="px-4 py-3 font-bold text-primary">
                        {formatAmount(r.balance)}
                      </td>
                    </tr>
                  ))}
                  {ledger && isLastPage && (
                    <tr className="bg-gray-100 font-bold text-gray-800 text-sm">
                      <td className="px-4 py-3" colSpan={4}>
                        الإجمالي
                      </td>
                      <td className="px-4 py-3 text-success">
                        {formatAmount(ledger.totalDebit)}
                      </td>
                      <td className="px-4 py-3 text-danger">
                        {formatAmount(ledger.totalCredit)}
                      </td>
                      <td className="px-4 py-3 text-primary">
                        {formatAmount(ledger.closingBalance)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile / Tablet Cards < lg */}
            <div className="lg:hidden divide-y divide-gray-100">
              {ledger && ledger.openingBalance !== 0 && isFirstPage && (
                <div className="bg-amber-50/60 text-amber-900 px-4 py-3 flex items-center justify-between text-xs">
                  <span className="font-medium">
                    الرصيد المُرحَّل (الافتتاحي)
                    {dateFrom && (
                      <span className="text-amber-700/70 block text-[10px] mt-0.5">
                        {formatDate(dateFrom)}
                      </span>
                    )}
                  </span>
                  <span className="font-bold tabular-nums">
                    {formatAmount(ledger.openingBalance)}
                  </span>
                </div>
              )}
              {pagedRows.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "p-3 sm:p-4 space-y-2",
                    r.debit > 0 ? "bg-green-50/30" : "bg-red-50/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium text-gray-800 break-words">
                        {r.description}
                      </p>
                      {r.lineDescription && r.lineDescription !== r.description && (
                        <p className="text-xs text-gray-500 break-words">
                          {r.lineDescription}
                        </p>
                      )}
                    </div>
                    <div className="text-left shrink-0">
                      <p
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          r.debit > 0 ? "text-success" : "text-danger"
                        )}
                      >
                        {r.debit > 0 ? "+" : "−"}
                        {formatAmount(r.debit > 0 ? r.debit : r.credit)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={11} className="text-gray-400" />
                      {formatDate(r.date)}
                    </span>
                    <Link
                      href={`/accounting/journal/${r.entryId}`}
                      className="text-primary-light hover:underline font-mono"
                    >
                      {r.entryNumber}
                    </Link>
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      {SOURCE_LABELS[r.entrySource] || r.entrySource}
                    </span>
                  </div>
                  {(r.counterSummary || r.partyName || r.entryReference) && (
                    <div className="text-[11px] text-gray-500 space-y-0.5 border-t border-gray-100 pt-2">
                      {r.counterSummary && (
                        <p className="break-words">
                          <span className="text-gray-400">المقابل: </span>
                          {r.counterSummary}
                        </p>
                      )}
                      {r.partyName && (
                        <p className="break-words">
                          <span className="text-gray-400">الطرف: </span>
                          {r.partyName}
                        </p>
                      )}
                      {r.entryReference && (
                        <p className="break-words">
                          <span className="text-gray-400">مرجع: </span>
                          {r.entryReference}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs border-t border-gray-100 pt-2">
                    <span className="text-gray-500">الرصيد</span>
                    <span className="font-bold text-primary tabular-nums">
                      {formatAmount(r.balance)}
                    </span>
                  </div>
                </div>
              ))}
              {ledger && isLastPage && (
                <div className="bg-gray-100 px-4 py-3 text-sm font-bold text-gray-800 space-y-1">
                  <div className="flex justify-between">
                    <span>إجمالي الوارد</span>
                    <span className="text-success tabular-nums">
                      {formatAmount(ledger.totalDebit)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>إجمالي الصادر</span>
                    <span className="text-danger tabular-nums">
                      {formatAmount(ledger.totalCredit)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-gray-300/60 pt-1 mt-1">
                    <span>الرصيد الختامي</span>
                    <span className="text-primary tabular-nums">
                      {formatAmount(ledger.closingBalance)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {rows.length > 0 && (
              <div className="px-3 sm:px-4 py-3 border-t border-gold/20">
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={rows.length}
                  onChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Transaction Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100 shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-gray-800 truncate">
                إضافة حركة — {activeMeta.label}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors shrink-0"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                        type: e.target.value as "income" | "expense",
                      })
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="income">وارد (+)</option>
                    <option value="expense">صادر (-)</option>
                  </select>
                </div>
              </div>

              <div>
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
                  placeholder="وصف الحركة المالية"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المبلغ (د.أ)
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    رقم الحجز (اختياري)
                  </label>
                  <input
                    type="number"
                    value={form.reservationId}
                    onChange={(e) =>
                      setForm({ ...form, reservationId: e.target.value })
                    }
                    placeholder="—"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الطرف (اختياري)
                  </label>
                  <select
                    value={form.partyId}
                    onChange={(e) => setForm({ ...form, partyId: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">— بدون طرف —</option>
                    {parties
                      .filter((p) =>
                        form.type === "income" ? true : p.type !== "guest"
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({PARTY_TYPE_LABELS[p.type] || p.type})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    حساب {form.type === "income" ? "الإيراد" : "المصروف"}{" "}
                    (اختياري)
                  </label>
                  <select
                    value={form.counterAccountCode}
                    onChange={(e) =>
                      setForm({ ...form, counterAccountCode: e.target.value })
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">— افتراضي —</option>
                    {formAccounts
                      .filter((a) =>
                        form.type === "income"
                          ? a.type === "revenue"
                          : a.type === "expense"
                      )
                      .map((a) => (
                        <option key={a.id} value={a.code}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {(activeTab === "bank" || activeTab === "wallet") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {activeTab === "bank" ? "مرجع البنك" : "مرجع المحفظة"}
                  </label>
                  <input
                    type="text"
                    value={form.bankRef}
                    onChange={(e) =>
                      setForm({ ...form, bankRef: e.target.value })
                    }
                    placeholder="رقم الحوالة أو المرجع"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm"
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
                    <Plus size={18} />
                  )}
                  {submitting ? "جاري الحفظ..." : "حفظ الحركة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: typeof TrendingUp;
  color: "green" | "red" | "blue" | "gray";
}) {
  const colors = {
    green: {
      bg: "bg-green-50",
      icon: "text-green-600",
      value: "text-green-700",
      border: "border-green-200",
    },
    red: {
      bg: "bg-red-50",
      icon: "text-red-600",
      value: "text-red-700",
      border: "border-red-200",
    },
    blue: {
      bg: "bg-blue-50",
      icon: "text-blue-600",
      value: "text-blue-700",
      border: "border-blue-200",
    },
    gray: {
      bg: "bg-gray-50",
      icon: "text-gray-600",
      value: "text-gray-700",
      border: "border-gray-200",
    },
  };
  const c = colors[color];

  return (
    <div className={cn("rounded-xl shadow-sm p-3 sm:p-5 border", c.bg, c.border)}>
      <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
        <span className="text-[11px] sm:text-sm text-gray-600 font-medium truncate">
          {title}
        </span>
        <div className={cn("p-1.5 sm:p-2 rounded-lg shrink-0", c.bg)}>
          <Icon size={18} className={c.icon} />
        </div>
      </div>
      <p className={cn("text-lg sm:text-2xl font-bold tabular-nums", c.value)}>
        {formatAmount(value)}{" "}
        <span className="text-xs sm:text-sm font-normal">د.أ</span>
      </p>
    </div>
  );
}
