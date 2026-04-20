"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Wrench,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  Settings2,
  Calendar,
  User,
  Hash,
  KanbanSquare,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, formatAmount, statusLabels } from "@/lib/utils";
import { Pagination, usePaginatedSlice } from "@/components/Pagination";
import { Can } from "@/components/Can";

const PAGE_SIZE = 20;

type MaintenanceStatus = "all" | "pending" | "in_progress" | "completed";

interface MaintenanceRecord {
  id: number;
  unitId: number;
  description: string;
  contractor: string | null;
  cost: string;
  status: "pending" | "in_progress" | "completed";
  requestDate: string;
  completionDate: string | null;
  notes: string | null;
  unit: {
    id: number;
    unitNumber: string;
    unitType: string;
  };
  task: {
    id: number;
    boardId: number;
    title: string;
    completedAt: string | null;
    board: { id: number; name: string };
  } | null;
}

interface UnitOption {
  id: number;
  unitNumber: string;
  unitType: string;
}

interface FormData {
  unitId: string;
  description: string;
  contractor: string;
  cost: string;
  notes: string;
}

const emptyForm: FormData = {
  unitId: "",
  description: "",
  contractor: "",
  cost: "",
  notes: "",
};

const statusBadgeConfig: Record<
  string,
  { bg: string; text: string; icon: typeof Clock }
> = {
  pending: { bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock },
  in_progress: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    icon: Settings2,
  },
  completed: {
    bg: "bg-green-100",
    text: "text-green-700",
    icon: CheckCircle2,
  },
};

