"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  Plus,
  Save,
  Trash2,
  Pencil,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { usePermissions } from "@/lib/permissions/client";

interface Permission {
  id: number;
  key: string;
  action: string;
  label: string;
}
interface Resource {
  id: number;
  key: string;
  label: string;
  category: string;
  permissions: Permission[];
}
interface Role {
  id: number;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  _count?: { users: number; permissions: number };
}
interface RoleDetail extends Role {
  permissions: { permission: Permission }[];
}

const ACTION_COLORS: Record<string, string> = {
  view: "bg-blue-50 text-blue-700 border-blue-200",
  create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  edit: "bg-amber-50 text-amber-700 border-amber-200",
  delete: "bg-rose-50 text-rose-700 border-rose-200",
};

const CATEGORY_LABELS: Record<string, string> = {
  operations: "العمليات",
  accounting: "المحاسبة",
  reports: "التقارير",
  admin: "الإدارة",
  general: "عام",
};

export default function RolesPage() {
  const { can, refetch } = usePermissions();

  const [roles, setRoles] = useState<Role[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [roleDetail, setRoleDetail] = useState<RoleDetail | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    key: "",
    name: "",
    description: "",
  });

  const canEdit = can("settings.roles:edit");
  const canCreate = can("settings.roles:create");
  const canDelete = can("settings.roles:delete");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch("/api/roles").then((r) => r.json()),
        fetch("/api/permissions").then((r) => r.json()),
      ]);
      if (rolesRes.error) throw new Error(rolesRes.error);
      if (permsRes.error) throw new Error(permsRes.error);
      setRoles(rolesRes.roles);
      setResources(permsRes.resources);
      if (rolesRes.roles.length > 0 && !selectedRoleId) {
        setSelectedRoleId(rolesRes.roles[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [selectedRoleId]);

  const loadRoleDetail = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/roles/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRoleDetail(data);
      setSelectedPerms(
        new Set(data.permissions.map((p: { permission: { id: number } }) => p.permission.id)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الدور");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedRoleId) loadRoleDetail(selectedRoleId);
  }, [selectedRoleId, loadRoleDetail]);

  const togglePerm = (id: number) => {
    if (!canEdit) return;
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleResourceAll = (resource: Resource) => {
    if (!canEdit) return;
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      const allSelected = resource.permissions.every((p) => next.has(p.id));
      for (const p of resource.permissions) {
        if (allSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  };

  const savePermissions = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/roles/${selectedRoleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionIds: Array.from(selectedPerms) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess("تم حفظ الصلاحيات بنجاح");
      await refetch();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const createRole = async () => {
    if (!createForm.key.trim() || !createForm.name.trim()) {
      setError("المفتاح والاسم مطلوبان");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowCreate(false);
      setCreateForm({ key: "", name: "", description: "" });
      await loadData();
      setSelectedRoleId(data.id);
      setSuccess("تم إنشاء الدور");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل");
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const deleteRole = async (role: Role) => {
    if (role.isSystem) return;
    if (!confirm(`هل أنت متأكد من حذف الدور "${role.name}"؟`)) return;
    try {
      const res = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (selectedRoleId === role.id) setSelectedRoleId(null);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحذف");
    }
  };

  if (!can("settings.roles:view")) {
    return (
      <div className="max-w-xl mx-auto mt-20 bg-white rounded-2xl border p-8 text-center">
        <Lock className="w-14 h-14 text-rose-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-rose-700 mb-2">لا تملك صلاحية</h2>
        <p className="text-gray-500">لعرض هذه الصفحة تحتاج صلاحية <code>settings.roles:view</code>.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Shield className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">إدارة الأدوار والصلاحيات</h1>
            <p className="text-sm text-gray-500">تحكّم في من يستطيع الوصول إلى كل قسم في النظام</p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            دور جديد
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Roles list */}
        <aside className="bg-white rounded-2xl border border-gray-200 p-3 h-fit">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-2">الأدوار</div>
          <div className="space-y-1">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRoleId(r.id)}
                className={`w-full text-right px-3 py-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                  selectedRoleId === r.id
                    ? "bg-primary text-white border-primary"
                    : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <div className="flex-1 text-right">
                  <div className="font-semibold flex items-center gap-2 justify-end">
                    {r.isSystem && <Lock className="w-3.5 h-3.5 opacity-60" />}
                    {r.name}
                  </div>
                  <div className={`text-xs ${selectedRoleId === r.id ? "text-white/70" : "text-gray-500"}`}>
                    {r._count?.permissions ?? 0} صلاحية · {r._count?.users ?? 0} مستخدم
                  </div>
                </div>
                {canDelete && !r.isSystem && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRole(r);
                    }}
                    className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
                    title="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Permissions matrix */}
        {roleDetail && (
          <main className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap border-b border-gray-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">{roleDetail.name}</h2>
                  {roleDetail.isSystem && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      دور نظامي
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {roleDetail.description || "—"}
                </div>
                <div className="text-xs text-gray-400 mt-1 font-mono">
                  {roleDetail.key}
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={savePermissions}
                  disabled={saving}
                  className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  حفظ
                </button>
              )}
            </div>

            {/* Matrix grouped by category */}
            {Object.entries(
              resources.reduce<Record<string, Resource[]>>((acc, r) => {
                (acc[r.category] ||= []).push(r);
                return acc;
              }, {}),
            ).map(([category, list]) => (
              <section key={category}>
                <h3 className="text-sm font-bold text-gray-700 mb-3 pb-1 border-b">
                  {CATEGORY_LABELS[category] ?? category}
                </h3>
                <div className="space-y-2">
                  {list.map((res) => {
                    const allSelected = res.permissions.every((p) => selectedPerms.has(p.id));
                    const someSelected = res.permissions.some((p) => selectedPerms.has(p.id));
                    return (
                      <div
                        key={res.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 flex-wrap"
                      >
                        <label className="flex items-center gap-2 min-w-[240px] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = !allSelected && someSelected;
                            }}
                            disabled={!canEdit}
                            onChange={() => toggleResourceAll(res)}
                            className="w-4 h-4 accent-primary"
                          />
                          <span className="font-medium text-gray-800">{res.label}</span>
                          <code className="text-xs text-gray-400">{res.key}</code>
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          {res.permissions.map((p) => {
                            const active = selectedPerms.has(p.id);
                            const color =
                              ACTION_COLORS[p.action] ?? "bg-gray-50 text-gray-700 border-gray-200";
                            return (
                              <button
                                key={p.id}
                                disabled={!canEdit}
                                onClick={() => togglePerm(p.id)}
                                className={`text-xs px-2.5 py-1 rounded-md border transition ${
                                  active
                                    ? color + " ring-2 ring-offset-1 ring-primary/40 font-bold"
                                    : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                                } ${!canEdit ? "cursor-not-allowed opacity-70" : ""}`}
                                title={p.key}
                              >
                                {p.action}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </main>
        )}
      </div>

      {/* Create role modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl sm:max-w-md w-full p-4 sm:p-6 space-y-4 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">دور جديد</h3>
              <button onClick={() => setShowCreate(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  المفتاح (بالإنجليزية)
                </label>
                <input
                  value={createForm.key}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, key: e.target.value.trim() })
                  }
                  placeholder="e.g. supervisor"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الاسم
                </label>
                <input
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  placeholder="مثال: مشرف"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  الوصف (اختياري)
                </label>
                <textarea
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, description: e.target.value })
                  }
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={createRole}
                disabled={saving}
                className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إنشاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
