"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { cn, formatDate, roleLabels } from "@/lib/utils";

interface UserRecord {
  id: number;
  name: string;
  email: string;
  role: "admin" | "receptionist" | "accountant";
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
  password: string;
  role: "admin" | "receptionist" | "accountant";
}

const emptyUserForm: UserFormData = {
  name: "",
  email: "",
  password: "",
  role: "receptionist",
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
        role: userForm.role,
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
    <div className="space-y-8">
      <h1 className="text-xl sm:text-2xl font-bold text-primary flex items-center gap-2 border-b-2 border-gold/30 pb-3">
        <Settings size={24} className="text-gold-dark" />
        الإعدادات
      </h1>

      {/* Section 1: User Management */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
            <Users size={20} className="text-primary" />
            إدارة المستخدمين
          </h2>
          <button
            onClick={() => {
              setShowUserForm(true);
              setEditUser(null);
              setUserForm(emptyUserForm);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium w-full sm:w-auto justify-center"
          >
            <Plus size={18} />
            إضافة مستخدم
          </button>
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
                        {user.name}
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
                          <button
                            onClick={() => {
                              setEditUser(user);
                              setUserForm({
                                name: user.name,
                                email: user.email,
                                password: "",
                                role: user.role,
                              });
                              setShowUserForm(false);
                            }}
                            className="p-1.5 text-primary-light hover:text-primary hover:bg-gold-soft rounded-lg transition-colors"
                            title="تعديل"
                          >
                            <Pencil size={16} />
                          </button>
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
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-800">{user.name}</span>
                    <RoleBadge role={user.role} />
                  </div>
                  <p className="text-sm text-gray-500 direction-ltr text-right">{user.email}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{formatDate(user.createdAt)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditUser(user);
                          setUserForm({
                            name: user.name,
                            email: user.email,
                            password: "",
                            role: user.role,
                          });
                          setShowUserForm(false);
                        }}
                        className="p-2 text-primary-light hover:text-primary hover:bg-gold-soft rounded-lg transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      </section>

      {/* Section 2: Seasonal Prices */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Tag size={20} className="text-primary" />
          الأسعار الموسمية
        </h2>

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-right px-3 py-3 font-medium">
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
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
