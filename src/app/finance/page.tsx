"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wallet,
  Landmark,
  Plus,
  X,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Search,
} from "lucide-react";
import { cn, formatDate, formatAmount } from "@/lib/utils";

type AccountTab = "cash" | "bank";

interface Transaction {
  id: number;
  date: string;
  description: string;
  reservationId: number | null;
  amount: string;
  type: "income" | "expense";
  account: "cash" | "bank";
  bankRef: string | null;
  reservation?: {
    id: number;
    guestName: string;
    unit: { unitNumber: string };
  } | null;
}

interface FinanceData {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
  };
}

interface FormData {
  date: string;
  description: string;
  amount: string;
  type: "income" | "expense";
  reservationId: string;
  bankRef: string;
}

const emptyForm: FormData = {
  date: "",
  description: "",
  amount: "",
  type: "income",
  reservationId: "",
  bankRef: "",
};

function buildEmptyForm(): FormData {
  return { ...emptyForm, date: new Date().toISOString().split("T")[0] };
}

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<AccountTab>("cash");
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ account: activeTab });
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/finance?${params}`);
      if (!res.ok) throw new Error("فشل تحميل البيانات المالية");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [activeTab, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
          reservationId: form.reservationId
            ? parseInt(form.reservationId)
            : null,
          bankRef: form.bankRef || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "فشل إضافة الحركة");
      }
      setShowForm(false);
      setForm(buildEmptyForm());
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل إضافة الحركة");
    } finally {
      setSubmitting(false);
    }
  }

  let runningBalance = 0;
  const transactionsWithBalance = data
    ? [...data.transactions].reverse().map((t) => {
        const amount = parseFloat(t.amount);
        runningBalance += t.type === "income" ? amount : -amount;
        return { ...t, balance: runningBalance };
      }).reverse()
    : [];

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">الصندوق والبنك</h1>
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

      {/* Tabs */}
      <div className="flex gap-1 bg-card-bg rounded-xl p-1.5 shadow-sm w-full sm:w-fit">
        <button
          onClick={() => setActiveTab("cash")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors",
            activeTab === "cash"
              ? "bg-primary text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          )}
        >
          <Wallet size={18} />
          الصندوق النقدي
        </button>
        <button
          onClick={() => setActiveTab("bank")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors",
            activeTab === "bank"
              ? "bg-primary text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          )}
        >
          <Landmark size={18} />
          الحساب البنكي
        </button>
      </div>

      {/* Date Filter */}
      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-gray-400" />
            <span className="text-sm text-gray-500">فترة البحث:</span>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs text-gray-400 shrink-0">من</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full sm:w-auto"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-xs text-gray-400 shrink-0">إلى</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary w-full sm:w-auto"
              />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="text-xs text-danger hover:underline"
            >
              مسح الفلتر
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-card-bg rounded-xl shadow-sm p-5 animate-pulse"
            >
              <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
              <div className="h-8 w-32 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard
            title="إجمالي الوارد"
            value={data.summary.totalIncome}
            icon={TrendingUp}
            color="green"
          />
          <SummaryCard
            title="إجمالي الصادر"
            value={data.summary.totalExpenses}
            icon={TrendingDown}
            color="red"
          />
          <SummaryCard
            title="الرصيد"
            value={data.summary.netBalance}
            icon={Scale}
            color="blue"
          />
        </div>
      ) : null}

      {/* Transactions Table */}
      <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : transactionsWithBalance.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Wallet size={48} className="mb-3 opacity-50" />
            <p>لا توجد حركات مالية</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                  <th className="text-right px-4 py-3 font-medium">البيان</th>
                  <th className="text-right px-4 py-3 font-medium">
                    رقم الحجز
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    وارد (+)
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    صادر (-)
                  </th>
                  <th className="text-right px-4 py-3 font-medium">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactionsWithBalance.map((t) => (
                  <tr
                    key={t.id}
                    className={cn(
                      "transition-colors hover:bg-gray-50/50",
                      t.type === "income" ? "bg-green-50/40" : "bg-red-50/40"
                    )}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Calendar size={14} className="text-gray-400" />
                        {formatDate(t.date)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-800">{t.description}</span>
                      {t.bankRef && (
                        <span className="block text-xs text-gray-400 mt-0.5">
                          مرجع: {t.bankRef}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {t.reservation ? (
                        <span className="inline-flex items-center gap-1 text-primary-light font-medium">
                          #{t.reservation.id}
                          <span className="text-gray-400 text-xs">
                            ({t.reservation.guestName})
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-success">
                      {t.type === "income" ? formatAmount(t.amount) : ""}
                    </td>
                    <td className="px-4 py-3 font-medium text-danger">
                      {t.type === "expense" ? formatAmount(t.amount) : ""}
                    </td>
                    <td className="px-4 py-3 font-bold text-primary">
                      {formatAmount(t.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Transaction Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">
                إضافة حركة مالية -{" "}
                {activeTab === "cash" ? "الصندوق النقدي" : "الحساب البنكي"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
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

              {activeTab === "bank" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    مرجع البنك
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
  color: "green" | "red" | "blue";
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
  };
  const c = colors[color];

  return (
    <div
      className={cn(
        "rounded-xl shadow-sm p-5 border",
        c.bg,
        c.border
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-600 font-medium">{title}</span>
        <div className={cn("p-2 rounded-lg", c.bg)}>
          <Icon size={20} className={c.icon} />
        </div>
      </div>
      <p className={cn("text-2xl font-bold", c.value)}>
        {formatAmount(value)} <span className="text-sm font-normal">د.أ</span>
      </p>
    </div>
  );
}
