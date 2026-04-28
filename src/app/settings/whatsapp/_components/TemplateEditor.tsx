"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Send,
  X,
  Plus,
  Trash2,
  Eye,
  AlertTriangle,
  Upload,
  CheckCircle2,
  FileText,
  ImageIcon,
  Video,
} from "lucide-react";
import { toast } from "sonner";

/**
 * TemplateEditor — modal-style form that lets an operator submit a new
 * AUTHENTICATION / UTILITY / MARKETING template to Meta directly from
 * `/settings/whatsapp` without ever opening WhatsApp Manager.
 *
 * The form composes Meta's `components` array on the fly:
 *
 *   AUTHENTICATION (used for OTPs):
 *     ├── BODY     ({{1}} placeholder for the code; auto-supplied)
 *     ├── FOOTER   (e.g. "لا تشارك هذا الرمز" — auto-suggested)
 *     └── BUTTONS  (OTP COPY_CODE button — required, auto-built)
 *
 *   UTILITY / MARKETING:
 *     ├── HEADER   (TEXT only for now — IMAGE/VIDEO require media handle)
 *     ├── BODY     (free-form, with {{1}}…{{n}} placeholders)
 *     ├── FOOTER   (optional, ≤ 60 chars)
 *     └── BUTTONS  (URL / PHONE_NUMBER / QUICK_REPLY — up to 3)
 *
 * What we don't surface yet (rare for a hotel use case): LOCATION header,
 * carousel templates, MPM (catalogue). Easy to add later.
 */

type Category = "AUTHENTICATION" | "UTILITY" | "MARKETING";

interface ButtonDef {
  type: "URL" | "PHONE_NUMBER" | "QUICK_REPLY";
  text: string;
  url?: string;
  phone?: string;
}

type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

interface FormState {
  name: string;
  language: string;
  category: Category;

  headerEnabled: boolean;
  /** Choose how the header renders. Media headers require a sample upload
   *  to obtain a Resumable Upload handle that Meta accepts. */
  headerFormat: HeaderFormat;
  headerText: string;
  /** Opaque Meta handle (e.g. `4::aXOM…`) returned by `/api/whatsapp/media/sample`. */
  headerMediaHandle: string;
  /** File name shown in WhatsApp clients (DOCUMENT only). */
  headerMediaName: string;
  /** Bytes — purely UI affordance, not part of the payload. */
  headerMediaSize: number;

  body: string;

  footerEnabled: boolean;
  footer: string;

  buttons: ButtonDef[];

  // AUTHENTICATION-specific
  authCodeExpirationMinutes: number;
  authAddSecurityFooter: boolean;
}

const LANGUAGES: { code: string; label: string }[] = [
  { code: "ar", label: "العربية (ar)" },
  { code: "ar_EG", label: "العربية - مصر (ar_EG)" },
  { code: "ar_SA", label: "العربية - السعودية (ar_SA)" },
  { code: "en", label: "English (en)" },
  { code: "en_US", label: "English - US (en_US)" },
  { code: "en_GB", label: "English - UK (en_GB)" },
  { code: "tr", label: "Türkçe (tr)" },
  { code: "fr", label: "Français (fr)" },
];

