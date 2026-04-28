"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Send,
  X,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Upload,
  Link as LinkIcon,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

/**
 * TemplateSendModal — generic "send any approved template" dialog.
 *
 * Reads the template's variables from the API (which introspects the
 * locally-cached components) and renders one input per variable. Adding
 * a new template at Meta requires zero code changes here: sync, then
 * send.
 */

export type TemplateScope = "header" | "body" | "button";

export interface TemplateVariable {
  id: string;
  scope: TemplateScope;
  index: number;
  buttonIndex?: number;
  buttonSubType?: "url";
  paramType:
    | "text"
    | "image"
    | "video"
    | "document"
    | "currency"
    | "date_time"
    | "location";
  label: string;
  defaultValue?: string;
  hint?: string;
}

export interface TemplateInspection {
  name: string;
  language: string;
  category: string;
  status: string;
  variables: TemplateVariable[];
  bodyPreview?: string;
  footerText?: string;
  headerPreview?: string;
  buttons: { index: number; type: string; text: string; hasVariable: boolean }[];
  isStatic: boolean;
}

interface Props {
  templateName: string;
  templateLanguage: string;
  open: boolean;
  onClose: () => void;
}

const PLACEHOLDER_RE = /\{\{\s*(\d+)\s*\}\}/g;

const MEDIA_PARAM_TYPES: TemplateVariable["paramType"][] = [
  "image",
  "video",
  "document",
];

function isMediaVariable(v: TemplateVariable): boolean {
  return MEDIA_PARAM_TYPES.includes(v.paramType);
}

function acceptForParamType(type: TemplateVariable["paramType"]): string {
  switch (type) {
    case "image":
      return "image/*";
    case "video":
      return "video/*";
    case "document":
      return "application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
    default:
      return "";
  }
}

function renderPreview(
  text: string | undefined,
  values: Record<string, string>,
  scope: "header" | "body",
): string {
  if (!text) return "";
  return text.replace(PLACEHOLDER_RE, (_, n) => {
    const id = `${scope}:${n}`;
    return values[id] && values[id].trim().length > 0
      ? values[id]
      : `{{${n}}}`;
  });
}

/**
 * One row per template variable. For text-like variables this is a plain
 * input. For media variables (image/video/document) it offers a tabbed
 * choice between uploading a file (→ Meta media_id) or pasting a public
 * URL (→ link). The chosen value lands in `values[v.id]` either as a
 * raw URL or as a media_id; the server route reconstructs the right
 * Cloud-API shape.
 */
