"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Settings,
  Users,
  Tag,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  Save,
  Calendar,
  Shield,
  BedDouble,
  DoorOpen,
  Network,
  MessageCircle,
  Bell,
  Search,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { cn, formatDate, roleLabels } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions/client";
import { Can } from "@/components/Can";
import { UserAvatar } from "@/components/tasks/shared";
import { PageShell } from "@/components/ui/PageShell";

interface UserRecord {
  id: number;
  name: string;
  email: string;
  username: string | null;
  role: "admin" | "receptionist" | "accountant";
  avatarUrl?: string | null;
  whatsappPhone?: string | null;
  createdAt: string;
}

interface SeasonalPrice {
  id: number;
  seasonName: string;
  startDate: string;
  endDate: string;
  roomDaily: string;
  roomWeekly: string;
  roomMonthly: string;
  aptDaily: string;
  aptWeekly: string;
  aptMonthly: string;
}

interface UserFormData {
  name: string;
  email: string;
  username: string;
  password: string;
  role: "admin" | "receptionist" | "accountant";
  whatsappPhone: string;
}

const emptyUserForm: UserFormData = {
  name: "",
  email: "",
  username: "",
  password: "",
  role: "receptionist",
  whatsappPhone: "",
};

export default function SettingsPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [prices, setPrices] = useState<SeasonalPrice[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [userForm, setUserForm] = useState<UserFormData>(emptyUserForm);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [editedPrices, setEditedPrices] = useState<Record<number, Partial<SeasonalPrice>>>({});
  const [savingPriceId, setSavingPriceId] = useState<number | null>(null);
  const [overridesUser, setOverridesUser] = useState<UserRecord | null>(null);
  const [search, setSearch] = useState("");
  const { can } = usePermissions();

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("فشل تحميل المستخدمين");
      const json = await res.json();
      setUsers(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchPrices = useCallback(async () => {
    setLoadingPrices(true);
    try {
      const res = await fetch("/api/seasonal-prices");
      if (!res.ok) throw new Error("فشل تحميل الأسعار");
      const json = await res.json();
      setPrices(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoadingPrices(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchPrices();
  }, [fetchUsers, fetchPrices]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingUser(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "فشل إنشاء المستخدم");
      }
      setShowUserForm(false);
      setUserForm(emptyUserForm);
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل إنشاء المستخدم");
    } finally {
      setSubmittingUser(false);
    }
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSubmittingUser(true);
    try {
      const body: Record<string, string> = {
        name: userForm.name,
        email: userForm.email,
        username: userForm.username,
        role: userForm.role,
        whatsappPhone: userForm.whatsappPhone,
      };
      if (userForm.password) body.password = userForm.password;

      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "فشل تحديث المستخدم");
      }
      setEditUser(null);
      setUserForm(emptyUserForm);
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل تحديث المستخدم");
    } finally {
      setSubmittingUser(false);
    }
  }

  async function handleDeleteUser(userId: number) {
    if (!confirm("هل أنت متأكد من حذف هذا المستخدم؟")) return;
    setDeletingUserId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("فشل حذف المستخدم");
      fetchUsers();
    } catch {
      alert("فشل حذف المستخدم");
    } finally {
      setDeletingUserId(null);
    }
  }

  function handlePriceEdit(id: number, field: string, value: string) {
    setEditedPrices((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  async function handleSavePrice(price: SeasonalPrice) {
    const edits = editedPrices[price.id];
    if (!edits) return;
    setSavingPriceId(price.id);
    try {
      const body: Record<string, unknown> = { id: price.id };
      for (const [key, value] of Object.entries(edits)) {
        if (key === "startDate" || key === "endDate") {
          body[key] = value;
        } else if (key === "seasonName") {
          body[key] = value;
        } else {
          body[key] = parseFloat(value as string);
        }
      }

      const res = await fetch("/api/seasonal-prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("فشل حفظ الأسعار");

      setEditedPrices((prev) => {
        const next = { ...prev };
        delete next[price.id];
        return next;
      });
      fetchPrices();
    } catch {
      alert("فشل حفظ الأسعار");
    } finally {
      setSavingPriceId(null);
    }
  }

  if (error && !users.length && !prices.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={() => {
            setError(null);
            fetchUsers();
            fetchPrices();
          }}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <PageShell className="gap-6 sm:gap-8">
      {/* ─── Hero ─────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-primary/90 via-primary to-primary-dark text-white shadow-lg">
        <div
          aria-hidden
          className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_20%,#fff_0,transparent_40%),radial-gradient(circle_at_80%_80%,#fff_0,transparent_40%)]"
        />
        <div className="relative px-5 sm:px-8 py-6 sm:py-8 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-inner">
              <Settings size={28} className="text-gold" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-[family-name:var(--font-amiri)] tracking-tight">
                مركز الإعدادات
              </h1>
              <p className="text-sm text-white/70 mt-1 max-w-xl leading-relaxed">
                مركز قيادة فندق المفرق — كل ما يحتاجه المدراء لضبط المنظومة،
                إدارة الصلاحيات، الأسعار، والتكاملات.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <StatPill
              label="مستخدمون"
              value={loadingUsers ? "…" : String(users.length)}
            />
            <StatPill
              label="مواسم"
              value={loadingPrices ? "…" : String(prices.length)}
            />
          </div>
        </div>
      </section>

      {/* ─── Modules — searchable grid ───────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            الوحدات والتكاملات
          </h2>
          <div className="relative flex-1 sm:flex-none sm:min-w-[280px]">
            <Search
              size={14}
              className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في الوحدات…"
              className="w-full border border-gray-200 rounded-lg ps-8 pe-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>
        <ModuleGrid search={search} />
      </section>

      {/* ─── Users ───────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
              <Users size={20} className="text-primary" />
              المستخدمون وفريق العمل
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {users.length > 0
                ? `${users.length} مستخدم في الفريق`
                : "لا يوجد مستخدمون بعد"}
            </p>
          </div>
          <Can permission="settings.users:create">
            <button
              onClick={() => {
                setShowUserForm(true);
                setEditUser(null);
                setUserForm(emptyUserForm);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium w-full sm:w-auto justify-center shadow-sm"
            >
              <Plus size={18} />
              إضافة مستخدم
            </button>
          </Can>
        </div>

        <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
          {loadingUsers ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={32} className="animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Users size={48} className="mb-3 opacity-50" />
              <p>لا يوجد مستخدمين</p>
            </div>
          ) : (
            <>
            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-right px-4 py-3 font-medium">الاسم</th>
                    <th className="text-right px-4 py-3 font-medium">
                      البريد الإلكتروني
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      الدور
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      تاريخ الإنشاء
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      إجراءات
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">
                        <div className="flex items-center gap-2">
                          <UserAvatar user={user} size={32} />
                          <span>{user.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 direction-ltr text-right">
                        {user.email}
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {can("settings.users:edit") && (
                            <button
                              onClick={() => {
                                setEditUser(user);
                                setUserForm({
                                  name: user.name,
                                  email: user.email,
                                  username: user.username ?? "",
                                  password: "",
                                  role: user.role,
                                  whatsappPhone: user.whatsappPhone ?? "",
                                });
                                setShowUserForm(false);
                              }}
                              className="p-1.5 text-primary-light hover:text-primary hover:bg-gold-soft rounded-lg transition-colors"
                              title="تعديل"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {can("settings.users:edit") && (
                            <button
                              onClick={() => setOverridesUser(user)}
                              className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                              title="استثناءات الصلاحيات"
                            >
                              <Shield size={16} />
                            </button>
                          )}
                          {can("settings.users:delete") && (
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={deletingUserId === user.id}
                              className="p-1.5 text-red-400 hover:text-danger hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="حذف"
                            >
                              {deletingUserId === user.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {users.map((user) => (
                <div key={user.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar user={user} size={32} />
                      <span className="font-bold text-gray-800 truncate">
                        {user.name}
                      </span>
                    </div>
                    <RoleBadge role={user.role} />
                  </div>
                  <p className="text-sm text-gray-500 direction-ltr text-right">{user.email}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{formatDate(user.createdAt)}</span>
                    <div className="flex items-center gap-2">
                      {can("settings.users:edit") && (
                        <button
                          onClick={() => {
                            setEditUser(user);
                            setUserForm({
                              name: user.name,
                              email: user.email,
                              username: user.username ?? "",
                              password: "",
                              role: user.role,
                              whatsappPhone: user.whatsappPhone ?? "",
                            });
                            setShowUserForm(false);
                          }}
                          className="p-2 text-primary-light hover:text-primary hover:bg-gold-soft rounded-lg transition-colors"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {can("settings.users:edit") && (
                        <button
                          onClick={() => setOverridesUser(user)}
                          className="p-2 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                          title="استثناءات الصلاحيات"
                        >
                          <Shield size={16} />
                        </button>
                      )}
                      {can("settings.users:delete") && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={deletingUserId === user.id}
                          className="p-2 text-red-400 hover:text-danger hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deletingUserId === user.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      </section>

      {/* ─── Seasonal Prices ────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
            <Tag size={20} className="text-primary" />
            الأسعار الموسمية
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            عدِّل السعر مباشرة في الجدول — التغييرات المعلّقة تظهر بخلفية صفراء.
          </p>
        </div>

        <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
          {loadingPrices ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={32} className="animate-spin text-primary" />
            </div>
          ) : prices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Tag size={48} className="mb-3 opacity-50" />
              <p>لا توجد أسعار موسمية</p>
            </div>
          ) : (
            <div className="report-table-wrap">
              <table className="report-table w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="sticky-start text-right px-3 py-3 font-medium">
                      الموسم
                    </th>
                    <th className="text-right px-3 py-3 font-medium">
                      <span className="flex items-center gap-1">
                        <Calendar size={13} />
                        من
                      </span>
                    </th>
                    <th className="text-right px-3 py-3 font-medium">إلى</th>
                    <th className="text-center px-3 py-3 font-medium" colSpan={3}>
                      <span className="text-primary-light">أسعار الغرف</span>
                    </th>
                    <th className="text-center px-3 py-3 font-medium" colSpan={3}>
                      <span className="text-success">أسعار الشقق</span>
                    </th>
                    <th className="text-center px-3 py-3 font-medium w-16">
                      حفظ
                    </th>
                  </tr>
                  <tr className="bg-gray-50/50 text-gray-500 text-xs">
                    <th colSpan={3}></th>
                    <th className="px-2 py-1.5 text-center">يومي</th>
                    <th className="px-2 py-1.5 text-center">أسبوعي</th>
                    <th className="px-2 py-1.5 text-center">شهري</th>
                    <th className="px-2 py-1.5 text-center">يومي</th>
                    <th className="px-2 py-1.5 text-center">أسبوعي</th>
                    <th className="px-2 py-1.5 text-center">شهري</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prices.map((price) => {
                    const edits = editedPrices[price.id] || {};
                    const hasEdits = Object.keys(edits).length > 0;

                    return (
                      <tr
                        key={price.id}
                        className={cn(
                          "transition-colors",
                          hasEdits
                            ? "bg-yellow-50/50"
                            : "hover:bg-gray-50/50"
                        )}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={edits.seasonName ?? price.seasonName}
                            onChange={(e) =>
                              handlePriceEdit(
                                price.id,
                                "seasonName",
                                e.target.value
                              )
                            }
                            className="w-full border border-transparent hover:border-gray-200 focus:border-primary rounded px-2 py-1 text-sm font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={
                              edits.startDate ??
                              price.startDate.split("T")[0]
                            }
                            onChange={(e) =>
                              handlePriceEdit(
                                price.id,
                                "startDate",
                                e.target.value
                              )
                            }
                            className="border border-transparent hover:border-gray-200 focus:border-primary rounded px-2 py-1 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={
                              edits.endDate ?? price.endDate.split("T")[0]
                            }
                            onChange={(e) =>
                              handlePriceEdit(
                                price.id,
                                "endDate",
                                e.target.value
                              )
                            }
                            className="border border-transparent hover:border-gray-200 focus:border-primary rounded px-2 py-1 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent"
                          />
                        </td>
                        {(
                          [
                            "roomDaily",
                            "roomWeekly",
                            "roomMonthly",
                            "aptDaily",
                            "aptWeekly",
                            "aptMonthly",
                          ] as const
                        ).map((field) => (
                          <td key={field} className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                edits[field] ?? price[field]
                              }
                              onChange={(e) =>
                                handlePriceEdit(
                                  price.id,
                                  field,
                                  e.target.value
                                )
                              }
                              className="w-20 border border-transparent hover:border-gray-200 focus:border-primary rounded px-2 py-1 text-sm text-center text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center">
                          {hasEdits && (
                            <button
                              onClick={() => handleSavePrice(price)}
                              disabled={savingPriceId === price.id}
                              className="p-1.5 bg-success text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                              title="حفظ التغييرات"
                            >
                              {savingPriceId === price.id ? (
                                <Loader2
                                  size={16}
                                  className="animate-spin"
                                />
                              ) : (
                                <Save size={16} />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Add User Modal */}
      {showUserForm && (
        <UserFormModal
          title="إضافة مستخدم جديد"
          form={userForm}
          setForm={setUserForm}
          onSubmit={handleCreateUser}
          onClose={() => setShowUserForm(false)}
          submitting={submittingUser}
          requirePassword
        />
      )}

      {/* Edit User Modal */}
      {editUser && (
        <UserFormModal
          title={`تعديل المستخدم: ${editUser.name}`}
          form={userForm}
          setForm={setUserForm}
          onSubmit={handleUpdateUser}
          onClose={() => {
            setEditUser(null);
            setUserForm(emptyUserForm);
          }}
          submitting={submittingUser}
          requirePassword={false}
        />
      )}

      {/* Permission Overrides Modal */}
      {overridesUser && (
        <OverridesModal
          user={overridesUser}
          onClose={() => setOverridesUser(null)}
        />
      )}
    </PageShell>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-lg px-3 py-2 text-center min-w-[70px]">
      <div className="text-lg font-bold text-gold leading-none">{value}</div>
      <div className="text-[10px] text-white/70 mt-1">{label}</div>
    </div>
  );
}

interface ModuleTile {
  key: string;
  label: string;
  description: string;
  href: string;
  permission: string;
  icon: React.ElementType;
  tone: "gold" | "emerald" | "sky" | "violet" | "rose" | "amber";
}

const MODULES: ModuleTile[] = [
  {
    key: "roles",
    label: "الأدوار والصلاحيات",
    description: "تحكم في من يرى ماذا ويفعل ماذا — نظام صلاحيات مرن حسب الدور.",
    href: "/settings/roles",
    permission: "settings.roles:view",
    icon: Shield,
    tone: "violet",
  },
  {
    key: "unit-types",
    label: "أنواع الوحدات",
    description: "إدارة أنواع الغرف والشقق في الفندق.",
    href: "/settings/unit-types",
    permission: "settings.unit_types:view",
    icon: BedDouble,
    tone: "gold",
  },
  {
    key: "unit-merges",
    label: "دمج الوحدات",
    description: "دمج غرف متجاورة لإنشاء أجنحة أو شقق كبيرة.",
    href: "/settings/unit-merges",
    permission: "rooms:view",
    icon: DoorOpen,
    tone: "amber",
  },
  {
    key: "prices",
    label: "الأسعار حسب النوع",
    description: "أسعار مخصصة لكل نوع وحدة — تتجاوز الأسعار الموسمية العامة.",
    href: "/settings/prices",
    permission: "settings.prices:view",
    icon: Tag,
    tone: "emerald",
  },
  {
    key: "booking",
    label: "تكامل Booking.com",
    description: "مزامنة الحجوزات والأسعار مع منصة Booking.com.",
    href: "/settings/booking",
    permission: "settings.booking:view",
    icon: Network,
    tone: "sky",
  },
  {
    key: "whatsapp",
    label: "واتساب الأعمال (WhatsApp)",
    description: "تكامل Meta Cloud API: الاعتمادات، القوالب، الردود التلقائية.",
    href: "/settings/whatsapp",
    permission: "settings.whatsapp:view",
    icon: MessageCircle,
    tone: "emerald",
  },
  {
    key: "whatsapp-notifications",
    label: "إشعارات واتساب",
    description: "تحكم في إشعارات الصوت، وBrowser Push، وحساسية الرسائل.",
    href: "/settings/whatsapp/notifications",
    permission: "settings.whatsapp:view",
    icon: Bell,
    tone: "rose",
  },
];

const TONE_CLASSES: Record<ModuleTile["tone"], { bg: string; text: string; ring: string }> = {
  gold: {
    bg: "bg-gold-soft",
    text: "text-gold-dark",
    ring: "group-hover:ring-gold/40",
  },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "group-hover:ring-emerald-200",
  },
  sky: {
    bg: "bg-sky-50",
    text: "text-sky-700",
    ring: "group-hover:ring-sky-200",
  },
  violet: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    ring: "group-hover:ring-violet-200",
  },
  rose: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    ring: "group-hover:ring-rose-200",
  },
  amber: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "group-hover:ring-amber-200",
  },
};

