"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Key,
  Network,
  Activity,
  Inbox,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  EyeOff,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/Can";
import { cn } from "@/lib/utils";

type Tab = "credentials" | "mapping" | "jobs" | "inbox";

interface Credential {
  id: number;
  label: string;
  email: string;
  emailMasked: string;
  propertyId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  lastLoginOk: boolean | null;
}

interface UnitLite {
  id: number;
  unitNumber: string;
  unitType: string;
}
interface UnitTypeLite {
  id: number;
  code: string;
  nameAr: string;
  category: string;
}

interface MappingRow {
  id?: number;
  unitId?: number | null;
  unitTypeId?: number | null;
  extranetRoomId: string;
  extranetRoomName?: string | null;
  extranetRoomCode?: string | null;
  notes?: string | null;
  unit?: UnitLite | null;
  unitType?: UnitTypeLite | null;
}

interface Job {
  id: number;
  type: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  payloadJson: unknown;
  resultJson: unknown;
  error: string | null;
  createdAt: string;
}

interface InboxRow {
  id: number;
  externalId: string;
  guestName: string;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  extranetRoomId: string | null;
  mappedUnitId: number | null;
  totalAmount: number;
  currency: string;
  status: string;
  importedAt: string | null;
}

const JOB_TYPES = [
  { value: "login_check", label: "فحص تسجيل الدخول" },
  { value: "push_prices", label: "دفع الأسعار" },
  { value: "push_availability", label: "دفع الإتاحة" },
  { value: "pull_reservations", label: "سحب الحجوزات" },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    running: "bg-blue-100 text-blue-700 animate-pulse",
    done: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    pending: "في الانتظار",
    running: "قيد التنفيذ",
    done: "منتهية",
    failed: "فشلت",
    cancelled: "ملغاة",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        styles[status] ?? "bg-gray-100 text-gray-600",
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

export default function BookingSettingsPage() {
  const [tab, setTab] = useState<Tab>("credentials");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-2"
        >
          <ArrowLeft size={14} />
          العودة للإعدادات
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Network className="text-primary" />
          تكامل Booking.com
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          بيانات الدخول، ربط الغرف، وجدولة مهام المزامنة (عبر Playwright).
        </p>
      </div>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>
          أتمتة لوحة Booking Extranet مخالفة لشروط الخدمة وقابلة للكسر عند أي تحديث واجهة.
          تعامَل مع هذا التكامل كمرحلة وسيطة حتى الاشتراك في Channel Manager رسمي.
        </span>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {([
          ["credentials", "بيانات الدخول", Key],
          ["mapping", "ربط الغرف", Network],
          ["jobs", "المهام", Activity],
          ["inbox", "حجوزات واردة", Inbox],
        ] as const).map(([v, label, Icon]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              tab === v
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === "credentials" && <CredentialsTab />}
      {tab === "mapping" && <MappingTab />}
      {tab === "jobs" && <JobsTab />}
      {tab === "inbox" && <InboxTab />}
    </div>
  );
}

// ════════════════════════════════════ Credentials ════════════════════════════════════

function CredentialsTab() {
  const [rows, setRows] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: "",
    email: "",
    password: "",
    propertyId: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/booking/credentials");
      if (!res.ok) throw new Error("فشل التحميل");
      setRows(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/booking/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل");
      toast.success("تم الحفظ");
      setShowForm(false);
      setForm({ label: "", email: "", password: "", propertyId: "" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("حذف بيانات الدخول؟")) return;
    await fetch(`/api/booking/credentials/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleProbe(id: number) {
    try {
      const res = await fetch("/api/booking/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "login_check", payload: { credentialId: id } }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل");
      toast.success("تم إنشاء مهمة فحص تسجيل دخول — راجع تبويب المهام");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل");
    }
  }

  return (
    <div className="bg-card-bg rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">حسابات Booking.com</h2>
        <Can permission="settings.booking:create">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
          >
            <Plus size={14} />
            إضافة حساب
          </button>
        </Can>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-gray-400">لا توجد حسابات مسجلة</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{r.label}</span>
                  {!r.isActive && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                      متوقف
                    </span>
                  )}
                  {r.lastLoginOk === true && (
                    <CheckCircle2 size={14} className="text-green-600" />
                  )}
                  {r.lastLoginOk === false && <XCircle size={14} className="text-red-600" />}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                  <span>{r.emailMasked}</span>
                  {r.propertyId && <span>property #{r.propertyId}</span>}
                  {r.lastLoginAt && (
                    <span className="text-gray-400">
                      آخر محاولة: {new Date(r.lastLoginAt).toLocaleString("ar")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Can permission="settings.booking:trigger">
                  <button
                    onClick={() => handleProbe(r.id)}
                    title="فحص تسجيل الدخول"
                    className="p-2 text-primary hover:bg-gold-soft rounded-lg"
                  >
                    <PlayCircle size={16} />
                  </button>
                </Can>
                <Can permission="settings.booking:delete">
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
                </Can>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[95vh] flex flex-col">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b flex items-center justify-between shrink-0">
              <h3 className="font-bold">إضافة حساب Booking</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl leading-none p-1">
                ×
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs text-gray-600 mb-1">التسمية</label>
                <input
                  required
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="الحساب الرئيسي"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">البريد الإلكتروني</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">كلمة المرور</label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    required
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute top-1/2 -translate-y-1/2 left-2 text-gray-400"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  تُخزَّن مشفّرة بـ AES-256-GCM ولا تُعرض لاحقًا.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">رقم العقار (اختياري)</label>
                <input
                  value={form.propertyId}
                  onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="12345678"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
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

// ════════════════════════════════════ Mapping ════════════════════════════════════

function MappingTab() {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [units, setUnits] = useState<UnitLite[]>([]);
  const [types, setTypes] = useState<UnitTypeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, u, t] = await Promise.all([
        fetch("/api/booking/property-map").then((r) => r.json()),
        fetch("/api/units").then((r) => r.json()),
        fetch("/api/unit-types").then((r) => r.json()),
      ]);
      setRows(Array.isArray(m) ? m : []);
      setUnits(
        Array.isArray(u)
          ? u.map((x: { id: number; unitNumber: string; unitType: string }) => ({
              id: x.id,
              unitNumber: x.unitNumber,
              unitType: x.unitType,
            }))
          : [],
      );
      setTypes(Array.isArray(t) ? t : []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function addRow() {
    setRows((r) => [...r, { extranetRoomId: "", unitTypeId: null, unitId: null }]);
  }
  function updateRow(idx: number, patch: Partial<MappingRow>) {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }
  function removeRow(idx: number) {
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/booking/property-map", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "فشل الحفظ");
      toast.success("تم الحفظ");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card-bg rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">ربط الوحدات المحلية مع غرف Booking</h2>
        <div className="flex gap-2">
          <Can permission="settings.booking:map">
            <button
              onClick={addRow}
              className="flex items-center gap-1 px-3 py-2 border border-primary text-primary rounded-lg text-sm hover:bg-gold-soft"
            >
              <Plus size={14} /> سطر جديد
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-2 bg-success text-white rounded-lg text-sm disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />} حفظ
            </button>
          </Can>
        </div>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600">
                <th className="text-right px-3 py-2">نوع الوحدة</th>
                <th className="text-right px-3 py-2">أو وحدة محددة</th>
                <th className="text-right px-3 py-2">Booking Room ID</th>
                <th className="text-right px-3 py-2">اسم (Booking)</th>
                <th className="text-right px-3 py-2">ملاحظات</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400">
                    لا يوجد ربط بعد. اضغط &quot;سطر جديد&quot;.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id ?? `n${i}`}>
                  <td className="px-2 py-2">
                    <select
                      value={r.unitTypeId ?? ""}
                      onChange={(e) =>
                        updateRow(i, {
                          unitTypeId: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="w-full border rounded px-2 py-1"
                    >
                      <option value="">—</option>
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} · {t.nameAr}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={r.unitId ?? ""}
                      onChange={(e) =>
                        updateRow(i, { unitId: e.target.value ? Number(e.target.value) : null })
                      }
                      className="w-full border rounded px-2 py-1"
                    >
                      <option value="">—</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unitNumber}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={r.extranetRoomId}
                      onChange={(e) => updateRow(i, { extranetRoomId: e.target.value })}
                      className="w-full border rounded px-2 py-1"
                      placeholder="12345"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={r.extranetRoomName ?? ""}
                      onChange={(e) => updateRow(i, { extranetRoomName: e.target.value })}
                      className="w-full border rounded px-2 py-1"
                      placeholder="Deluxe Twin"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={r.notes ?? ""}
                      onChange={(e) => updateRow(i, { notes: e.target.value })}
                      className="w-full border rounded px-2 py-1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Can permission="settings.booking:map">
                      <button
                        onClick={() => removeRow(i)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════ Jobs ════════════════════════════════════

function JobsTab() {
  const [rows, setRows] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState("login_check");
  const [creds, setCreds] = useState<Credential[]>([]);
  const [credId, setCredId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [j, c] = await Promise.all([
        fetch("/api/booking/jobs").then((r) => r.json()),
        fetch("/api/booking/credentials").then((r) => r.json()),
      ]);
      setRows(Array.isArray(j) ? j : []);
      setCreds(Array.isArray(c) ? c : []);
      if (Array.isArray(c) && c.length > 0 && credId === null) setCredId(c[0].id);
    } finally {
      setLoading(false);
    }
  }, [credId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function trigger() {
    if (!credId) {
      toast.error("اختر حسابًا");
      return;
    }
    const res = await fetch("/api/booking/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: newType, payload: { credentialId: credId } }),
    });
    if (res.ok) toast.success("تم إنشاء المهمة");
    else toast.error("فشل");
    await load();
  }

  async function cancel(id: number) {
    await fetch(`/api/booking/jobs/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="bg-card-bg rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-1">نوع المهمة</label>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            {JOB_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">الحساب</label>
          <select
            value={credId ?? ""}
            onChange={(e) => setCredId(e.target.value ? Number(e.target.value) : null)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {creds.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <Can permission="settings.booking:trigger">
          <button
            onClick={trigger}
            className="flex items-center gap-1 px-3 py-2 bg-primary text-white rounded-lg text-sm"
          >
            <PlayCircle size={14} /> تشغيل
          </button>
        </Can>
        <button onClick={load} className="ml-auto p-2 text-gray-500 hover:bg-gray-100 rounded">
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-gray-400">لا توجد مهام</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600">
                <th className="text-right px-3 py-2">#</th>
                <th className="text-right px-3 py-2">النوع</th>
                <th className="text-right px-3 py-2">الحالة</th>
                <th className="text-right px-3 py-2">جدولة</th>
                <th className="text-right px-3 py-2">انتهى</th>
                <th className="text-right px-3 py-2">محاولات</th>
                <th className="text-right px-3 py-2">الخطأ</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((j) => (
                <tr key={j.id}>
                  <td className="px-3 py-2 text-gray-500">{j.id}</td>
                  <td className="px-3 py-2">{j.type}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    <Clock size={11} className="inline ml-1" />
                    {new Date(j.scheduledAt).toLocaleString("ar")}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {j.finishedAt ? new Date(j.finishedAt).toLocaleString("ar") : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">{j.attempts}</td>
                  <td className="px-3 py-2 text-xs text-red-600 max-w-[200px] truncate">
                    {j.error ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {j.status === "pending" && (
                      <Can permission="settings.booking:trigger">
                        <button
                          onClick={() => cancel(j.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          إلغاء
                        </button>
                      </Can>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════ Inbox ════════════════════════════════════

function InboxTab() {
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [status, setStatus] = useState("new");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/booking/inbox?status=${status}`);
      setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    return byStatus;
  }, [rows]);

  return (
    <div className="bg-card-bg rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">الحجوزات الواردة من Booking</h2>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="new">جديدة</option>
          <option value="imported">مستوردة</option>
          <option value="ignored">متجاهلة</option>
          <option value="conflict">متعارضة</option>
          <option value="all">الكل</option>
        </select>
      </div>

      {Object.entries(summary).length > 0 && (
        <div className="flex gap-2 text-xs text-gray-500">
          {Object.entries(summary).map(([s, n]) => (
            <span key={s} className="bg-gray-100 px-2 py-1 rounded">
              {s}: {n}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-gray-400">لا توجد حجوزات</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-600">
                <th className="text-right px-3 py-2">Booking #</th>
                <th className="text-right px-3 py-2">النزيل</th>
                <th className="text-right px-3 py-2">من</th>
                <th className="text-right px-3 py-2">إلى</th>
                <th className="text-right px-3 py-2">المبلغ</th>
                <th className="text-right px-3 py-2">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">{r.externalId}</td>
                  <td className="px-3 py-2">{r.guestName}</td>
                  <td className="px-3 py-2 text-xs">{r.checkIn.split("T")[0]}</td>
                  <td className="px-3 py-2 text-xs">{r.checkOut.split("T")[0]}</td>
                  <td className="px-3 py-2">
                    {r.totalAmount} {r.currency}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status === "new" ? "pending" : r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
