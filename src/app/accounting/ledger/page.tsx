"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  BookOpen,
  Loader2,
  AlertCircle,
  FileText,
  Printer,
} from "lucide-react";
import { formatAmount, formatDate } from "@/lib/utils";
import { Pagination, usePaginatedSlice } from "@/components/Pagination";

const PAGE_SIZE = 20;

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
  normalBalance: string;
}

interface LedgerRow {
  id: number;
  date: string;
  entryId: number;
  entryNumber: string;
  description: string;
  lineDescription: string | null;
  partyId: number | null;
  partyName: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerData {
  account: Account;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  rows: LedgerRow[];
}

export default function LedgerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialAccountId = searchParams.get("accountId") || "";

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Reset pagination when account or date range changes.
  useEffect(() => {
    setPage(1);
  }, [accountId, from, to]);

  const pagedRows = usePaginatedSlice(data?.rows ?? [], page, PAGE_SIZE);
  const totalRows = data?.rows.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const isFirstPage = page === 1;
  const isLastPage = page >= totalPages;

  useEffect(() => {
    fetch("/api/accounting/accounts")
      .then((r) => r.json())
      .then((j) => setAccounts(j.accounts || []));
  }, []);

  const fetchLedger = useCallback(async () => {
    if (!accountId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ accountId });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/accounting/ledger?${params}`);
      if (!res.ok) throw new Error("فشل التحميل");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [accountId, from, to]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  useEffect(() => {
    if (accountId) {
      const u = new URLSearchParams();
      u.set("accountId", accountId);
      router.replace(`/accounting/ledger?${u}`);
    }
  }, [accountId, router]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-3">
          <BookOpen size={28} className="text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-primary">
            الأستاذ العام
          </h1>
        </div>
        {data && (
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
          >
            <Printer size={16} /> طباعة
          </button>
        )}
      </div>

      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm space-y-3 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="min-w-0">
            <label className="block text-xs text-gray-500 mb-1">الحساب</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— اختر حساباً —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-gray-500 mb-1">من</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-gray-500 mb-1">إلى</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
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
      ) : !data ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <BookOpen size={48} className="mb-3 opacity-50" />
          <p>الرجاء اختيار حساب لعرض الأستاذ</p>
        </div>
      ) : (
        <>
          <div className="bg-card-bg rounded-xl shadow-sm p-3 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs sm:text-sm text-gray-500">الحساب</div>
              <div className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2 flex-wrap">
                <span className="font-mono text-primary">{data.account.code}</span>
                <span className="break-words">{data.account.name}</span>
              </div>
            </div>
            <div className="text-left">
              <div className="text-xs sm:text-sm text-gray-500">الرصيد الختامي</div>
              <div className="text-lg sm:text-2xl font-bold text-primary tabular-nums">
                {formatAmount(data.closingBalance)}
              </div>
            </div>
          </div>

          <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
            {data.rows.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-gray-400">
                <FileText size={48} className="mb-3 opacity-50" />
                <p>لا توجد حركات في هذه الفترة</p>
              </div>
            ) : (
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                      <th className="text-right px-4 py-3 font-medium">القيد</th>
                      <th className="text-right px-4 py-3 font-medium">البيان</th>
                      <th className="text-right px-4 py-3 font-medium">الطرف</th>
                      <th className="text-right px-4 py-3 font-medium">مدين</th>
                      <th className="text-right px-4 py-3 font-medium">دائن</th>
                      <th className="text-right px-4 py-3 font-medium">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {from && isFirstPage && (
                      <tr className="bg-blue-50/40 font-medium">
                        <td className="px-4 py-3" colSpan={6}>
                          رصيد أول المدة
                        </td>
                        <td className="px-4 py-3 font-bold">
                          {formatAmount(data.openingBalance)}
                        </td>
                      </tr>
                    )}
                    {pagedRows.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatDate(r.date)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-primary">
                          <Link
                            href={`/accounting/journal/${r.entryId}`}
                            className="hover:underline"
                          >
                            {r.entryNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-800">
                          {r.description}
                          {r.lineDescription && (
                            <span className="block text-xs text-gray-400 mt-0.5">
                              {r.lineDescription}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {r.partyName ? (
                            <Link
                              href={`/accounting/parties/${r.partyId}`}
                              className="text-primary hover:underline"
                            >
                              {r.partyName}
                            </Link>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-green-700">
                          {r.debit > 0 ? formatAmount(r.debit) : ""}
                        </td>
                        <td className="px-4 py-3 font-medium text-red-700">
                          {r.credit > 0 ? formatAmount(r.credit) : ""}
                        </td>
                        <td className="px-4 py-3 font-bold text-primary">
                          {formatAmount(r.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {isLastPage && (
                    <tfoot>
                      <tr className="bg-gray-100 font-bold">
                        <td className="px-4 py-3" colSpan={4}>
                          الإجمالي
                        </td>
                        <td className="px-4 py-3 text-green-700">
                          {formatAmount(data.totalDebit)}
                        </td>
                        <td className="px-4 py-3 text-red-700">
                          {formatAmount(data.totalCredit)}
                        </td>
                        <td className="px-4 py-3 text-primary">
                          {formatAmount(data.closingBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {data.rows.length > 0 && (
              <div className="md:hidden divide-y divide-gray-100">
                {from && isFirstPage && (
                  <div className="p-3 bg-blue-50/40 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-gray-700">
                      رصيد أول المدة
                    </span>
                    <span className="font-bold tabular-nums">
                      {formatAmount(data.openingBalance)}
                    </span>
                  </div>
                )}
                {pagedRows.map((r) => (
                  <div key={r.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                          <span>{formatDate(r.date)}</span>
                          <Link
                            href={`/accounting/journal/${r.entryId}`}
                            className="font-mono text-primary hover:underline"
                          >
                            {r.entryNumber}
                          </Link>
                          {r.partyName && (
                            <Link
                              href={`/accounting/parties/${r.partyId}`}
                              className="text-primary hover:underline"
                            >
                              {r.partyName}
                            </Link>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 mt-1 break-words">
                          {r.description}
                        </p>
                        {r.lineDescription && (
                          <p className="text-xs text-gray-400 mt-0.5 break-words">
                            {r.lineDescription}
                          </p>
                        )}
                      </div>
                      <span className="font-bold text-primary text-sm tabular-nums shrink-0">
                        {formatAmount(r.balance)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      <span className="text-green-700">
                        مدين: {r.debit > 0 ? formatAmount(r.debit) : "—"}
                      </span>
                      <span className="text-red-700">
                        دائن: {r.credit > 0 ? formatAmount(r.credit) : "—"}
                      </span>
                    </div>
                  </div>
                ))}
                {isLastPage && (
                  <div className="p-3 bg-gray-100 grid grid-cols-3 gap-2 text-xs font-bold tabular-nums">
                    <span className="text-green-700">
                      مدين: {formatAmount(data.totalDebit)}
                    </span>
                    <span className="text-red-700">
                      دائن: {formatAmount(data.totalCredit)}
                    </span>
                    <span className="text-primary text-left">
                      {formatAmount(data.closingBalance)}
                    </span>
                  </div>
                )}
              </div>
            )}
            {data.rows.length > 0 && (
              <div className="px-4 py-3 border-t border-gold/20">
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={data.rows.length}
                  onChange={setPage}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