function ModuleGrid({ search }: { search: string }) {
  const { can } = usePermissions();
  const normalised = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      MODULES.filter((m) => can(m.permission)).filter((m) => {
        if (!normalised) return true;
        return (
          m.label.toLowerCase().includes(normalised) ||
          m.description.toLowerCase().includes(normalised) ||
          m.key.includes(normalised)
        );
      }),
    [normalised, can],
  );

  if (visible.length === 0) {
    return (
      <div className="text-xs text-gray-400 text-center py-8 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
        لا توجد وحدات متاحة{normalised ? " لهذه البحث" : ""}.
      </div>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
      {visible.map((m) => {
        const Icon = m.icon;
        const tone = TONE_CLASSES[m.tone];
        return (
          <Link
            key={m.key}
            href={m.href}
            className={cn(
              "group relative bg-white border border-gray-100 rounded-2xl p-4 hover:border-primary/40 hover:shadow-md transition-all ring-1 ring-transparent",
              tone.ring,
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                  tone.bg,
                  tone.text,
                )}
              >
                <Icon size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-gray-800 text-sm">{m.label}</h3>
                  <ChevronLeft
                    size={14}
                    className="text-gray-300 group-hover:text-primary transition-colors shrink-0"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed line-clamp-2">
                  {m.description}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { bg: string; text: string; icon: typeof Shield }> = {
    admin: { bg: "bg-purple-100", text: "text-purple-700", icon: Shield },
    receptionist: { bg: "bg-blue-100", text: "text-blue-700", icon: Users },
    accountant: { bg: "bg-green-100", text: "text-green-700", icon: Tag },
  };
  const c = config[role] || config.receptionist;
  const Icon = c.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full",
        c.bg,
        c.text
      )}
    >
      <Icon size={12} />
      {roleLabels[role] || role}
    </span>
  );
}

function UserFormModal({
  title,
  form,
  setForm,
  onSubmit,
  onClose,
  submitting,
  requirePassword,
}: {
  title: string;
  form: UserFormData;
  setForm: (f: UserFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  submitting: boolean;
  requirePassword: boolean;
}) {
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg overflow-hidden max-h-[95vh] flex flex-col">
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100 shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              الاسم
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="الاسم الكامل"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@example.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary direction-ltr text-right"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              اسم المستخدم
              <span className="text-gray-400 font-normal">
                {" "}
                (اختياري — يُستخدم لتسجيل الدخول بدل الإيميل)
              </span>
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) =>
                setForm({ ...form, username: e.target.value })
              }
              placeholder="admin"
              autoComplete="off"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary direction-ltr text-right"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              كلمة المرور
              {!requirePassword && (
                <span className="text-gray-400 font-normal">
                  {" "}
                  (اتركها فارغة لعدم التغيير)
                </span>
              )}
            </label>
            <input
              type="password"
              required={requirePassword}
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary direction-ltr text-right"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              رقم واتساب
              <span className="text-gray-400 font-normal">
                {" "}
                (اختياري — لاستقبال إشعارات النظام عبر واتساب)
              </span>
            </label>
            <input
              type="tel"
              value={form.whatsappPhone}
              onChange={(e) =>
                setForm({ ...form, whatsappPhone: e.target.value })
              }
              placeholder="07XXXXXXXX"
              autoComplete="off"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary direction-ltr text-right"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              الدور
            </label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value as UserFormData["role"],
                })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="admin">مدير</option>
              <option value="receptionist">موظف استقبال</option>
              <option value="accountant">محاسب</option>
            </select>
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
                <Save size={18} />
              )}
              {submitting ? "جاري الحفظ..." : "حفظ"}
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

