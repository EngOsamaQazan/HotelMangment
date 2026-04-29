"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  BookText,
  Loader2,
  AlertCircle,
  RotateCcw,
  Printer,
} from "lucide-react";
import { cn, formatAmount, formatDate } from "@/lib/utils";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  JournalAttachments,
  type JournalAttachmentDTO,
} from "@/components/accounting/JournalAttachments";

interface Line {
  id: number;
  accountId: number;
  partyId: number | null;
  debit: number;
  credit: number;
  description: string | null;
  account: { code: string; name: string };
  party: { id: number; name: string } | null;
}

interface Entry {
  id: number;
  entryNumber: string;
  date: string;
  description: string;
  reference: string | null;
  source: string;
  status: string;
  totalDebit: number;
  totalCredit: number;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  reversalOfId: number | null;
  lines: Line[];
  attachments?: JournalAttachmentDTO[];
  reversalOf?: { id: number; entryNumber: string } | null;
  reversedBy?: { id: number; entryNumber: string }[];
}

export default function JournalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);

  const fetchEntry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounting/journal/${id}`);
      if (!res.ok) throw new Error("فشل التحميل");
      const json = await res.json();
      setEntry(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  async function handleVoid() {
    const reason = prompt("أدخل سبب إلغاء القيد:");
    if (!reason) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/accounting/journal/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void", reason }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "فشل");
      }
      const reversal = await res.json();
      alert(`تم إنشاء قيد عكسي: ${reversal.entryNumber}`);
      router.push(`/accounting/journal/${reversal.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setVoiding(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-20 gap-3">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-danger">{error}</p>
        <Link href="/accounting/journal" className="text-primary hover:underline">
          العودة
        </Link>
      </div>
    );
  }

  if (loading || !entry) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageShell>
      <div className="no-print">
        <PageHeader
          title={`قيد ${entry.entryNumber}`}
          icon={<BookText size={22} />}
          backHref="/accounting/journal"
          actions={
            <>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark tap-44"
              >
                <Printer size={16} /> <span>طباعة</span>
              </button>
              {entry.status === "posted" && !entry.voidedAt && entry.source !== "reversal" && (
                <Can permission="accounting.journal:void">
                  <button
                    onClick={handleVoid}
                    disabled={voiding}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 tap-44"
                  >
                    {voiding ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <RotateCcw size={16} />
                    )}
                    <span>عكس القيد</span>
                  </button>
                </Can>
              )}
            </>
          }
        />
      </div>

      <div className="bg-card-bg rounded-xl shadow-sm p-6 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-xl">
              <BookText size={28} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-primary font-mono">
                {entry.entryNumber}
              </h1>
              <span className="text-sm text-gray-500">
                {formatDate(entry.date)}
              </span>
            </div>
          </div>
          <span
            className={cn(
              "inline-block px-3 py-1 text-sm font-medium rounded-full",
              entry.voidedAt || entry.status !== "posted"
                ? "bg-red-100 text-red-700"
                : "bg-green-100 text-green-700"
            )}
          >
            {entry.voidedAt
              ? "معكوس"
              : entry.status === "posted"
                ? "مرحّل"
                : "ملغي"}
          </span>
        </div>
        <div className="pt-2">
          <p className="text-lg text-gray-800 font-medium">{entry.description}</p>
          {entry.reference && (
            <p className="text-sm text-gray-500 mt-1">مرجع: {entry.reference}</p>
          )}
        </div>
        {entry.voidReason && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-700">
            <strong>سبب العكس:</strong> {entry.voidReason}
          </div>
        )}
        {entry.reversedBy && entry.reversedBy.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg text-sm text-orange-800">
            تمّ عكس هذا القيد بالقيد{" "}
            {entry.reversedBy.map((r, idx) => (
              <span key={r.id}>
                <Link
                  href={`/accounting/journal/${r.id}`}
                  className="font-mono underline"
                >
                  {r.entryNumber}
                </Link>
                {idx < entry.reversedBy!.length - 1 ? "، " : ""}
              </span>
            ))}
            . القيد الأصلي وقيد العكس معاً يلغيان بعضهما في الدفتر.
          </div>
        )}
        {entry.reversalOf && (
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm text-yellow-700">
            هذا قيد عكسي للقيد{" "}
            <Link
              href={`/accounting/journal/${entry.reversalOf.id}`}
              className="font-mono underline"
            >
              {entry.reversalOf.entryNumber}
            </Link>
          </div>
        )}
      </div>

      <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th className="sticky-start text-right">الحساب</th>
                <th className="text-right">الطرف</th>
                <th className="text-right">البيان</th>
                <th className="text-right">مدين</th>
                <th className="text-right">دائن</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((l) => (
                <tr key={l.id}>
                  <td className="sticky-start">
                    <span className="font-mono text-xs text-gray-500">
                      {l.account.code}
                    </span>
                    <span className="font-medium text-gray-800 mr-2">
                      {l.account.name}
                    </span>
                  </td>
                  <td>
                    {l.party ? (
                      <Link
                        href={`/accounting/parties/${l.party.id}`}
                        className="text-primary hover:underline"
                      >
                        {l.party.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="text-gray-600">
                    {l.description || "—"}
                  </td>
                  <td className="font-medium text-green-700">
                    {l.debit > 0 ? formatAmount(l.debit) : ""}
                  </td>
                  <td className="font-medium text-red-700">
                    {l.credit > 0 ? formatAmount(l.credit) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td className="sticky-start" colSpan={3}>
                  الإجمالي
                </td>
                <td className="text-green-700">
                  {formatAmount(entry.totalDebit)}
                </td>
                <td className="text-red-700">
                  {formatAmount(entry.totalCredit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bg-card-bg rounded-xl p-4 sm:p-5 shadow-sm no-print">
        <JournalAttachments
          entryId={entry.id}
          initial={entry.attachments ?? []}
        />
      </div>
    </PageShell>
  );
}
