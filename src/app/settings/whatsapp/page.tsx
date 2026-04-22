"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Loader2,
  Save,
  MessageCircle,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  PlayCircle,
  Eye,
  EyeOff,
  KeyRound,
  Building2,
  Upload,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Can } from "@/components/Can";
import { usePermissions } from "@/lib/permissions/client";

interface PublicConfig {
  appId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  apiVersion: string;
  isActive: boolean;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  hasWebhookVerifyToken: boolean;
  webhookUrl: string;
  lastVerifiedAt: string | null;
  lastVerifyOk: boolean | null;
  lastError: string | null;
}

interface TemplateRow {
  id: number;
  name: string;
  language: string;
  category: string;
  status: string;
  rejectionReason: string | null;
  lastSyncedAt: string;
}

interface BusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
}

/** Verticals accepted by Meta for WhatsApp Business Profile. */
const VERTICALS: { value: string; label: string }[] = [
  { value: "OTHER", label: "أخرى" },
  { value: "HOTEL", label: "فندق" },
  { value: "TRAVEL", label: "سياحة وسفر" },
  { value: "RESTAURANT", label: "مطعم" },
  { value: "RETAIL", label: "تجزئة" },
  { value: "APPAREL", label: "ملابس" },
  { value: "BEAUTY", label: "تجميل / سبا" },
  { value: "EDU", label: "تعليم" },
  { value: "ENTERTAIN", label: "ترفيه" },
  { value: "EVENT_PLAN", label: "تنظيم فعاليات" },
  { value: "FINANCE", label: "مالية" },
  { value: "GROCERY", label: "بقالة / سوبرماركت" },
  { value: "GOVT", label: "حكومي" },
  { value: "HEALTH", label: "صحة" },
  { value: "NONPROFIT", label: "غير ربحي" },
  { value: "PROF_SERVICES", label: "خدمات مهنية" },
  { value: "AUTO", label: "سيارات" },
];

