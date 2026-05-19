"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import {
  ScrollText,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Download,
  Clock,
  User,
  Globe,
  Monitor,
  Loader2,
  Eye,
} from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions/client";

interface AuditRow {
  id: number;
  timestamp: string;
  userId: number | null;
  userEmail: string | null;
  userName: string | null;
  audience: string;
  action: string;
  resource: string;
  resourceId: string | null;
  summary: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  httpMethod: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
}

interface Filters {
  from: string;
  to: string;
  userId: string;
  action: string;
  resource: string;
  search: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  CREATE: { label: "إنشاء", color: "bg-emerald-100 text-emerald-800" },
  UPDATE: { label: "تعديل", color: "bg-amber-100 text-amber-800" },
  DELETE: { label: "حذف", color: "bg-rose-100 text-rose-800" },
  LOGIN: { label: "تسجيل دخول", color: "bg-blue-100 text-blue-800" },
  LOGIN_FAILED: { label: "فشل دخول", color: "bg-red-100 text-red-800" },
  LOGOUT: { label: "تسجيل خروج", color: "bg-gray-100 text-gray-700" },
  EXPORT: { label: "تصدير", color: "bg-purple-100 text-purple-800" },
  VOID: { label: "إلغاء", color: "bg-orange-100 text-orange-800" },
  APPROVE: { label: "موافقة", color: "bg-teal-100 text-teal-800" },
  VIEW_SENSITIVE: { label: "عرض حساس", color: "bg-pink-100 text-pink-800" },
};