export function TemplateEditor({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => makeInitial());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(makeInitial());
      setError(null);
    }
  }, [open]);

  // Build the Meta `components` array from the current form state. The
  // logic differs significantly between AUTHENTICATION and the other two
  // categories — Meta has a special "OTP" button structure.
  const components = useMemo(() => buildComponents(form), [form]);

  const placeholders = useMemo(() => extractPlaceholders(form.body), [form.body]);

  if (!open) return null;

  async function submit() {
    setError(null);
    if (!/^[a-z0-9_]{1,512}$/.test(form.name)) {
      setError("اسم القالب: حروف إنجليزية صغيرة وأرقام و _ فقط.");
      return;
    }
    if (form.category !== "AUTHENTICATION" && form.body.trim().length < 1) {
      setError("نص الـ Body مطلوب.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/whatsapp/templates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          language: form.language,
          category: form.category,
          components,
          allow_category_change: form.category !== "AUTHENTICATION",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل الإنشاء");
      toast.success("تم إرسال القالب إلى Meta للمراجعة");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل الإنشاء");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Send size={18} className="text-primary" />
            إنشاء قالب رسالة جديد
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {/* Basic info */}
          <div className="grid sm:grid-cols-3 gap-3">
            <FieldBox label="الاسم (snake_case)">
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, "_")
                      .slice(0, 512),
                  })
                }
                placeholder="otp_login_ar"
                className="input direction-ltr text-right"
              />
            </FieldBox>
            <FieldBox label="اللغة">
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="input"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </FieldBox>
            <FieldBox label="الفئة">
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as Category })
                }
                className="input"
              >
                <option value="AUTHENTICATION">
                  AUTHENTICATION (رموز التحقّق)
                </option>
                <option value="UTILITY">UTILITY (تأكيدات الحجز)</option>
                <option value="MARKETING">MARKETING (عروض ترويجية)</option>
              </select>
            </FieldBox>
          </div>

          <CategoryHelp category={form.category} />

          {/* Authentication-specific quick form */}
          {form.category === "AUTHENTICATION" ? (
            <AuthSection form={form} setForm={setForm} />
          ) : (
            <NonAuthSection
              form={form}
              setForm={setForm}
              placeholders={placeholders}
            />
          )}

          {/* Live preview */}
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
              <Eye size={14} />
              معاينة شكل الـ payload المُرسَل إلى Meta
            </div>
            <pre className="text-[11px] bg-white border border-gray-100 rounded-lg p-3 overflow-x-auto direction-ltr text-left max-h-48 leading-relaxed">
              {JSON.stringify(
                {
                  name: form.name || "(empty)",
                  language: form.language,
                  category: form.category,
                  components,
                },
                null,
                2,
              )}
            </pre>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 p-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
          >
            إلغاء
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            إرسال للمراجعة
          </button>
        </div>

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
        `}</style>
      </div>
    </div>
  );
}

function makeInitial(): FormState {
  return {
    name: "",
    language: "ar",
    category: "AUTHENTICATION",
    headerEnabled: false,
    headerFormat: "TEXT",
    headerText: "",
    headerMediaHandle: "",
    headerMediaName: "",
    headerMediaSize: 0,
    body: "",
    footerEnabled: false,
    footer: "",
    buttons: [],
    authCodeExpirationMinutes: 10,
    authAddSecurityFooter: true,
  };
}

function FieldBox({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

function CategoryHelp({ category }: { category: Category }) {
  const map: Record<Category, { tone: string; text: string }> = {
    AUTHENTICATION: {
      tone: "bg-blue-50 border-blue-200 text-blue-800",
      text: "تستخدم لإرسال رموز OTP للضيوف الجدد (تتجاوز نافذة 24 ساعة). ميتا يقبل القالب عادة خلال دقائق.",
    },
    UTILITY: {
      tone: "bg-emerald-50 border-emerald-200 text-emerald-800",
      text: "للتحديثات المعاملاتية (تأكيد حجز، تذكير بموعد). تتطلب أن يكون العميل قد تفاعل سابقاً، أو ضمن اشتراك سابق.",
    },
    MARKETING: {
      tone: "bg-amber-50 border-amber-200 text-amber-800",
      text: "للعروض الترويجية. تكلفة أعلى لكل محادثة، وتشترط Opt-in من العميل. تجنّبها للرسائل التشغيلية.",
    },
  };
  const item = map[category];
  return (
    <div className={`text-xs border rounded-lg p-2 ${item.tone}`}>
      {item.text}
    </div>
  );
}

function AuthSection({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (s: FormState) => void;
}) {
  return (
    <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 space-y-3">
      <div className="text-sm font-medium text-blue-900">
        بنية قالب التحقّق (OTP) — تُبنى تلقائياً
      </div>
      <p className="text-xs text-blue-800 leading-relaxed">
        Meta يفرض شكلاً موحّداً لقوالب AUTHENTICATION: نص بسيط فيه
        <code className="px-1 bg-white rounded mx-1">{"{{1}}"}</code>
        للرمز + زر Copy-Code. لا حاجة لكتابة نص الجسم بنفسك.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <FieldBox label="مدّة صلاحية الرمز (دقائق)">
          <input
            type="number"
            min={1}
            max={90}
            value={form.authCodeExpirationMinutes}
            onChange={(e) =>
              setForm({
                ...form,
                authCodeExpirationMinutes: Math.max(
                  1,
                  Math.min(90, Number(e.target.value) || 10),
                ),
              })
            }
            className="input direction-ltr text-right"
          />
        </FieldBox>
        <FieldBox label="إضافة footer أمنيّة">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.authAddSecurityFooter}
              onChange={(e) =>
                setForm({ ...form, authAddSecurityFooter: e.target.checked })
              }
              className="w-4 h-4 accent-primary"
            />
            «لا تشارك هذا الرمز مع أيّ شخص»
          </label>
        </FieldBox>
      </div>
    </div>
  );
}

function NonAuthSection({
  form,
  setForm,
  placeholders,
}: {
  form: FormState;
  setForm: (s: FormState) => void;
  placeholders: number[];
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <HeaderSection form={form} setForm={setForm} />

      {/* Body */}
      <FieldBox
        label={
          <>
            نص Body <span className="text-red-500">*</span>{" "}
            <span className="text-gray-400 font-normal">
              ({form.body.length}/1024) — استخدم {"{{1}}"} {"{{2}}"} للمتغيرات
            </span>
          </>
        }
      >
        <textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value.slice(0, 1024) })}
          rows={5}
          placeholder={`أهلاً {{1}}، حجزك رقم {{2}} مؤكَّد من ${"{{3}}"} إلى {{4}}.`}
          className="input resize-none"
        />
        {placeholders.length > 0 && (
          <div className="text-[11px] text-gray-500 mt-1">
            متغيرات مكتشفة: {placeholders.map((n) => `{{${n}}}`).join(", ")}
          </div>
        )}
      </FieldBox>

      {/* Footer */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={form.footerEnabled}
            onChange={(e) => setForm({ ...form, footerEnabled: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          إضافة Footer (اختياري)
        </label>
        {form.footerEnabled && (
          <input
            type="text"
            maxLength={60}
            value={form.footer}
            onChange={(e) => setForm({ ...form, footer: e.target.value })}
            placeholder="فندق المفرق — Mafraq Hotel"
            className="input"
          />
        )}
      </div>

      {/* Buttons */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            أزرار (حدّ أقصى 3)
          </span>
          {form.buttons.length < 3 && (
            <div className="flex gap-1">
              {(["QUICK_REPLY", "URL", "PHONE_NUMBER"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setForm({
                      ...form,
                      buttons: [
                        ...form.buttons,
                        { type: t, text: "", url: "", phone: "" },
                      ],
                    })
                  }
                  className="text-[10px] flex items-center gap-1 px-2 py-1 border border-primary text-primary rounded hover:bg-gold-soft"
                >
                  <Plus size={10} />
                  {labelButton(t)}
                </button>
              ))}
            </div>
          )}
        </div>
        {form.buttons.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-2">
            لا أزرار — اختياري.
          </div>
        ) : (
          <div className="space-y-2">
            {form.buttons.map((b, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg p-2"
              >
                <span className="text-[10px] font-mono bg-white border rounded px-2 py-0.5 text-gray-500">
                  {labelButton(b.type)}
                </span>
                <input
                  type="text"
                  value={b.text}
                  maxLength={25}
                  onChange={(e) =>
                    updateButton(form, setForm, i, { text: e.target.value })
                  }
                  placeholder="نص الزر (≤ 25)"
                  className="input flex-1 min-w-[140px]"
                />
                {b.type === "URL" && (
                  <input
                    type="url"
                    value={b.url}
                    onChange={(e) =>
                      updateButton(form, setForm, i, { url: e.target.value })
                    }
                    placeholder="https://mafhotel.com/booking/{{1}}"
                    className="input flex-1 min-w-[200px] direction-ltr text-right"
                  />
                )}
                {b.type === "PHONE_NUMBER" && (
                  <input
                    type="tel"
                    value={b.phone}
                    onChange={(e) =>
                      updateButton(form, setForm, i, { phone: e.target.value })
                    }
                    placeholder="+962790000000"
                    className="input flex-1 min-w-[160px] direction-ltr text-right"
                  />
                )}
                <button
                  onClick={() =>
                    setForm({
                      ...form,
                      buttons: form.buttons.filter((_, idx) => idx !== i),
                    })
                  }
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Header section that supports the four formats Meta exposes for non-auth
 * templates: TEXT (in-line), and IMAGE/VIDEO/DOCUMENT — the latter three
 * require uploading a sample file to the Resumable Upload API and storing
 * its opaque handle in `example.header_handle[0]`.
 */
function HeaderSection({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (s: FormState) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function pickFormat(fmt: HeaderFormat) {
    setForm({
      ...form,
      headerFormat: fmt,
      // Reset the other channel's data when switching format.
      headerText: fmt === "TEXT" ? form.headerText : "",
      headerMediaHandle: fmt === "TEXT" ? "" : form.headerMediaHandle,
      headerMediaName: fmt === "TEXT" ? "" : form.headerMediaName,
      headerMediaSize: fmt === "TEXT" ? 0 : form.headerMediaSize,
    });
    setUploadError(null);
  }

  async function uploadSample(file: File) {
    // Light client-side mime/size guards to avoid wasting an API round-trip.
    const expectedMajor =
      form.headerFormat === "IMAGE"
        ? "image"
        : form.headerFormat === "VIDEO"
          ? "video"
          : null; // DOCUMENT accepts many mimes
    if (expectedMajor && !file.type.startsWith(expectedMajor + "/")) {
      setUploadError(
        `نوع الملف لا يطابق الصيغة المختارة (${form.headerFormat}). المتوقّع: ${expectedMajor}/*`,
      );
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/whatsapp/media/sample", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        handle?: string;
        error?: string;
      };
      if (!res.ok || !data.handle) {
        throw new Error(data.error ?? "فشل رفع العيّنة");
      }
      setForm({
        ...form,
        headerMediaHandle: data.handle,
        headerMediaName: file.name,
        headerMediaSize: file.size,
      });
      toast.success("تمّ رفع عيّنة الترويسة وحفظ الـ handle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ غير متوقّع";
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <input
          type="checkbox"
          checked={form.headerEnabled}
          onChange={(e) => setForm({ ...form, headerEnabled: e.target.checked })}
          className="w-4 h-4 accent-primary"
        />
        إضافة Header (اختياري)
      </label>

      {form.headerEnabled && (
        <>
          {/* Format pills */}
          <div className="flex flex-wrap gap-1">
            {(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => pickFormat(fmt)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  form.headerFormat === fmt
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {fmt === "TEXT" && <FileText size={12} />}
                {fmt === "IMAGE" && <ImageIcon size={12} />}
                {fmt === "VIDEO" && <Video size={12} />}
                {fmt === "DOCUMENT" && <FileText size={12} />}
                {fmt === "TEXT"
                  ? "نصّ"
                  : fmt === "IMAGE"
                    ? "صورة"
                    : fmt === "VIDEO"
                      ? "فيديو"
                      : "PDF/مستند"}
              </button>
            ))}
          </div>

          {form.headerFormat === "TEXT" ? (
            <input
              type="text"
              maxLength={60}
              value={form.headerText}
              onChange={(e) => setForm({ ...form, headerText: e.target.value })}
              placeholder="مثال: تأكيد حجزك في فندق المفرق"
              className="input"
            />
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                ارفع <span className="font-bold">عيّنة</span> من نفس النوع
                لاعتماد القالب عند Meta. ملاحظة: عند الإرسال الفعلي، ستضع
                ملفاً مختلفاً لكلّ عميل (مثلاً عقد كل ضيف على حدة) — هذه
                مجرّد عيّنة تعرضها Meta عند المراجعة.
              </p>

              <input
                ref={fileRef}
                type="file"
                accept={
                  form.headerFormat === "IMAGE"
                    ? "image/jpeg,image/png"
                    : form.headerFormat === "VIDEO"
                      ? "video/mp4,video/3gpp"
                      : "application/pdf"
                }
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadSample(f);
                  e.target.value = "";
                }}
              />

              {!form.headerMediaHandle ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 w-full justify-center"
                >
                  {uploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {uploading
                    ? "جاري الرفع إلى Meta…"
                    : `اختر ملف ${
                        form.headerFormat === "IMAGE"
                          ? "صورة (JPG/PNG ≤ 5MB)"
                          : form.headerFormat === "VIDEO"
                            ? "فيديو (MP4 ≤ 16MB)"
                            : "PDF (≤ 100MB)"
                      }`}
                </button>
              ) : (
                <div className="flex items-center gap-2 p-3 border border-emerald-200 bg-emerald-50 rounded-lg text-sm">
                  <CheckCircle2
                    size={16}
                    className="text-emerald-600 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-emerald-900 truncate">
                      {form.headerMediaName || "عيّنة مرفوعة"}
                    </div>
                    <div className="text-[10px] text-emerald-700 font-mono direction-ltr text-left truncate">
                      handle: {form.headerMediaHandle.slice(0, 24)}…
                      {form.headerMediaSize > 0 &&
                        ` · ${(form.headerMediaSize / 1024).toFixed(0)}KB`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        headerMediaHandle: "",
                        headerMediaName: "",
                        headerMediaSize: 0,
                      })
                    }
                    className="p-1 hover:bg-emerald-100 rounded text-emerald-700"
                    title="إزالة"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {uploadError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {uploadError}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function updateButton(
  form: FormState,
  setForm: (s: FormState) => void,
  index: number,
  patch: Partial<ButtonDef>,
) {
  setForm({
    ...form,
    buttons: form.buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)),
  });
}