interface ResourceDTO {
  id: number;
  key: string;
  label: string;
  category: string;
  permissions: { id: number; action: string; label: string; key: string }[];
}

interface OverrideDTO {
  permissionId: number;
  effect: "allow" | "deny";
  permission: { key: string; label: string };
}

function OverridesModal({
  user,
  onClose,
}: {
  user: UserRecord;
  onClose: () => void;
}) {
  const [resources, setResources] = useState<ResourceDTO[]>([]);
  const [overrides, setOverrides] = useState<Record<number, "allow" | "deny">>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const [resRes, ovRes] = await Promise.all([
          fetch("/api/permissions"),
          fetch(`/api/users/${user.id}/overrides`),
        ]);
        if (!resRes.ok) throw new Error("فشل تحميل الصلاحيات");
        if (!ovRes.ok) throw new Error("فشل تحميل الاستثناءات");
        const resJson = await resRes.json();
        const ovJson = await ovRes.json();
        setResources(resJson.resources || resJson);
        const map: Record<number, "allow" | "deny"> = {};
        (ovJson.overrides || ovJson).forEach((o: OverrideDTO) => {
          map[o.permissionId] = o.effect;
        });
        setOverrides(map);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "خطأ");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user.id]);

  function cycle(permissionId: number) {
    setOverrides((prev) => {
      const cur = prev[permissionId];
      const next = { ...prev };
      if (!cur) next[permissionId] = "allow";
      else if (cur === "allow") next[permissionId] = "deny";
      else delete next[permissionId];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        overrides: Object.entries(overrides).map(([permissionId, effect]) => ({
          permissionId: Number(permissionId),
          effect,
        })),
      };
      const res = await fetch(`/api/users/${user.id}/overrides`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "فشل الحفظ");
      }
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  const grouped = resources.reduce<Record<string, ResourceDTO[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex items-start justify-between border-b border-gray-100 gap-2 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2 flex-wrap">
              <Shield size={18} className="text-amber-600 shrink-0" />
              <span className="break-words">استثناءات الصلاحيات لـ {user.name}</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-1">
              الاستثناءات تتجاوز صلاحيات الأدوار. اضغط على الصلاحية للتبديل بين:
              افتراضي → سماح → رفض.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors shrink-0"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-primary" />
            </div>
          ) : err ? (
            <div className="text-danger text-sm">{err}</div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="space-y-2">
                <h4 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-1">
                  {category}
                </h4>
                <div className="space-y-2">
                  {items.map((r) => (
                    <div
                      key={r.id}
                      className="bg-gray-50/60 rounded-lg p-3 space-y-2"
                    >
                      <div className="text-sm font-medium text-gray-800">
                        {r.label}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {r.permissions.map((p) => {
                          const effect = overrides[p.id];
                          const style =
                            effect === "allow"
                              ? "bg-green-100 text-green-700 border-green-300"
                              : effect === "deny"
                                ? "bg-red-100 text-red-700 border-red-300"
                                : "bg-white text-gray-500 border-gray-200 hover:border-gray-400";
                          return (
                            <button
                              type="button"
                              key={p.id}
                              onClick={() => cycle(p.id)}
                              className={cn(
                                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                                style,
                              )}
                              title={p.key}
                            >
                              {p.label}
                              {effect === "allow" && " ✓"}
                              {effect === "deny" && " ✕"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-white text-sm"
          >
            إلغاء
          </button>
          <button
            onClick={save}
            disabled={saving || loading}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-medium"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            حفظ الاستثناءات
          </button>
        </div>
      </div>
    </div>
  );
}