function VariableField({
  variable: v,
  value,
  onChange,
}: {
  variable: TemplateVariable;
  value: string;
  onChange: (val: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "url">(
    value && value.startsWith("http") ? "url" : "upload",
  );
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<{ name: string; size: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const isMedia = isMediaVariable(v);

  async function uploadFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/whatsapp/media/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        mediaId?: string;
        error?: string;
      };
      if (!res.ok || !data.mediaId) {
        throw new Error(data.error ?? "فشل الرفع");
      }
      onChange(data.mediaId);
      setUploadInfo({ name: file.name, size: file.size });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ في الرفع";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {v.label}
        <span className="text-[10px] font-mono text-gray-400 mr-2">
          {v.scope}:{v.buttonIndex !== undefined ? v.buttonIndex : v.index}
        </span>
      </label>

      {!isMedia && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={v.defaultValue ?? ""}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      )}

      {isMedia && (
        <div className="space-y-2">
          {/* Mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-colors ${
                mode === "upload"
                  ? "bg-white text-primary font-bold shadow-sm"
                  : "text-gray-600"
              }`}
            >
              <Upload size={12} /> ارفع ملفاً
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1 transition-colors ${
                mode === "url"
                  ? "bg-white text-primary font-bold shadow-sm"
                  : "text-gray-600"
              }`}
            >
              <LinkIcon size={12} /> أو ضع رابطاً عاماً
            </button>
          </div>

          {mode === "upload" ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={acceptForParamType(v.paramType)}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f);
                  e.target.value = "";
                }}
              />
              {uploadInfo && value && !value.startsWith("http") ? (
                <div className="flex items-center gap-2 p-2.5 border border-emerald-200 bg-emerald-50 rounded-lg text-sm">
                  <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-emerald-900 truncate">
                      {uploadInfo.name}
                    </div>
                    <div className="text-[10px] text-emerald-700 font-mono direction-ltr">
                      media_id: {value.slice(0, 20)}…
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setUploadInfo(null);
                    }}
                    className="p-1 hover:bg-emerald-100 rounded text-emerald-700"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : v.paramType === "document" ? (
                    <FileText size={14} />
                  ) : (
                    <Upload size={14} />
                  )}
                  {uploading
                    ? "جاري الرفع إلى Meta…"
                    : v.paramType === "image"
                      ? "اختر صورة"
                      : v.paramType === "video"
                        ? "اختر فيديو"
                        : "اختر ملفاً (PDF يُفضّل)"}
                </button>
              )}
            </>
          ) : (
            <input
              type="url"
              dir="ltr"
              value={value && value.startsWith("http") ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://example.com/path/file.pdf"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
            />
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
        </div>
      )}

      {v.hint && !isMedia && (
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          {v.hint}
        </p>
      )}
    </div>
  );
}

export default function TemplateSendModal({
  templateName,
  templateLanguage,
  open,
  onClose,
}: Props) {
  const [inspection, setInspection] = useState<TemplateInspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [phone, setPhone] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the modal is reopened with a new template.
  useEffect(() => {
    if (!open) return;
    setInspection(null);
    setValues({});
    setPhone("");
    setError(null);

    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/whatsapp/templates/send?name=${encodeURIComponent(
        templateName,
      )}&language=${encodeURIComponent(templateLanguage)}`,
    )
      .then(async (res) => {
        const data = (await res.json()) as TemplateInspection | { error: string };
        if (cancelled) return;
        if (!res.ok || "error" in data) {
          setError("error" in data ? data.error : "تعذّر تحميل القالب");
          return;
        }
        setInspection(data);
        const seed: Record<string, string> = {};
        for (const v of data.variables) {
          if (v.defaultValue !== undefined) seed[v.id] = v.defaultValue;
        }
        setValues(seed);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message ?? "خطأ غير متوقع");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, templateName, templateLanguage]);

  const canSend = useMemo(() => {
    if (!inspection) return false;
    if (sending) return false;
    if (!phone.trim()) return false;
    for (const v of inspection.variables) {
      const val = values[v.id];
      if (!val || val.trim().length === 0) return false;
    }
    return true;
  }, [inspection, values, phone, sending]);

  const setVar = (id: string, val: string) =>
    setValues((prev) => ({ ...prev, [id]: val }));

  async function send() {
    if (!inspection) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/templates/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inspection.name,
          language: inspection.language,
          to: phone.trim(),
          values,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        messageId?: string | null;
        error?: string;
        meta?: {
          status?: number;
          code?: number;
          subcode?: number;
          fbtraceId?: string;
        } | null;
      };
      if (!res.ok || !data.ok) {
        const msg = data.error ?? "فشل الإرسال";
        const detail = data.meta?.code
          ? ` (Meta code: ${data.meta.code}${
              data.meta.subcode ? "/" + data.meta.subcode : ""
            })`
          : "";
        setError(msg + detail);
        toast.error(msg);
        return;
      }
      toast.success(
        `تمّ الإرسال — معرّف الرسالة: ${data.messageId ?? "—"}`,
      );
      onClose();
    } catch (err) {
      const msg = (err as Error).message ?? "خطأ في الشبكة";
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              إرسال قالب: <span dir="ltr">{templateName}</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              لغة: {templateLanguage} — تتم إعبئة المتغيّرات تلقائياً من تعريف Meta
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="animate-spin" size={18} />
              <span className="mr-2">جاري قراءة بنية القالب…</span>
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {inspection && !loading && (
            <>
              {/* Status banner */}
              {inspection.status !== "APPROVED" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    حالة هذا القالب{" "}
                    <span className="font-mono">{inspection.status}</span> —
                    لن يقبله Meta للإرسال.
                  </div>
                </div>
              )}

              {/* Recipient */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  رقم المستلم (يدعم +962…، 00962…، 962…)
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+962 7X XXX XXXX"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono"
                />
              </div>

              {/* Static template — nothing to fill */}
              {inspection.isStatic && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    هذا القالب لا يحتوي متغيّرات — يمكن إرساله مباشرةً.
                  </div>
                </div>
              )}

              {/* Variables grouped by scope */}
              {!inspection.isStatic && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    اكتشفنا{" "}
                    <span className="font-bold text-primary">
                      {inspection.variables.length}
                    </span>{" "}
                    متغيّراً في هذا القالب. القيم الافتراضية مأخوذة من نموذج
                    المثال الذي اعتمده Meta.
                  </p>
                  {inspection.variables.map((v) => (
                    <VariableField
                      key={v.id}
                      variable={v}
                      value={values[v.id] ?? ""}
                      onChange={(val) => setVar(v.id, val)}
                    />
                  ))}
                </div>
              )}

              {/* Live preview */}
              {(inspection.headerPreview ||
                inspection.bodyPreview ||
                inspection.footerText ||
                inspection.buttons.length > 0) && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                    <Eye size={12} /> معاينة بعد التعبئة
                  </div>
                  {inspection.headerPreview && (
                    <div className="text-sm font-bold text-gray-800">
                      {renderPreview(inspection.headerPreview, values, "header")}
                    </div>
                  )}
                  {inspection.bodyPreview && (
                    <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                      {renderPreview(inspection.bodyPreview, values, "body")}
                    </div>
                  )}
                  {inspection.footerText && (
                    <div className="text-[11px] text-gray-500">
                      {inspection.footerText}
                    </div>
                  )}
                  {inspection.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-200 mt-2">
                      {inspection.buttons.map((b) => (
                        <span
                          key={b.index}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-gray-300 text-gray-700"
                        >
                          {b.text} <span className="text-gray-400">({b.type})</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={send}
            disabled={!canSend}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            إرسال عبر WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