export default function WhatsAppSettingsPage() {
  const { can } = usePermissions();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerPin, setRegisterPin] = useState("");
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  // Business profile state (profile picture + about + address + ...).
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [profileForm, setProfileForm] = useState({
    about: "",
    address: "",
    description: "",
    email: "",
    vertical: "HOTEL",
    websites: "",
  });

  const [form, setForm] = useState({
    appId: "",
    appSecret: "",
    wabaId: "",
    phoneNumberId: "",
    accessToken: "",
    webhookVerifyToken: "",
    apiVersion: "v21.0",
    isActive: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/config", { cache: "no-store" });
      if (!res.ok) throw new Error("فشل تحميل الإعدادات");
      const data: PublicConfig = await res.json();
      setCfg(data);
      setForm((f) => ({
        ...f,
        appId: data.appId,
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        webhookVerifyToken: "", // Never preload secrets.
        apiVersion: data.apiVersion,
        isActive: data.isActive,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/templates");
      if (!res.ok) return;
      setTemplates(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch("/api/whatsapp/profile", { cache: "no-store" });
      if (!res.ok) return;
      const data: BusinessProfile = await res.json();
      setProfile(data);
      setProfileForm({
        about: data.about ?? "",
        address: data.address ?? "",
        description: data.description ?? "",
        email: data.email ?? "",
        vertical: data.vertical ?? "HOTEL",
        websites: (data.websites ?? []).join("\n"),
      });
    } catch {
      // ignore — WhatsApp not configured yet
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadTemplates();
    loadProfile();
  }, [load, loadTemplates, loadProfile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        appId: form.appId,
        wabaId: form.wabaId,
        phoneNumberId: form.phoneNumberId,
        apiVersion: form.apiVersion,
        isActive: form.isActive,
      };
      if (form.accessToken.trim()) body.accessToken = form.accessToken.trim();
      if (form.appSecret.trim()) body.appSecret = form.appSecret.trim();
      if (form.webhookVerifyToken.trim())
        body.webhookVerifyToken = form.webhookVerifyToken.trim();

      const res = await fetch("/api/whatsapp/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "فشل الحفظ");
      }
      toast.success("تم الحفظ");
      // Clear secret inputs so the eye-icon shows "hidden" again.
      setForm((f) => ({ ...f, accessToken: "", appSecret: "", webhookVerifyToken: "" }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function probe() {
    setProbing(true);
    try {
      const res = await fetch("/api/whatsapp/probe", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "فشل الاتصال");
      toast.success(
        `تم الاتصال بنجاح — الرقم: ${j.info?.display_phone_number ?? ""}`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الاتصال");
      await load();
    } finally {
      setProbing(false);
    }
  }

  async function registerNumber() {
    if (!/^\d{6}$/.test(registerPin)) {
      toast.error("PIN يجب أن يكون 6 أرقام");
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch("/api/whatsapp/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: registerPin }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "فشل التسجيل");
      toast.success("تم تسجيل الرقم بنجاح على Cloud API");
      setShowRegisterDialog(false);
      setRegisterPin("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التسجيل");
    } finally {
      setRegistering(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const websites = profileForm.websites
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 2);
      const res = await fetch("/api/whatsapp/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          about: profileForm.about,
          address: profileForm.address,
          description: profileForm.description,
          email: profileForm.email,
          vertical: profileForm.vertical,
          websites,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل تحديث الملف");
      toast.success("تم تحديث الملف التجاري");
      if (j.profile) setProfile(j.profile);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تحديث الملف");
    } finally {
      setProfileSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5MB");
      return;
    }
    if (!/^image\/(jpeg|jpg|png)$/i.test(file.type)) {
      toast.error("الصيغة المدعومة: JPG أو PNG فقط");
      return;
    }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/whatsapp/profile/picture", {
        method: "POST",
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل رفع الصورة");
      toast.success("تم تحديث صورة الملف الشخصي");
      if (j.profile) setProfile(j.profile);
      // Force-refresh the image element (Meta keeps the same URL but different content).
      await loadProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل رفع الصورة");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function syncTemplates() {
    setSyncing(true);
    try {
      const res = await fetch("/api/whatsapp/templates", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "فشل المزامنة");
      toast.success(`تمت مزامنة ${j.count} قالبًا`);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل المزامنة");
    } finally {
      setSyncing(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("تم النسخ");
    } catch {
      toast.error("تعذّر النسخ");
    }
  }

  if (loading || !cfg) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const canEdit = can("settings.whatsapp:edit");

  return (
    <div className="space-y-8">
      <div className="pt-2 sm:pt-4 border-b-2 border-gold/30 pb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-block w-1 h-8 bg-gold rounded-full" />
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-green-50 border border-green-200">
            <MessageCircle size={22} className="text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary font-[family-name:var(--font-amiri)] tracking-tight">
              إعدادات واتساب
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              تكامل مع WhatsApp Business Cloud API من Meta
            </p>
          </div>
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-primary"
        >
          <ArrowLeft size={16} />
          الرجوع للإعدادات
        </Link>
      </div>

      {/* Status card */}
      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard
          title="حالة الاتصال"
          ok={cfg.lastVerifyOk}
          lines={[
            cfg.displayPhoneNumber
              ? `الرقم: +${cfg.displayPhoneNumber.replace(/^\+/, "")}`
              : "الرقم غير مُتحقَّق بعد",
            cfg.lastVerifiedAt
              ? `آخر اختبار: ${new Date(cfg.lastVerifiedAt).toLocaleString("ar")}`
              : "لم يتم الاختبار بعد",
            cfg.lastError ? `خطأ: ${cfg.lastError}` : null,
          ]}
        />
        <StatusCard
          title="المفاتيح المُعرَّفة"
          ok={cfg.hasAccessToken && cfg.hasAppSecret && cfg.hasWebhookVerifyToken}
          lines={[
            `Access Token: ${cfg.hasAccessToken ? "✓ محفوظ" : "✕ غير مُعرَّف"}`,
            `App Secret: ${cfg.hasAppSecret ? "✓ محفوظ" : "✕ غير مُعرَّف"}`,
            `Verify Token: ${cfg.hasWebhookVerifyToken ? "✓ محفوظ" : "✕ غير مُعرَّف"}`,
          ]}
        />
        <div className="bg-card-bg rounded-xl shadow-sm p-4 space-y-2">
          <p className="text-sm text-gray-500">رابط Webhook للصقه على Meta</p>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
            <code className="text-xs text-gray-700 flex-1 truncate direction-ltr">
              {cfg.webhookUrl}
            </code>
            <button
              onClick={() => copy(cfg.webhookUrl)}
              className="p-1.5 rounded-lg hover:bg-gray-200"
              title="نسخ"
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            ضعه في Meta → WhatsApp → Configuration → Callback URL، واستخدم Verify
            Token أعلاه.
          </p>
        </div>
      </section>

      {/* Credentials form */}
      <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-gray-800">بيانات الاعتماد</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Can permission="settings.whatsapp:probe">
              <button
                type="button"
                onClick={() => setShowRegisterDialog(true)}
                disabled={!cfg.hasAccessToken}
                className="flex items-center gap-2 px-3 py-2 border border-amber-500 text-amber-600 rounded-lg hover:bg-amber-50 text-sm disabled:opacity-50"
                title="مطلوب مرة واحدة لإصلاح خطأ #133010"
              >
                <KeyRound size={14} />
                تسجيل الرقم مع Cloud API
              </button>
            </Can>
            <Can permission="settings.whatsapp:probe">
              <button
                type="button"
                onClick={probe}
                disabled={probing || !cfg.hasAccessToken}
                className="flex items-center gap-2 px-3 py-2 border border-primary text-primary rounded-lg hover:bg-gold-soft text-sm disabled:opacity-50"
              >
                {probing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <PlayCircle size={14} />
                )}
                اختبار الاتصال
              </button>
            </Can>
          </div>
        </div>

        <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
          <Field label="App ID (Meta)">
            <input
              type="text"
              value={form.appId}
              onChange={(e) => setForm({ ...form, appId: e.target.value })}
              disabled={!canEdit}
              className="input direction-ltr text-right"
            />
          </Field>

          <Field label="WABA ID">
            <input
              type="text"
              value={form.wabaId}
              onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
              disabled={!canEdit}
              className="input direction-ltr text-right"
            />
          </Field>

          <Field label="Phone Number ID">
            <input
              type="text"
              value={form.phoneNumberId}
              onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
              disabled={!canEdit}
              className="input direction-ltr text-right"
            />
          </Field>

          <Field label="Graph API Version">
            <input
              type="text"
              value={form.apiVersion}
              onChange={(e) => setForm({ ...form, apiVersion: e.target.value })}
              disabled={!canEdit}
              placeholder="v21.0"
              className="input direction-ltr text-right"
            />
          </Field>

          <Field
            label={
              <>
                Access Token (System User){" "}
                <span className="text-gray-400 font-normal">
                  {cfg.hasAccessToken ? "(اتركه فارغًا للإبقاء على الحالي)" : ""}
                </span>
              </>
            }
            className="md:col-span-2"
          >
            <div className="flex gap-2">
              <input
                type={showAccessToken ? "text" : "password"}
                value={form.accessToken}
                onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                disabled={!canEdit}
                placeholder={cfg.hasAccessToken ? "••••••••••••" : "EAAG..."}
                className="input direction-ltr text-right flex-1"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowAccessToken((v) => !v)}
                className="px-3 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700"
              >
                {showAccessToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Field
            label={
              <>
                App Secret{" "}
                <span className="text-gray-400 font-normal">
                  {cfg.hasAppSecret ? "(اتركه فارغًا للإبقاء على الحالي)" : ""}
                </span>
              </>
            }
            className="md:col-span-2"
          >
            <div className="flex gap-2">
              <input
                type={showAppSecret ? "text" : "password"}
                value={form.appSecret}
                onChange={(e) => setForm({ ...form, appSecret: e.target.value })}
                disabled={!canEdit}
                placeholder={cfg.hasAppSecret ? "••••••••••••" : "32-char hex secret"}
                className="input direction-ltr text-right flex-1"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowAppSecret((v) => !v)}
                className="px-3 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700"
              >
                {showAppSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Field
            label={
              <>
                Webhook Verify Token{" "}
                <span className="text-gray-400 font-normal">
                  (يُستخدم مرة واحدة عند إعداد Webhook على Meta)
                </span>
              </>
            }
            className="md:col-span-2"
          >
            <input
              type="text"
              value={form.webhookVerifyToken}
              onChange={(e) =>
                setForm({ ...form, webhookVerifyToken: e.target.value })
              }
              disabled={!canEdit}
              placeholder={
                cfg.hasWebhookVerifyToken
                  ? "(محفوظ — اتركه فارغًا للإبقاء عليه)"
                  : "أدخل أي سلسلة عشوائية طويلة"
              }
              className="input direction-ltr text-right"
            />
          </Field>

          <Field label="تفعيل التكامل">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                disabled={!canEdit}
                className="w-4 h-4 accent-primary"
              />
              نشط — السماح بإرسال الرسائل
            </label>
          </Field>

          <div className="md:col-span-2 flex justify-end">
            <Can permission="settings.whatsapp:edit">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                حفظ الإعدادات
              </button>
            </Can>
          </div>
        </form>
      </section>

      {/* Business profile */}
      <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-primary" />
            <h2 className="text-lg font-bold text-gray-800">
              الملف التجاري على WhatsApp
            </h2>
          </div>
          {profileLoading && (
            <Loader2 size={14} className="animate-spin text-gray-400" />
          )}
        </div>

        <p className="text-xs text-gray-500">
          يظهر هذا الملف للعملاء عند فتح محادثتك على WhatsApp. الصورة الشخصية،
          الاسم التجاري، الوصف، العنوان، الموقع والبريد — كلها تُحفظ مباشرة عند
          Meta.
        </p>

        <div className="grid md:grid-cols-[200px_1fr] gap-5">
          {/* Profile picture */}
          <div className="space-y-3">
            <div className="relative w-40 h-40 mx-auto rounded-full overflow-hidden border-2 border-gold/30 bg-gray-50 flex items-center justify-center">
              {profile?.profile_picture_url ? (
                <Image
                  src={profile.profile_picture_url}
                  alt="WhatsApp profile"
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <ImageIcon size={48} className="text-gray-300" />
              )}
              {uploadingPhoto && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-white" />
                </div>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto(f);
              }}
            />
            <Can permission="settings.whatsapp:edit">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto || !cfg.hasAccessToken}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm disabled:opacity-50"
              >
                {uploadingPhoto ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                تغيير الصورة
              </button>
            </Can>
            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              JPG أو PNG — أقصى حجم 5MB.
              <br />
              يفضل مربعة ≥ 640×640.
            </p>
          </div>

          {/* Profile fields */}
          <form onSubmit={saveProfile} className="space-y-4">
            <Field
              label={
                <>
                  نبذة (About){" "}
                  <span className="text-gray-400 font-normal">
                    ({profileForm.about.length}/139)
                  </span>
                </>
              }
            >
              <input
                type="text"
                value={profileForm.about}
                maxLength={139}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, about: e.target.value })
                }
                disabled={!canEdit}
                placeholder="فندق المفرق — أجنحة فاخرة ومرحبة"
                className="input"
              />
            </Field>

            <Field
              label={
                <>
                  وصف النشاط (Description){" "}
                  <span className="text-gray-400 font-normal">
                    ({profileForm.description.length}/512)
                  </span>
                </>
              }
            >
              <textarea
                value={profileForm.description}
                maxLength={512}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, description: e.target.value })
                }
                disabled={!canEdit}
                rows={3}
                placeholder="فندق 4 نجوم في قلب المفرق — غرف فندقية وشقق مخدومة مع خدمة 24/7."
                className="input resize-none"
              />
            </Field>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="العنوان">
                <input
                  type="text"
                  value={profileForm.address}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, address: e.target.value })
                  }
                  disabled={!canEdit}
                  placeholder="المفرق - حي الزهور"
                  className="input"
                />
              </Field>

              <Field label="البريد الإلكتروني">
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, email: e.target.value })
                  }
                  disabled={!canEdit}
                  placeholder="info@mafhotel.com"
                  className="input direction-ltr text-right"
                />
              </Field>

              <Field label="القطاع (Vertical)">
                <select
                  value={profileForm.vertical}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, vertical: e.target.value })
                  }
                  disabled={!canEdit}
                  className="input"
                >
                  {VERTICALS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={
                  <>
                    المواقع الإلكترونية{" "}
                    <span className="text-gray-400 font-normal">
                      (سطر لكل رابط — حدّ أقصى 2)
                    </span>
                  </>
                }
              >
                <textarea
                  value={profileForm.websites}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, websites: e.target.value })
                  }
                  disabled={!canEdit}
                  rows={2}
                  placeholder="https://mafhotel.com"
                  className="input direction-ltr text-right resize-none"
                />
              </Field>
            </div>

            <div className="flex justify-end">
              <Can permission="settings.whatsapp:edit">
                <button
                  type="submit"
                  disabled={profileSaving || !cfg.hasAccessToken}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium disabled:opacity-50"
                >
                  {profileSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  حفظ الملف التجاري
                </button>
              </Can>
            </div>
          </form>
        </div>
      </section>

      {/* Templates */}
      <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold text-gray-800">قوالب الرسائل</h2>
          <Can permission="whatsapp:sync_templates">
            <button
              onClick={syncTemplates}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-2 border border-primary text-primary rounded-lg hover:bg-gold-soft text-sm disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              مزامنة من Meta
            </button>
          </Can>
        </div>

        {templates.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center flex flex-col items-center gap-2">
            <AlertTriangle size={24} className="text-amber-400" />
            لا توجد قوالب محفوظة — اضغط "مزامنة من Meta" بعد إعداد Access Token.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-600 bg-gray-50">
                <tr>
                  <th className="text-right px-3 py-2 font-medium">الاسم</th>
                  <th className="text-right px-3 py-2 font-medium">اللغة</th>
                  <th className="text-right px-3 py-2 font-medium">الفئة</th>
                  <th className="text-right px-3 py-2 font-medium">الحالة</th>
                  <th className="text-right px-3 py-2 font-medium">آخر مزامنة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-medium text-gray-800 direction-ltr text-right">
                      {t.name}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{t.language}</td>
                    <td className="px-3 py-2 text-gray-600">{t.category}</td>
                    <td className="px-3 py-2">
                      <TemplateStatusBadge status={t.status} />
                      {t.rejectionReason && (
                        <p className="text-[11px] text-red-500 mt-0.5">
                          {t.rejectionReason}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">
                      {new Date(t.lastSyncedAt).toLocaleString("ar")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showRegisterDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="text-amber-500" size={22} />
              <h3 className="text-lg font-bold text-gray-800">
                تسجيل الرقم على Cloud API
              </h3>
            </div>
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                هذه العملية <strong>لازمة مرة واحدة فقط</strong> لتُصبح أرقام
                الواتساب قادرة على الإرسال والاستقبال عبر Cloud API. تُعالج خطأ{" "}
                <code className="bg-gray-100 px-1 rounded">#133010</code> «Account not registered».
              </p>
              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                أدخل PIN من 6 أرقام. إذا كنت قد ضبطت{" "}
                <strong>التحقق بخطوتين</strong> على الرقم من WhatsApp Manager،
                استخدم نفس الـ PIN. إن لم يكن مُضبوطًا، اختر 6 أرقام جديدة
                وستُصبح هي PIN التحقق بخطوتين.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                PIN (6 أرقام)
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={registerPin}
                onChange={(e) =>
                  setRegisterPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-lg tracking-[0.4em] text-center direction-ltr font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRegisterDialog(false);
                  setRegisterPin("");
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={registerNumber}
                disabled={registering || registerPin.length !== 6}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm"
              >
                {registering ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <KeyRound size={14} />
                )}
                تسجيل الرقم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 1px solid rgb(229 231 235);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
          outline: none;
          border-color: var(--color-primary, rgb(180 83 9));
          box-shadow: 0 0 0 2px rgba(180, 83, 9, 0.15);
        }
        :global(.input:disabled) {
          background: rgb(249 250 251);
          color: rgb(107 114 128);
        }
      `}</style>
    </div>
  );
}

function StatusCard({
  title,
  ok,
  lines,
}: {
  title: string;
  ok: boolean | null;
  lines: (string | null)[];
}) {
  const tone =
    ok === true
      ? "border-green-200 bg-green-50"
      : ok === false
        ? "border-red-200 bg-red-50"
        : "border-amber-200 bg-amber-50";
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertTriangle;
  const iconColor =
    ok === true ? "text-green-600" : ok === false ? "text-red-600" : "text-amber-600";

  return (
    <div className={cn("rounded-xl border p-4 space-y-2", tone)}>
      <div className="flex items-center gap-2 font-medium text-gray-800">
        <Icon size={18} className={iconColor} />
        {title}
      </div>
      <ul className="text-xs text-gray-600 space-y-1">
        {lines.filter(Boolean).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function TemplateStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPROVED: "bg-green-100 text-green-700",
    PENDING: "bg-amber-100 text-amber-700",
    REJECTED: "bg-red-100 text-red-700",
    PAUSED: "bg-gray-100 text-gray-700",
    DISABLED: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full",
        map[status] ?? "bg-gray-100 text-gray-700",
      )}
    >
      {status}
    </span>
  );
}