export default function MaintenancePage() {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<MaintenanceStatus>("all");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [editRecord, setEditRecord] = useState<MaintenanceRecord | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [convertRecord, setConvertRecord] = useState<MaintenanceRecord | null>(
    null,
  );
  const [page, setPage] = useState(1);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`/api/maintenance?${params}`);
      if (!res.ok) throw new Error("فشل تحميل سجلات الصيانة");
      const json = await res.json();
      setRecords(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Reset pagination whenever the status filter changes.
  useEffect(() => {
    setPage(1);
  }, [filterStatus]);

  const pagedRecords = usePaginatedSlice(records, page, PAGE_SIZE);

  useEffect(() => {
    fetch("/api/units")
      .then((res) => res.json())
      .then((data) => setUnits(data))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: parseInt(form.unitId),
          description: form.description,
          contractor: form.contractor || null,
          cost: form.cost ? parseFloat(form.cost) : 0,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "فشل إنشاء طلب الصيانة");
      }
      setShowForm(false);
      setForm(emptyForm);
      fetchRecords();
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل إنشاء طلب الصيانة");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateRecord(
    record: MaintenanceRecord,
    updates: Record<string, unknown>
  ) {
    setUpdatingId(record.id);
    try {
      const res = await fetch(`/api/maintenance/${record.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("فشل تحديث سجل الصيانة");
      setEditRecord(null);
      fetchRecords();
    } catch {
      alert("فشل تحديث سجل الصيانة");
    } finally {
      setUpdatingId(null);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={fetchRecords}
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
        <h1 className="text-xl sm:text-2xl font-bold text-primary">سجل الصيانة</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium w-full sm:w-auto justify-center"
        >
          <Plus size={18} />
          طلب صيانة جديد
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {(
          [
            { key: "all", label: "الكل" },
            { key: "pending", label: "قيد الانتظار" },
            { key: "in_progress", label: "قيد التنفيذ" },
            { key: "completed", label: "مكتمل" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setFilterStatus(item.key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              filterStatus === item.key
                ? "bg-primary text-white"
                : "bg-card-bg text-gray-600 hover:bg-gray-100 shadow-sm"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Wrench size={48} className="mb-3 opacity-50" />
            <p>لا توجد سجلات صيانة</p>
          </div>
        ) : (
          <>
          {/* Desktop Table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-right px-4 py-3 font-medium">رقم</th>
                  <th className="text-right px-4 py-3 font-medium">الوحدة</th>
                  <th className="text-right px-4 py-3 font-medium">
                    وصف العمل
                  </th>
                  <th className="text-right px-4 py-3 font-medium">المقاول</th>
                  <th className="text-right px-4 py-3 font-medium">التكلفة</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium">
                    تاريخ الطلب
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    تاريخ الإنجاز
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    متابعة الفريق
                  </th>
                  <th className="text-right px-4 py-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedRecords.map((record) => {
                  const badge =
                    statusBadgeConfig[record.status] ||
                    statusBadgeConfig.pending;
                  const BadgeIcon = badge.icon;
                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-gray-500">
                          <Hash size={14} />
                          {record.id}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {record.unit.unitNumber}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">
                        {record.description}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {record.contractor ? (
                          <span className="flex items-center gap-1">
                            <User size={14} className="text-gray-400" />
                            {record.contractor}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {formatAmount(record.cost)} د.أ
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full",
                            badge.bg,
                            badge.text
                          )}
                        >
                          <BadgeIcon size={12} />
                          {statusLabels[record.status] || record.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} className="text-gray-400" />
                          {formatDate(record.requestDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {record.completionDate
                          ? formatDate(record.completionDate)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <TaskLinkCell
                          record={record}
                          onConvert={() => setConvertRecord(record)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setEditRecord(record)}
                          className="text-primary-light hover:text-primary text-xs font-medium hover:underline"
                        >
                          تعديل
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {pagedRecords.map((record) => {
              const badge =
                statusBadgeConfig[record.status] ||
                statusBadgeConfig.pending;
              const BadgeIcon = badge.icon;
              return (
                <div key={record.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">#{record.id}</span>
                      <span className="font-bold text-gray-800">{record.unit.unitNumber}</span>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full",
                        badge.bg,
                        badge.text
                      )}
                    >
                      <BadgeIcon size={12} />
                      {statusLabels[record.status] || record.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{record.description}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>💰 {formatAmount(record.cost)} د.أ</span>
                    {record.contractor && <span>👷 {record.contractor}</span>}
                    <span>📅 {formatDate(record.requestDate)}</span>
                  </div>
                  <TaskLinkCell
                    record={record}
                    onConvert={() => setConvertRecord(record)}
                  />
                  <button
                    onClick={() => setEditRecord(record)}
                    className="text-primary text-xs font-medium hover:underline"
                  >
                    تعديل
                  </button>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-gold/20">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={records.length}
              onChange={setPage}
            />
          </div>
          </>
        )}
      </div>

      {/* New Maintenance Form Modal */}
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
                طلب صيانة جديد
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الوحدة
                </label>
                <select
                  required
                  value={form.unitId}
                  onChange={(e) =>
                    setForm({ ...form, unitId: e.target.value })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">اختر الوحدة</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitNumber} -{" "}
                      {u.unitType === "room" ? "غرفة" : "شقة"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  وصف العمل المطلوب
                </label>
                <textarea
                  required
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="وصف تفصيلي لأعمال الصيانة المطلوبة"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المقاول / الفني
                  </label>
                  <input
                    type="text"
                    value={form.contractor}
                    onChange={(e) =>
                      setForm({ ...form, contractor: e.target.value })
                    }
                    placeholder="اسم المقاول"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    التكلفة (د.أ)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) =>
                      setForm({ ...form, cost: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ملاحظات
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                  placeholder="ملاحظات إضافية (اختياري)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="flex gap-3 pt-2">
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
                  {submitting ? "جاري الحفظ..." : "إنشاء طلب الصيانة"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editRecord && (
        <EditMaintenanceModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSave={handleUpdateRecord}
          saving={updatingId === editRecord.id}
        />
      )}

      {/* Convert-to-Task Modal */}
      {convertRecord && (
        <ConvertToTaskModal
          record={convertRecord}
          onClose={() => setConvertRecord(null)}
          onConverted={() => {
            setConvertRecord(null);
            fetchRecords();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Task Link Cell — shows either the "Convert" button or a link to the card
// ────────────────────────────────────────────────────────────────────────

function TaskLinkCell({
  record,
  onConvert,
}: {
  record: MaintenanceRecord;
  onConvert: () => void;
}) {
  if (record.task) {
    const isDone = !!record.task.completedAt;
    return (
      <Link
        href={`/tasks/${record.task.boardId}?task=${record.task.id}`}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium hover:underline",
          isDone ? "text-emerald-700" : "text-primary",
        )}
        title={`اللوحة: ${record.task.board.name}`}
      >
        <KanbanSquare size={14} />
        <span className="truncate max-w-[140px]">
          {isDone ? "مهمة مكتملة" : `مهمة #${record.task.id}`}
        </span>
        <ArrowUpRight size={12} />
      </Link>
    );
  }

  if (record.status === "completed") {
    return <span className="text-xs text-gray-300">—</span>;
  }

  return (
    <Can permission="tasks.cards:create">
      <button
        onClick={onConvert}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        <KanbanSquare size={14} />
        تنفيذ كمهمة
      </button>
    </Can>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Convert-to-Task Modal
// ────────────────────────────────────────────────────────────────────────

interface BoardLite {
  id: number;
  name: string;
  color: string | null;
  members?: { user: { id: number; name: string } }[];
}

interface ColumnLite {
  id: number;
  name: string;
  position: number;
}

function ConvertToTaskModal({
  record,
  onClose,
  onConverted,
}: {
  record: MaintenanceRecord;
  onClose: () => void;
  onConverted: () => void;
}) {
  const [boards, setBoards] = useState<BoardLite[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [columns, setColumns] = useState<ColumnLite[]>([]);
  const [columnId, setColumnId] = useState<number | null>(null);
  const [members, setMembers] = useState<
    { id: number; name: string }[]
  >([]);
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [priority, setPriority] = useState<
    "low" | "med" | "high" | "urgent"
  >("high");
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingBoards(true);
      try {
        const res = await fetch("/api/tasks/boards");
        if (!res.ok) throw new Error("فشل تحميل اللوحات");
        const data = (await res.json()) as BoardLite[];
        if (cancelled) return;
        setBoards(data);
        if (data.length > 0) {
          setBoardId(data[0].id);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "فشل التحميل");
      } finally {
        if (!cancelled) setLoadingBoards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!boardId) {
      setColumns([]);
      setMembers([]);
      setColumnId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingBoard(true);
      try {
        const res = await fetch(`/api/tasks/boards/${boardId}`);
        if (!res.ok) throw new Error("فشل تحميل اللوحة");
        const data = await res.json();
        if (cancelled) return;
        const cols: ColumnLite[] = (data.columns || []).map(
          (c: ColumnLite) => ({
            id: c.id,
            name: c.name,
            position: c.position,
          }),
        );
        setColumns(cols);
        setColumnId(cols[0]?.id ?? null);
        setMembers(
          (data.members || []).map(
            (m: { user: { id: number; name: string } }) => ({
              id: m.user.id,
              name: m.user.name,
            }),
          ),
        );
        setAssigneeIds([]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "فشل التحميل");
      } finally {
        if (!cancelled) setLoadingBoard(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!boardId || !columnId) {
      toast.error("اختر لوحة وعموداً");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/maintenance/${record.id}/convert-to-task`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            boardId,
            columnId,
            assigneeIds,
            priority,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل إنشاء البطاقة");
      }
      toast.success("تم إنشاء بطاقة المهمة وربطها بسجل الصيانة");
      onConverted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الإنشاء");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              تنفيذ كمهمة على لوحة كانبان
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              صيانة #{record.id} — الوحدة {record.unit.unitNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-4 overflow-y-auto"
        >
          {loadingBoards ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : boards.length === 0 ? (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">
              لا تملك أي لوحة مهام بعد. أنشئ لوحة من قسم «المهام» أولاً.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  اللوحة
                </label>
                <select
                  value={boardId ?? ""}
                  onChange={(e) => setBoardId(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  العمود
                </label>
                <select
                  value={columnId ?? ""}
                  onChange={(e) => setColumnId(Number(e.target.value))}
                  disabled={loadingBoard || columns.length === 0}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-50"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الأولوية
                </label>
                <select
                  value={priority}
                  onChange={(e) =>
                    setPriority(
                      e.target.value as "low" | "med" | "high" | "urgent",
                    )
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="low">منخفضة</option>
                  <option value="med">متوسطة</option>
                  <option value="high">مرتفعة</option>
                  <option value="urgent">عاجلة</option>
                </select>
              </div>

              {members.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    إسناد إلى (اختياري)
                  </label>
                  <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {members.map((m) => {
                      const selected = assigneeIds.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) =>
                              setAssigneeIds((prev) =>
                                e.target.checked
                                  ? [...prev, m.id]
                                  : prev.filter((x) => x !== m.id),
                              )
                            }
                          />
                          <span className="text-gray-800">{m.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3 text-xs space-y-1">
                <div className="font-medium">
                  عند إنجاز البطاقة على الكانبان:
                </div>
                <ul className="list-disc ps-4 space-y-0.5">
                  <li>يُغلَق سجل الصيانة تلقائياً</li>
                  <li>يُرحَّل قيد المصروف في الدفاتر المحاسبية</li>
                  <li>تُحرَّر الوحدة إن لم يكن عليها أعمال صيانة أخرى</li>
                </ul>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={
                submitting ||
                loadingBoards ||
                boards.length === 0 ||
                !boardId ||
                !columnId
              }
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium text-sm disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <KanbanSquare size={18} />
              )}
              {submitting ? "جاري الإنشاء..." : "إنشاء البطاقة"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditMaintenanceModal({
  record,
  onClose,
  onSave,
  saving,
}: {
  record: MaintenanceRecord;
  onClose: () => void;
  onSave: (record: MaintenanceRecord, updates: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState(record.status);
  const [contractor, setContractor] = useState(record.contractor || "");
  const [cost, setCost] = useState(record.cost);
  const [description, setDescription] = useState(record.description);
  const [notes, setNotes] = useState(record.notes || "");

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(record, {
      status,
      contractor: contractor || null,
      cost: parseFloat(cost),
      description,
      notes: notes || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">
            تعديل سجل الصيانة #{record.id} — الوحدة {record.unit.unitNumber}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              الحالة
            </label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target.value as "pending" | "in_progress" | "completed"
                )
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="pending">قيد الانتظار</option>
              <option value="in_progress">قيد التنفيذ</option>
              <option value="completed">مكتمل</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              وصف العمل
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                المقاول
              </label>
              <input
                type="text"
                value={contractor}
                onChange={(e) => setContractor(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                التكلفة (د.أ)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ملاحظات
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium text-sm disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <CheckCircle2 size={18} />
              )}
              {saving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
