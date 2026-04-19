"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Plus,
  Loader2,
  AlertCircle,
  Search,
  Phone,
  X,
  Eye,
} from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";

interface Party {
  id: number;
  code: string | null;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  nationalId: string | null;
  notes: string | null;
  isActive: boolean;
  balance?: number;
}

const TYPE_LABELS: Record<string, string> = {
  guest: "نزيل",
  partner: "شريك",
  supplier: "مورّد",
  employee: "موظف",
  lender: "مُقرض",
  other: "أخرى",
};

const TYPE_COLORS: Record<string, string> = {
  guest: "bg-blue-50 text-blue-700",
  partner: "bg-purple-50 text-purple-700",
  supplier: "bg-orange-50 text-orange-700",
  employee: "bg-green-50 text-green-700",
  lender: "bg-yellow-50 text-yellow-700",
  other: "bg-gray-100 text-gray-700",
};

export default function PartiesPage() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "supplier" as Party["type"],
    phone: "",
    email: "",
    nationalId: "",
    notes: "",
  });

  const fetchParties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ balances: "1" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/accounting/parties?${params}`);
      if (!res.ok) throw new Error("فشل تحميل الأطراف");
      const json = await res.json();
      setParties(json.parties);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search]);

  useEffect(() => {
    fetchParties();
  }, [fetchParties]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/accounting/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "فشل");
      }
      setShowForm(false);
      setForm({
        name: "",
        type: "supplier",
        phone: "",
        email: "",
        nationalId: "",
        notes: "",
      });
      fetchParties();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users size={28} className="text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-primary">
            الأطراف
          </h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium w-full sm:w-auto justify-center"
        >
          <Plus size={18} />
          إضافة طرف
        </button>
      </div>

      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "الكل" },
            { key: "partner", label: "الشركاء" },
            { key: "supplier", label: "الموردين" },
            { key: "employee", label: "الموظفين" },
            { key: "lender", label: "المُقرضين" },
            { key: "guest", label: "النزلاء" },
            { key: "other", label: "أخرى" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                typeFilter === t.key
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو الرقم الوطني"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
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
      ) : parties.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <Users size={48} className="mb-3 opacity-50" />
          <p>لا توجد أطراف مطابقة</p>
        </div>
      ) : (
        <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-right px-4 py-3 font-medium">الاسم</th>
                  <th className="text-right px-4 py-3 font-medium">النوع</th>
                  <th className="text-right px-4 py-3 font-medium">الهاتف</th>
                  <th className="text-right px-4 py-3 font-medium">الرصيد</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parties.map((p) => {
                  const balance = p.balance ?? 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/accounting/parties/${p.id}`}
                          className="font-medium text-gray-800 hover:text-primary"
                        >
                          {p.name}
                        </Link>
                        {p.nationalId && (
                          <span className="block text-xs text-gray-400 mt-0.5">
                            {p.nationalId}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-block px-2.5 py-1 text-xs font-medium rounded-full",
                            TYPE_COLORS[p.type]
                          )}
                        >
                          {TYPE_LABELS[p.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {p.phone ? (
                          <span className="inline-flex items-center gap-1 direction-ltr">
                            <Phone size={12} />
                            {p.phone}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 font-bold",
                          balance > 0
                            ? "text-green-700"
                            : balance < 0
                            ? "text-red-700"
                            : "text-gray-400"
                        )}
                      >
                        {formatAmount(balance)}
                        <span className="text-xs font-normal text-gray-500 mr-1">
                          {balance > 0
                            ? "(له علينا)"
                            : balance < 0
                            ? "(لنا عليه)"
                            : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.isActive ? (
                          <span className="text-xs text-green-700">نشط</span>
                        ) : (
                          <span className="text-xs text-gray-400">غير نشط</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/accounting/parties/${p.id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Eye size={14} /> كشف الحساب
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-b">
              <h3 className="text-lg font-bold text-gray-800">إضافة طرف جديد</h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-gray-200"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    النوع
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as Party["type"],
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="partner">شريك</option>
                    <option value="supplier">مورّد</option>
                    <option value="employee">موظف</option>
                    <option value="lender">مُقرض</option>
                    <option value="guest">نزيل</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الاسم
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الهاتف
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm direction-ltr"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الرقم الوطني
                  </label>
                  <input
                    type="text"
                    value={form.nationalId}
                    onChange={(e) =>
                      setForm({ ...form, nationalId: e.target.value })
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  البريد الإلكتروني (اختياري)
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm direction-ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ملاحظات
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
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
    </div>
  );
}