const AUDIENCE_LABELS: Record<string, string> = {
  staff: "موظف",
  guest: "ضيف",
  system: "نظام",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ar-SA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  if (!data || (typeof data === "object" && Object.keys(data as object).length === 0))
    return null;
  return (
    <div>
      <p className="text-xs font-bold text-gray-500 mb-1">{label}</p>
      <pre
        dir="ltr"
        className="text-xs bg-gray-50 border rounded-lg p-3 overflow-x-auto max-h-60 whitespace-pre-wrap break-all"
      >
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function DetailModal({
  row,
  onClose,
}: {
  row: AuditRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ScrollText size={20} className="text-primary" />
            تفاصيل السجل #{row.id}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500 text-xs">التاريخ والوقت</span>
              <p className="font-medium flex items-center gap-1.5 mt-0.5">
                <Clock size={14} className="text-gray-400" />
                {formatDateTime(row.timestamp)}
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">المستخدم</span>
              <p className="font-medium flex items-center gap-1.5 mt-0.5">
                <User size={14} className="text-gray-400" />
                {row.userName || row.userEmail || "نظام"}
                {row.userId && (
                  <span className="text-xs text-gray-400">#{row.userId}</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">العملية</span>
              <p className="mt-0.5">
                <span
                  className={cn(
                    "inline-block px-2 py-0.5 rounded-full text-xs font-bold",
                    ACTION_LABELS[row.action]?.color ?? "bg-gray-100 text-gray-700",
                  )}
                >
                  {ACTION_LABELS[row.action]?.label ?? row.action}
                </span>
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">المورد</span>
              <p className="font-medium mt-0.5">
                {row.resource}
                {row.resourceId && (
                  <span className="text-xs text-gray-400 mr-1">
                    #{row.resourceId}
                  </span>
                )}
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">الجمهور</span>
              <p className="font-medium mt-0.5">
                {AUDIENCE_LABELS[row.audience] ?? row.audience}
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">HTTP</span>
              <p className="font-mono text-xs mt-0.5">
                {row.httpMethod} {row.path}
                {row.statusCode && (
                  <span className="text-gray-400 mr-2">
                    ({row.statusCode})
                  </span>
                )}
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">عنوان IP</span>
              <p className="font-mono text-xs mt-0.5 flex items-center gap-1.5">
                <Globe size={14} className="text-gray-400" />
                {row.ipAddress || "—"}
              </p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">المدة</span>
              <p className="font-medium mt-0.5">
                {row.durationMs != null ? `${row.durationMs} ms` : "—"}
              </p>
            </div>
          </div>

          {row.summary && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">الملخص</p>
              <p className="text-sm bg-gray-50 rounded-lg p-3 border">
                {row.summary}
              </p>
            </div>
          )}

          <JsonBlock data={row.oldValues} label="القيم القديمة" />
          <JsonBlock data={row.newValues} label="القيم الجديدة" />
          <JsonBlock data={row.metadata} label="بيانات إضافية" />

          {row.userAgent && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">المتصفح</p>
              <p
                dir="ltr"
                className="text-xs font-mono bg-gray-50 rounded-lg p-3 border break-all flex items-start gap-1.5"
              >
                <Monitor size={14} className="text-gray-400 shrink-0 mt-0.5" />
                {row.userAgent}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuditLogPage() {
  const { can } = usePermissions();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    from: "",
    to: "",
    userId: "",
    action: "",
    resource: "",
    search: "",
  });
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const limit = 30;

  const fetchLogs = useCallback(
    async (p: number, f: Filters) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(p));
        params.set("limit", String(limit));
        if (f.from) params.set("from", f.from);
        if (f.to) params.set("to", f.to);
        if (f.userId) params.set("userId", f.userId);
        if (f.action) params.set("action", f.action);
        if (f.resource) params.set("resource", f.resource);
        if (f.search) params.set("search", f.search);

        const res = await fetch(`/api/audit-logs?${params}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setPages(data.pages ?? 1);
        setPage(p);
      } catch {
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [limit],
  );

  useEffect(() => {
    fetchLogs(1, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = useCallback(
    (newFilters: Filters) => {
      setFilters(newFilters);
      fetchLogs(1, newFilters);
    },
    [fetchLogs],
  );

  const handleSearch = useCallback(
    (value: string) => {
      const updated = { ...filters, search: value };
      setFilters(updated);
      clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => fetchLogs(1, updated), 400);
    },
    [filters, fetchLogs],
  );

  const clearFilters = useCallback(() => {
    const empty: Filters = {
      from: "",
      to: "",
      userId: "",
      action: "",
      resource: "",
      search: "",
    };
    applyFilters(empty);
  }, [applyFilters]);

  const hasActiveFilters =
    filters.from ||
    filters.to ||
    filters.userId ||
    filters.action ||
    filters.resource;

  const canExport = can("settings.audit_log:export");

  const handleExport = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "5000");
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.action) params.set("action", filters.action);
    if (filters.resource) params.set("resource", filters.resource);
    if (filters.search) params.set("search", filters.search);

    try {
      const res = await fetch(`/api/audit-logs?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const csvRows = [
        [
          "ID",
          "Timestamp",
          "User",
          "Email",
          "Audience",
          "Action",
          "Resource",
          "ResourceID",
          "Summary",
          "IP",
          "Method",
          "Path",
          "Duration(ms)",
        ].join(","),
        ...(data.rows ?? []).map((r: AuditRow) =>
          [
            r.id,
            r.timestamp,
            `"${(r.userName ?? "").replace(/"/g, '""')}"`,
            r.userEmail ?? "",
            r.audience,
            r.action,
            r.resource,
            r.resourceId ?? "",
            `"${(r.summary ?? "").replace(/"/g, '""')}"`,
            r.ipAddress ?? "",
            r.httpMethod ?? "",
            r.path ?? "",
            r.durationMs ?? "",
          ].join(","),
        ),
      ];

      const bom = "﻿";
      const blob = new Blob([bom + csvRows.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, [filters]);

  return (
    <PageShell>
      <PageHeader
        title="سجل المراجعة"
        icon={<ScrollText size={24} />}
        description="سجل شامل لجميع العمليات على النظام — متوافق مع ISO 27001"
        actions={
          <div className="flex items-center gap-2">
            {canExport && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download size={16} />
                تصدير CSV
              </button>
            )}
            <button
              onClick={() => setShowFilters((p) => !p)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors",
                showFilters || hasActiveFilters
                  ? "bg-primary text-white border-primary"
                  : "bg-white hover:bg-gray-50",
              )}
            >
              <Filter size={16} />
              فلترة
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-white" />
              )}
            </button>
          </div>
        }
      />

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">من تاريخ</label>
              <input
                type="date"
                value={filters.from}
                onChange={(e) =>
                  applyFilters({ ...filters, from: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={filters.to}
                onChange={(e) =>
                  applyFilters({ ...filters, to: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">العملية</label>
              <select
                value={filters.action}
                onChange={(e) =>
                  applyFilters({ ...filters, action: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">الكل</option>
                {Object.entries(ACTION_LABELS).map(([key, v]) => (
                  <option key={key} value={key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">المورد</label>
              <input
                type="text"
                placeholder="مثال: Reservation"
                value={filters.resource}
                onChange={(e) =>
                  applyFilters({ ...filters, resource: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                رقم المستخدم
              </label>
              <input
                type="number"
                placeholder="User ID"
                value={filters.userId}
                onChange={(e) =>
                  applyFilters({ ...filters, userId: e.target.value })
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X size={14} />
                  مسح الفلاتر
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search
          size={18}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          placeholder="بحث في السجلات (اسم، بريد، مسار، معرّف المورد...)"
          value={filters.search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full border rounded-xl pr-10 pl-4 py-2.5 text-sm bg-white"
        />
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {total.toLocaleString("ar-SA")} سجل
          {hasActiveFilters && " (مع فلترة)"}
        </span>
        <span>
          صفحة {page.toLocaleString("ar-SA")} من{" "}
          {pages.toLocaleString("ar-SA")}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-600">
                <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                <th className="text-right px-4 py-3 font-medium">المستخدم</th>
                <th className="text-right px-4 py-3 font-medium">العملية</th>
                <th className="text-right px-4 py-3 font-medium">المورد</th>
                <th className="text-right px-4 py-3 font-medium">الملخص</th>
                <th className="text-right px-4 py-3 font-medium">IP</th>
                <th className="text-center px-4 py-3 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2
                      size={24}
                      className="animate-spin mx-auto text-primary"
                    />
                    <p className="text-gray-400 mt-2">جاري التحميل...</p>
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    لا توجد سجلات
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const act = ACTION_LABELS[row.action];
                return (
                  <tr
                    key={row.id}
                    className="border-b last:border-0 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                      {formatDateTime(row.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium">
                        {row.userName || row.userEmail || "نظام"}
                      </div>
                      {row.userName && row.userEmail && (
                        <div className="text-[11px] text-gray-400">
                          {row.userEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 rounded-full text-[11px] font-bold",
                          act?.color ?? "bg-gray-100 text-gray-700",
                        )}
                      >
                        {act?.label ?? row.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-medium">{row.resource}</span>
                      {row.resourceId && (
                        <span className="text-gray-400 mr-1">
                          #{row.resourceId}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">
                      {row.summary || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">
                      {row.ipAddress || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setDetail(row)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-primary"
                        title="عرض التفاصيل"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => fetchLogs(page - 1, filters)}
            className="p-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
            let p: number;
            if (pages <= 7) {
              p = i + 1;
            } else if (page <= 4) {
              p = i + 1;
            } else if (page >= pages - 3) {
              p = pages - 6 + i;
            } else {
              p = page - 3 + i;
            }
            return (
              <button
                key={p}
                onClick={() => fetchLogs(p, filters)}
                className={cn(
                  "min-w-[36px] h-9 rounded-lg text-sm transition-colors",
                  p === page
                    ? "bg-primary text-white font-bold"
                    : "border bg-white hover:bg-gray-50",
                )}
              >
                {p.toLocaleString("ar-SA")}
              </button>
            );
          })}
          <button
            disabled={page >= pages}
            onClick={() => fetchLogs(page + 1, filters)}
            className="p-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      )}

      {/* Detail modal */}
      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} />}
    </PageShell>
  );
}
