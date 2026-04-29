"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Target,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Pencil,
  Trash2,
  Power,
} from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { Can } from "@/components/Can";
import { usePermissions } from "@/lib/permissions/client";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

interface CostCenter {
  id: number;
  code: string;
  name: string;
  description: string | null;
  parentId: number | null;
  isActive: boolean;
  parent?: { id: number; code: string; name: string } | null;
  _count?: { children: number; lines: number };
  debitTotal?: number;
  creditTotal?: number;
  balance?: number;
}

interface FormState {
  code: string;
  name: string;
  description: string;
  parentId: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  description: "",
  parentId: "",
  isActive: true,
};

export default function CostCentersPage() {
  const { can } = usePermissions();
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [search, setSearch] = useState("");

  const fetchCenters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounting/cost-centers?stats=1", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("فشل تحميل مراكز التكلفة");
      const json = await res.json();
      setCenters(json.centers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCenters();
  }, [fetchCenters]);

  const filtered = useMemo(() => {
    if (!search.trim()) return centers;
    const q = search.trim().toLowerCase();
    return centers.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false)
    );
  }, [centers, search]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: CostCenter) {
    setEditingId(c.id);
    setForm({
      code: c.code,
      name: c.name,
      description: c.description ?? "",
      parentId: c.parentId ? String(c.parentId) : "",
      isActive: c.isActive,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        parentId: form.parentId ? Number(form.parentId) : null,
      };
      let url = "/api/accounting/cost-centers";
      let method: "POST" | "PATCH" = "POST";
      if (editingId == null) {
        payload.code = form.code.trim();
      } else {
        url = `/api/accounting/cost-centers/${editingId}`;
        method = "PATCH";
        payload.isActive = form.isActive;
      }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "فشل حفظ مركز التكلفة");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      fetchCenters();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(c: CostCenter) {
    if (!can("accounting.cost-centers:edit")) return;
    try {
      const res = await fetch(`/api/accounting/cost-centers/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "فشل تحديث الحالة");
      }
      fetchCenters();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    }
  }

  async function handleDelete(c: CostCenter) {
    if (!can("accounting.cost-centers:delete")) return;
    if (
      !confirm(
        `هل أنت متأكد من حذف مركز التكلفة "${c.name}"؟ سيتم تعطيله إذا كان مرتبطاً بقيود.`
      )
    ) {
      return;
    }
    setDeletingId(c.id);
    try {
      const res = await fetch(`/api/accounting/cost-centers/${c.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "فشل الحذف");
      }
      fetchCenters();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setDeletingId(null);
    }
  }

  const parentOptions = useMemo(
    () => centers.filter((c) => c.id !== editingId),
    [centers, editingId]
  );

  return (
    <PageShell>
      <PageHeader
        title="مراكز التكلفة"
        icon={<Target size={24} />}
        description="بُعد تحليلي لتصنيف القيود حسب الإدارة أو المشروع أو الفرع"
        actions={
          <Can permission="accounting.cost-centers:create">
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium tap-44"
            >
              <Plus size={18} />
              <span>إضافة مركز</span>
            </button>
          </Can>
        }
      />

      <div className="flex gap-2 items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالرمز أو الاسم..."
          className="flex-1 max-w-sm border rounded-lg px-3 py-2 text-sm bg-white"
        />
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
      ) : filtered.length === 0 ? (
        <div className="bg-card-bg rounded-xl shadow-sm p-10 text-center text-gray-500">
          <Target size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="font-medium">لا توجد مراكز تكلفة بعد</p>
          <p className="text-sm mt-1">
            ابدأ بإضافة مركز جديد لتصنيف قيودك المحاسبية تحليلياً.
          </p>
        </div>
      ) : (
        <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
          {/* Desktop table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-right px-4 py-3 font-medium">الرمز</th>
                  <th className="text-right px-4 py-3 font-medium">الاسم</th>
                  <th className="text-right px-4 py-3 font-medium">المركز الأب</th>
                  <th className="text-right px-4 py-3 font-medium">قيود</th>
                  <th className="text-right px-4 py-3 font-medium">إجمالي مدين</th>
                  <th className="text-right px-4 py-3 font-medium">إجمالي دائن</th>
                  <th className="text-right px-4 py-3 font-medium">الرصيد</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono font-medium text-primary">
                      {c.code}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {c.name}
                      {c.description && (
                        <span className="block text-xs text-gray-400 mt-0.5">
                          {c.description}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.parent ? (
                        <span className="font-mono text-xs">
                          {c.parent.code} — {c.parent.name}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 tabular-nums">
                      {c._count?.lines ?? 0}
                    </td>
                    <td className="px-4 py-3 text-blue-700 font-medium tabular-nums">
                      {formatAmount(c.debitTotal ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-emerald-700 font-medium tabular-nums">
                      {formatAmount(c.creditTotal ?? 0)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 font-bold tabular-nums",
                        (c.balance ?? 0) > 0
                          ? "text-blue-700"
                          : (c.balance ?? 0) < 0
                          ? "text-emerald-700"
                          : "text-gray-400"
                      )}
                    >
                      {formatAmount(c.balance ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block px-2.5 py-1 text-xs font-medium rounded-full border",
                          c.isActive
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        )}
                      >
                        {c.isActive ? "نشط" : "موقوف"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Can permission="accounting.cost-centers:edit">
                          <button
                            onClick={() => handleToggleActive(c)}
                            title={c.isActive ? "تعطيل" : "تفعيل"}
                            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
                          >
                            <Power size={15} />
                          </button>
                          <button
                            onClick={() => openEdit(c)}
                            title="تعديل"
                            className="p-1.5 rounded-md hover:bg-blue-50 text-blue-600"
                          >
                            <Pencil size={15} />
                          </button>
                        </Can>
                        <Can permission="accounting.cost-centers:delete">
                          <button
                            onClick={() => handleDelete(c)}
                            disabled={deletingId === c.id}
                            title="حذف"
                            className="p-1.5 rounded-md hover:bg-red-50 text-red-600 disabled:opacity-50"
                          >
                            {deletingId === c.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map((c) => (
              <div key={c.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-primary text-sm">
                        {c.code}
                      </span>
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 text-[10px] font-medium rounded-full border",
                          c.isActive
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        )}
                      >
                        {c.isActive ? "نشط" : "موقوف"}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-1 break-words">
                      {c.name}
                    </p>
                    {c.parent && (
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">
                        أب: {c.parent.code} — {c.parent.name}
                      </p>
                    )}
                    {c.description && (
                      <p className="text-xs text-gray-400 mt-0.5 break-words">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Can permission="accounting.cost-centers:edit">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded-md hover:bg-blue-50 text-blue-600"
                      >
                        <Pencil size={15} />
                      </button>
                    </Can>
                    <Can permission="accounting.cost-centers:delete">
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={deletingId === c.id}
                        className="p-1.5 rounded-md hover:bg-red-50 text-red-600 disabled:opacity-50"
                      >
                        {deletingId === c.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </Can>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-blue-50 rounded-md px-2 py-1">
                    <div className="text-blue-700/80">مدين</div>
                    <div className="font-bold text-blue-800 tabular-nums">
                      {formatAmount(c.debitTotal ?? 0)}
                    </div>
                  </div>
                  <div className="bg-emerald-50 rounded-md px-2 py-1">
                    <div className="text-emerald-700/80">دائن</div>
                    <div className="font-bold text-emerald-800 tabular-nums">
                      {formatAmount(c.creditTotal ?? 0)}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-md px-2 py-1">
                    <div className="text-gray-600">رصيد</div>
                    <div
                      className={cn(
                        "font-bold tabular-nums",
                        (c.balance ?? 0) > 0
                          ? "text-blue-700"
                          : (c.balance ?? 0) < 0
                          ? "text-emerald-700"
                          : "text-gray-400"
                      )}
                    >
                      {formatAmount(c.balance ?? 0)}
                    </div>
                  </div>
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
              <h3 className="text-base sm:text-lg font-bold text-gray-800">
                {editingId == null ? "إضافة مركز تكلفة" : "تعديل مركز تكلفة"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-gray-200"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <form
              onSubmit={handleSubmit}
              className="p-4 sm:p-6 space-y-4 overflow-y-auto"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الرمز
                  </label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={(e) =>
                      setForm({ ...form, code: e.target.value })
                    }
                    placeholder="مثال: CC-101"
                    disabled={editingId != null}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  {editingId != null && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      لا يمكن تعديل الرمز بعد الإنشاء
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    الاسم
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    placeholder="مثال: قسم الاستقبال"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  المركز الأب (اختياري)
                </label>
                <select
                  value={form.parentId}
                  onChange={(e) =>
                    setForm({ ...form, parentId: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">— بدون —</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
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

              {editingId != null && (
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.target.checked })
                    }
                    className="rounded"
                  />
                  نشط
                </label>
              )}

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
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark font-medium text-sm disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Plus size={18} />
                  )}
                  {editingId == null ? "حفظ" : "تحديث"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
