"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  User as UserIcon,
  Mail,
  AtSign,
  Shield,
  Loader2,
  Camera,
  Trash2,
  Save,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { cn, formatDate, roleLabels } from "@/lib/utils";
import { PageShell } from "@/components/ui/PageShell";

interface MeResponse {
  id: number;
  name: string;
  email: string;
  username: string | null;
  role: string;
  avatarUrl: string | null;
  whatsappPhone: string | null;
  createdAt: string;
}

interface PersonalFormState {
  name: string;
  email: string;
  username: string;
  whatsappPhone: string;
}

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const emptyPasswordForm: PasswordFormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "");
}

export default function ProfilePage() {
  const { update: updateSession } = useSession();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [personal, setPersonal] = useState<PersonalFormState>({
    name: "",
    email: "",
    username: "",
    whatsappPhone: "",
  });
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [personalMsg, setPersonalMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const [password, setPassword] = useState<PasswordFormState>(emptyPasswordForm);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [avatarBust, setAvatarBust] = useState<number>(() => Date.now());
  const [avatarBusy, setAvatarBusy] = useState<null | "upload" | "delete">(null);
  const [avatarMsg, setAvatarMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "تعذر تحميل الملف الشخصي");
      }
      const data: MeResponse = await res.json();
      setMe(data);
      setPersonal({
        name: data.name ?? "",
        email: data.email ?? "",
        username: data.username ?? "",
        whatsappPhone: data.whatsappPhone ?? "",
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const avatarSrc = useMemo(() => {
    if (!me?.avatarUrl) return null;
    return `/api/files/avatar/${me.id}?v=${avatarBust}`;
  }, [me, avatarBust]);

  async function handleSavePersonal(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setSavingPersonal(true);
    setPersonalMsg(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: personal.name,
          email: personal.email,
          username: personal.username,
          whatsappPhone: personal.whatsappPhone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "فشل حفظ البيانات");
      }
      setMe(data);
      setPersonalMsg({ kind: "ok", text: "تم حفظ البيانات بنجاح" });
      await updateSession();
    } catch (e) {
      setPersonalMsg({
        kind: "err",
        text: e instanceof Error ? e.message : "خطأ غير معروف",
      });
    } finally {
      setSavingPersonal(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (password.newPassword !== password.confirmPassword) {
      setPasswordMsg({
        kind: "err",
        text: "كلمة المرور الجديدة وتأكيدها غير متطابقين",
      });
      return;
    }
    if (password.newPassword.length < 8) {
      setPasswordMsg({
        kind: "err",
        text: "كلمة المرور الجديدة يجب أن تكون 8 محارف على الأقل",
      });
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: password.currentPassword,
          newPassword: password.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "فشل تغيير كلمة المرور");
      }
      setPassword(emptyPasswordForm);
      setPasswordMsg({ kind: "ok", text: "تم تغيير كلمة المرور بنجاح" });
    } catch (e) {
      setPasswordMsg({
        kind: "err",
        text: e instanceof Error ? e.message : "خطأ غير معروف",
      });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy("upload");
    setAvatarMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "فشل رفع الصورة");
      }
      setMe((prev) =>
        prev ? { ...prev, avatarUrl: data.avatarUrl ?? prev.avatarUrl } : prev,
      );
      setAvatarBust(Date.now());
      setAvatarMsg({ kind: "ok", text: "تم تحديث الصورة" });
      await updateSession();
    } catch (err) {
      setAvatarMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "خطأ غير معروف",
      });
    } finally {
      setAvatarBusy(null);
    }
  }

  async function handleAvatarDelete() {
    if (!me?.avatarUrl) return;
    if (!confirm("هل تريد إزالة الصورة الشخصية؟")) return;
    setAvatarBusy("delete");
    setAvatarMsg(null);
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "فشل حذف الصورة");
      }
      setMe((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
      setAvatarBust(Date.now());
      setAvatarMsg({ kind: "ok", text: "تم حذف الصورة" });
      await updateSession();
    } catch (err) {
      setAvatarMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "خطأ غير معروف",
      });
    } finally {
      setAvatarBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !me) {
    return (
      <div className="max-w-lg mx-auto mt-10 bg-white rounded-xl border border-red-200 p-6 text-center">
        <AlertCircle size={28} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-red-600">
          {loadError || "تعذر تحميل الملف الشخصي"}
        </p>
      </div>
    );
  }

  const roleLabel = roleLabels[me.role] ?? me.role;

  return (
    <PageShell className="max-w-4xl mx-auto">
      <header className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt={me.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{initialsFor(me.name)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-800 truncate">
            {me.name}
          </h1>
          <p className="text-sm text-gray-500 truncate">{me.email}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            انضم في {formatDate(me.createdAt)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          <Shield size={14} />
          {roleLabel}
        </span>
      </header>

      {/* Avatar card */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Camera size={18} className="text-primary" />
          <h2 className="text-lg font-bold text-gray-800">الصورة الشخصية</h2>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="relative w-28 h-28 rounded-full overflow-hidden bg-primary/10 text-primary flex items-center justify-center text-3xl font-bold shrink-0 border-4 border-white shadow">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt={me.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initialsFor(me.name)}</span>
            )}
          </div>
          <div className="flex-1 w-full">
            <p className="text-sm text-gray-500 mb-3 text-center sm:text-right">
              الحد الأقصى 5 ميغابايت — يُفضل أن تكون الصورة مربعة.
            </p>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarBusy !== null}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {avatarBusy === "upload" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Camera size={16} />
                )}
                تغيير الصورة
              </button>
              {me.avatarUrl && (
                <button
                  type="button"
                  onClick={handleAvatarDelete}
                  disabled={avatarBusy !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {avatarBusy === "delete" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  إزالة
                </button>
              )}
            </div>
            {avatarMsg && <FormMessage msg={avatarMsg} />}
          </div>
        </div>
      </section>

      {/* Personal info card */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserIcon size={18} className="text-primary" />
          <h2 className="text-lg font-bold text-gray-800">البيانات الشخصية</h2>
        </div>
        <form onSubmit={handleSavePersonal} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="الاسم الكامل"
              icon={<UserIcon size={16} className="text-gray-400" />}
            >
              <input
                type="text"
                value={personal.name}
                onChange={(e) =>
                  setPersonal((p) => ({ ...p, name: e.target.value }))
                }
                required
                minLength={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                placeholder="اسمك الكامل"
              />
            </Field>
            <Field
              label="البريد الإلكتروني"
              icon={<Mail size={16} className="text-gray-400" />}
            >
              <input
                type="email"
                value={personal.email}
                onChange={(e) =>
                  setPersonal((p) => ({ ...p, email: e.target.value }))
                }
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                placeholder="name@example.com"
                dir="ltr"
              />
            </Field>
            <Field
              label="اسم المستخدم"
              icon={<AtSign size={16} className="text-gray-400" />}
              hint="يُستخدم لتسجيل الدخول كبديل للبريد الإلكتروني"
            >
              <input
                type="text"
                value={personal.username}
                onChange={(e) =>
                  setPersonal((p) => ({ ...p, username: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                placeholder="username"
                dir="ltr"
              />
            </Field>
            <Field
              label="رقم واتساب"
              icon={<MessageCircle size={16} className="text-gray-400" />}
              hint="يُستخدم لإرسال إشعارات النظام إلى واتساب الشخصي عند تفعيل قناة واتساب في الإشعارات"
            >
              <input
                type="tel"
                value={personal.whatsappPhone}
                onChange={(e) =>
                  setPersonal((p) => ({ ...p, whatsappPhone: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                placeholder="07XXXXXXXX"
                dir="ltr"
              />
            </Field>
            <Field
              label="الدور"
              icon={<Shield size={16} className="text-gray-400" />}
              hint="يُعدَّل من قبل الإدارة فقط"
            >
              <input
                type="text"
                value={roleLabel}
                readOnly
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 text-sm cursor-not-allowed"
              />
            </Field>
          </div>

          {personalMsg && <FormMessage msg={personalMsg} />}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPersonal}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {savingPersonal ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              حفظ البيانات
            </button>
          </div>
        </form>
      </section>

      {/* Password card */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={18} className="text-primary" />
          <h2 className="text-lg font-bold text-gray-800">تغيير كلمة المرور</h2>
        </div>
        <form
          onSubmit={handleChangePassword}
          className="space-y-4 max-w-lg"
          autoComplete="off"
        >
          <Field label="كلمة المرور الحالية">
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={password.currentPassword}
                onChange={(e) =>
                  setPassword((p) => ({
                    ...p,
                    currentPassword: e.target.value,
                  }))
                }
                required
                className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((s) => !s)}
                className="absolute inset-y-0 left-2 flex items-center text-gray-400 hover:text-gray-600"
                aria-label={showCurrent ? "إخفاء" : "إظهار"}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          <Field
            label="كلمة المرور الجديدة"
            hint="8 محارف على الأقل"
          >
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={password.newPassword}
                onChange={(e) =>
                  setPassword((p) => ({ ...p, newPassword: e.target.value }))
                }
                required
                minLength={8}
                className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="absolute inset-y-0 left-2 flex items-center text-gray-400 hover:text-gray-600"
                aria-label={showNew ? "إخفاء" : "إظهار"}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          <Field label="تأكيد كلمة المرور الجديدة">
            <input
              type={showNew ? "text" : "password"}
              value={password.confirmPassword}
              onChange={(e) =>
                setPassword((p) => ({
                  ...p,
                  confirmPassword: e.target.value,
                }))
              }
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
              autoComplete="new-password"
            />
          </Field>

          {passwordMsg && <FormMessage msg={passwordMsg} />}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {savingPassword ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Lock size={16} />
              )}
              تغيير كلمة المرور
            </button>
          </div>
        </form>
      </section>
    </PageShell>
  );
}

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-1">
        {icon}
        {label}
      </span>
      {children}
      {hint && <span className="block mt-1 text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

function FormMessage({
  msg,
}: {
  msg: { kind: "ok" | "err"; text: string };
}) {
  const Icon = msg.kind === "ok" ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm px-3 py-2 rounded-lg",
        msg.kind === "ok"
          ? "bg-green-50 text-green-700 border border-green-200"
          : "bg-red-50 text-red-700 border border-red-200",
      )}
    >
      <Icon size={16} />
      <span>{msg.text}</span>
    </div>
  );
}
