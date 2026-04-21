"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  Plus,
  Loader2,
  AlertCircle,
  Search,
  Phone,
  X,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { Pagination, usePaginatedSlice } from "@/components/Pagination";
import { Can } from "@/components/Can";

const PAGE_SIZE = 20;

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
  baseSalary?: number | null;
  commissionRate?: number | null;
  salaryPayDay?: number | null;
  hireDate?: string | null;
  terminationDate?: string | null;
  jobTitle?: string | null;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("employee");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "supplier" as Party["type"],
    phone: "",
    email: "",
    nationalId: "",
    notes: "",
    isActive: true,
    jobTitle: "",
    baseSalary: "",
    commissionRate: "",
    salaryPayDay: "",
    hireDate: "",
    terminationDate: "",
  });

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      type: "supplier",
      phone: "",
      email: "",
      nationalId: "",
      notes: "",
      isActive: true,
      jobTitle: "",
      baseSalary: "",
      commissionRate: "",
      salaryPayDay: "",
      hireDate: "",
      terminationDate: "",
    });
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (p: Party) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      type: p.type as Party["type"],
      phone: p.phone ?? "",
      email: p.email ?? "",
      nationalId: p.nationalId ?? "",
      notes: p.notes ?? "",
      isActive: p.isActive,
      jobTitle: p.jobTitle ?? "",
      baseSalary: p.baseSalary != null ? String(p.baseSalary) : "",
      commissionRate:
        p.commissionRate != null ? String(p.commissionRate * 100) : "",
      salaryPayDay: p.salaryPayDay != null ? String(p.salaryPayDay) : "",
      hireDate: p.hireDate ? p.hireDate.slice(0, 10) : "",
      terminationDate: p.terminationDate ? p.terminationDate.slice(0, 10) : "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  async function handleDelete(p: Party) {
    if (
      !confirm(
        `هل أنت متأكد من حذف "${p.name}"؟ في حال وجود حركات سيتم تعطيله بدل حذفه.`
      )
    ) {
      return;
    }
    setDeletingId(p.id);
    try {
      const res = await fetch(`/api/accounting/parties/${p.id}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل الحذف");
      if (j.message) {
        alert(j.message);
      }
      fetchParties();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setDeletingId(null);
    }
  }

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

  // Return to the first page whenever filter/search inputs change.
  useEffect(() => {
    setPage(1);
  }, [typeFilter, search]);

  const pagedParties = usePaginatedSlice(parties, page, PAGE_SIZE);

  useEffect(() => {
    const editIdParam = searchParams.get("edit");
    if (!editIdParam || parties.length === 0) return;
    const idNum = Number(editIdParam);
    const party = parties.find((p) => p.id === idNum);
    if (party) {
      openEdit(party);
      router.replace("/accounting/parties");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, parties]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editingId
        ? `/api/accounting/parties/${editingId}`
        : "/api/accounting/parties";
      const method = editingId ? "PATCH" : "POST";

      const payload: Record<string, unknown> = {
        name: form.name,
        type: form.type,
        phone: form.phone,
        email: form.email,
        nationalId: form.nationalId,
        notes: form.notes,
        isActive: form.isActive,
      };
      if (form.type === "employee") {
        payload.jobTitle = form.jobTitle || null;
        payload.baseSalary = form.baseSalary === "" ? null : Number(form.baseSalary);
        payload.commissionRate =
          form.commissionRate === "" ? null : Number(form.commissionRate) / 100;
        payload.salaryPayDay =
          form.salaryPayDay === "" ? null : Number(form.salaryPayDay);
        payload.hireDate = form.hireDate || null;
        payload.terminationDate = form.terminationDate || null;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "فشل");
      }
      closeForm();
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
        <Can permission="accounting.parties:create">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium w-full sm:w-auto justify-center"
          >
            <Plus size={18} />
            إضافة طرف
          </button>
        </Can>
      </div>

      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "employee", label: "الموظفين" },
            { key: "partner", label: "الشركاء" },
            { key: "supplier", label: "الموردين" },
            { key: "lender", label: "المُقرضين" },
            { key: "guest", label: "النزلاء" },
            { key: "all", label: "الكل" },
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
          <div className="overflow-x-auto hidden md:block">
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
                {pagedParties.map((p) => {
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
                        {formatAmount(Math.abs(balance))}
                        <span className="text-xs font-normal text-gray-500 mr-1">
                          {balance > 0
                            ? "(لنا عليه)"
                            : balance < 0
                            ? "(له علينا)"
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
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/accounting/parties/${p.id}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title="كشف الحساب"
                          >
                            <Eye size={14} /> كشف
                          </Link>
                          <Can permission="accounting.parties:edit">
                            <button
                              onClick={() => openEdit(p)}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              title="تعديل"
                            >
                              <Pencil size={14} /> تعديل
                            </button>
                          </Can>
                          <Can permission="accounting.parties:delete">
                            <button
                              onClick={() => handleDelete(p)}
                              disabled={deletingId === p.id}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-50"
                              title="حذف"
                            >
                              {deletingId === p.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                              حذف
                            </button>
                          </Can>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {pagedParties.map((p) => {
              const balance = p.balance ?? 0;
              return (
                <div key={p.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/accounting/parties/${p.id}`}
                          className="font-medium text-gray-800 hover:text-primary break-words"
                        >
                          {p.name}
                        </Link>
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 text-[10px] font-medium rounded-full",
                            TYPE_COLORS[p.type],
                          )}
                        >
                          {TYPE_LABELS[p.type]}
                        </span>
                        {!p.isActive && (
                          <span className="text-[10px] text-gray-400">
                            غير نشط
                          </span>
                        )}
                      </div>
                      {p.nationalId && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {p.nationalId}
                        </p>
                      )}
                      {p.phone && (
                        <p className="text-xs text-gray-600 mt-0.5 inline-flex items-center gap-1 direction-ltr">
                          <Phone size={11} />
                          {p.phone}
                        </p>
                      )}
                    </div>
                    <div
                      className={cn(
                        "text-sm font-bold tabular-nums shrink-0 text-left",
                        balance > 0
                          ? "text-green-700"
                          : balance < 0
                            ? "text-red-700"
                            : "text-gray-400",
                      )}
                    >
                      {formatAmount(Math.abs(balance))}
                      {balance !== 0 && (
                        <span className="block text-[10px] font-normal text-gray-500">
                          {balance > 0 ? "(لنا عليه)" : "(له علينا)"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-1 border-t border-gray-50">
                    <Link
                      href={`/accounting/parties/${p.id}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Eye size={13} /> كشف
                    </Link>
                    <Can permission="accounting.parties:edit">
                      <button
                        onClick={() => openEdit(p)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Pencil size={13} /> تعديل
                      </button>
                    </Can>
                    <Can permission="accounting.parties:delete">
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={deletingId === p.id}
                        className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingId === p.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        حذف
                      </button>
                    </Can>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-gold/20">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={parties.length}
              onChange={setPage}
            />
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => e.target === e.currentTarget && closeForm()}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg overflow-hidden max-h-[95vh] flex flex-col">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex items-center justify-between border-b shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-gray-800">
                {editingId ? "تعديل الطرف" : "إضافة طرف جديد"}
              </h3>
              <button
                onClick={closeForm}
                className="p-1.5 rounded-lg hover:bg-gray-200"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
                    disabled={!!editingId}
                    className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
              {form.type === "employee" && (
                <div className="bg-green-50/50 border border-green-200 rounded-xl p-4 space-y-3">
                  <h4 className="text-sm font-bold text-green-800">
                    بيانات الموظف
                  </h4>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      المسمّى الوظيفي
                    </label>
                    <input
                      type="text"
                      value={form.jobTitle}
                      onChange={(e) =>
                        setForm({ ...form, jobTitle: e.target.value })
                      }
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="مثلاً: موظف استقبال"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        الراتب الأساسي (د.أ)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={form.baseSalary}
                        onChange={(e) =>
                          setForm({ ...form, baseSalary: e.target.value })
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="380"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        نسبة العمولة (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={form.commissionRate}
                        onChange={(e) =>
                          setForm({ ...form, commissionRate: e.target.value })
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        يوم استحقاق الراتب
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="28"
                        value={form.salaryPayDay}
                        onChange={(e) =>
                          setForm({ ...form, salaryPayDay: e.target.value })
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        تاريخ التعيين
                      </label>
                      <input
                        type="date"
                        value={form.hireDate}
                        onChange={(e) =>
                          setForm({ ...form, hireDate: e.target.value })
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        تاريخ إنهاء الخدمة
                      </label>
                      <input
                        type="date"
                        value={form.terminationDate}
                        onChange={(e) =>
                          setForm({ ...form, terminationDate: e.target.value })
                        }
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    العمولة تُحسب على إيرادات الإيجار الشهرية (حساب 4010).
                  </p>
                </div>
              )}
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
              {editingId && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.target.checked })
                    }
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-gray-700">الطرف نشط</span>
                </label>
              )}
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
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
                  ) : editingId ? (
                    <Pencil size={18} />
                  ) : (
                    <Plus size={18} />
                  )}
                  {editingId ? "حفظ التعديلات" : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