function labelButton(t: ButtonDef["type"]): string {
  return t === "URL"
    ? "رابط"
    : t === "PHONE_NUMBER"
      ? "اتصال"
      : "ردّ سريع";
}

/** Extract `{{n}}` placeholders mentioned in the body, sorted unique. */
function extractPlaceholders(body: string): number[] {
  const set = new Set<number>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = Number(m[1]);
    if (n > 0) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Compose Meta's `components` array. Centralised here so the live preview
 * and the actual submission stay in sync.
 */
function buildComponents(form: FormState): unknown[] {
  if (form.category === "AUTHENTICATION") {
    const body = {
      type: "BODY",
      add_security_recommendation: form.authAddSecurityFooter,
    };
    const footer = {
      type: "FOOTER",
      code_expiration_minutes: form.authCodeExpirationMinutes,
    };
    const buttons = {
      type: "BUTTONS",
      buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "نسخ الرمز" }],
    };
    return [body, footer, buttons];
  }

  const out: unknown[] = [];

  if (form.headerEnabled) {
    if (form.headerFormat === "TEXT") {
      if (form.headerText.trim()) {
        out.push({ type: "HEADER", format: "TEXT", text: form.headerText.trim() });
      }
    } else if (form.headerMediaHandle) {
      out.push({
        type: "HEADER",
        format: form.headerFormat,
        example: { header_handle: [form.headerMediaHandle] },
      });
    }
  }

  out.push({ type: "BODY", text: form.body });

  if (form.footerEnabled && form.footer.trim()) {
    out.push({ type: "FOOTER", text: form.footer.trim() });
  }

  if (form.buttons.length > 0) {
    out.push({
      type: "BUTTONS",
      buttons: form.buttons.map((b) => {
        if (b.type === "URL") {
          return { type: "URL", text: b.text, url: b.url };
        }
        if (b.type === "PHONE_NUMBER") {
          return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone };
        }
        return { type: "QUICK_REPLY", text: b.text };
      }),
    });
  }

  return out;
}
