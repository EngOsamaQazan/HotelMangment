"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  StickyNote,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Can } from "@/components/Can";

type MediaKind = "image" | "video" | "document" | "audio";

interface Props {
  onSend: (text: string) => Promise<void>;
  onSendNote: (text: string) => Promise<void>;
  onSendMedia?: (file: File, caption: string, kind: MediaKind) => Promise<void>;
  onOpenTemplate: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  sending: boolean;
}

/**
 * Two-mode composer — "ردّ عام" (sent to customer via Meta) vs. "ملاحظة داخلية"
 * (stored locally, visible to staff only).
 *
 * Mobile-friendly touches:
 *   • Textarea auto-grows from 1 → 6 rows as the user types; keeps the
 *     conversation maximally visible on short phones.
 *   • Send button is 44×44 (WCAG 2.5.5 AAA).
 *   • `pb-safe` reserves space for the iOS home indicator so the send button
 *     isn't obscured when the device is cased-in landscape.
 *   • `text-base` on the textarea prevents iOS Safari's auto-zoom on focus.
 */
export function Composer({
  onSend,
  onSendNote,
  onSendMedia,
  onOpenTemplate,
  disabled,
  disabledReason,
  sending,
}: Props) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    kind: MediaKind;
    previewUrl: string | null;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 24 * 6 + 16;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [text]);

  useEffect(() => {
    return () => {
      if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    };
  }, [pendingFile]);

  function pickFile(kind: MediaKind) {
    const el =
      kind === "image"
        ? imageInputRef.current
        : kind === "video"
          ? videoInputRef.current
          : documentInputRef.current;
    el?.click();
  }

  function onFileSelected(file: File, kind: MediaKind) {
    const previewUrl = kind === "image" ? URL.createObjectURL(file) : null;
    setPendingFile({ file, kind, previewUrl });
    setMode("reply");
  }

  function clearFile() {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (pendingFile && onSendMedia) {
      await onSendMedia(pendingFile.file, value, pendingFile.kind);
      clearFile();
      setText("");
      return;
    }
    if (!value) return;
    if (mode === "reply") {
      await onSend(value);
    } else {
      await onSendNote(value);
    }
    setText("");
  }

  if (disabled) {
    return (
      <div className="p-3 pb-safe text-xs text-gray-500 text-center border-t border-gray-100 bg-gray-50">
        {disabledReason ?? "لا يمكنك الإرسال في هذه المحادثة."}
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 pb-safe">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f, "image");
          e.target.value = "";
        }}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f, "document");
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/3gpp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f, "video");
          e.target.value = "";
        }}
      />

      {pendingFile && (
        <div className="mx-3 mt-2 p-2 rounded-xl bg-gray-50 border border-gray-200 flex items-center gap-3">
          {pendingFile.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pendingFile.previewUrl}
              alt="preview"
              className="w-16 h-16 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileText size={24} />
            </div>
          )}
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-medium text-gray-800 truncate">
              {pendingFile.file.name}
            </div>
            <div className="text-gray-500">
              {pendingFile.kind === "image" && "صورة"}
              {pendingFile.kind === "video" && "فيديو"}
              {pendingFile.kind === "document" && "مستند"}
              {pendingFile.kind === "audio" && "صوت"}
              {" · "}
              {formatBytes(pendingFile.file.size)}
            </div>
          </div>
          <button
            type="button"
            onClick={clearFile}
            className="tap-44 w-9 h-9 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500 shrink-0"
            aria-label="إزالة المرفق"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 pt-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setMode("reply")}
          className={cn(
            "shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors",
            "min-h-[32px] touch-manipulation",
            mode === "reply"
              ? "bg-primary text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200",
          )}
          aria-pressed={mode === "reply"}
        >
          <Send size={11} />
          رد على العميل
        </button>
        <Can permission="whatsapp:notes">
          <button
            onClick={() => setMode("note")}
            disabled={!!pendingFile}
            className={cn(
              "shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors",
              "min-h-[32px] touch-manipulation disabled:opacity-40",
              mode === "note"
                ? "bg-yellow-400 text-yellow-900"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
            aria-pressed={mode === "note"}
            title={pendingFile ? "أزل المرفق أولاً" : undefined}
          >
            <StickyNote size={11} />
            ملاحظة داخلية
          </button>
        </Can>
        <span className="ms-auto" />
        <Can permission="whatsapp:send_template">
          <button
            type="button"
            onClick={onOpenTemplate}
            className="shrink-0 flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full text-primary hover:bg-gold-soft min-h-[32px] touch-manipulation"
            aria-label="إرسال قالب معتمد"
            title="إرسال قالب معتمد"
          >
            <FileText size={11} />
            قالب
          </button>
        </Can>
      </div>
      <form
        onSubmit={submit}
        className="p-3 flex items-end gap-2"
        aria-label={mode === "reply" ? "نموذج الرد" : "نموذج الملاحظة الداخلية"}
      >
        {onSendMedia && mode === "reply" && (
          <AttachmentMenu onPick={pickFile} disabled={!!pendingFile} />
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            pendingFile
              ? "أضف تعليقًا (اختياري)…"
              : mode === "reply"
                ? "اكتب ردًا للعميل… (Enter للإرسال، Shift+Enter لسطر جديد)"
                : "ملاحظة داخلية للفريق — لن تصل للعميل."
          }
          rows={1}
          className={cn(
            "flex-1 min-w-0 border rounded-2xl px-3 py-2 text-base sm:text-sm resize-none focus:outline-none focus:ring-2 transition-colors",
            "leading-6 max-h-40",
            mode === "reply"
              ? "border-gray-200 focus:ring-primary/20 focus:border-primary"
              : "border-yellow-200 bg-yellow-50 focus:ring-yellow-300 focus:border-yellow-400",
          )}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e as unknown as React.FormEvent);
            }
          }}
          aria-label={mode === "reply" ? "نص الرد" : "ملاحظة داخلية"}
        />
        <button
          type="submit"
          disabled={sending || (!text.trim() && !pendingFile)}
          aria-label={
            pendingFile
              ? "إرسال المرفق"
              : mode === "reply"
                ? "إرسال الرد"
                : "حفظ الملاحظة"
          }
          className={cn(
            "tap-44 h-11 w-11 rounded-full disabled:opacity-50 flex items-center justify-center text-white shrink-0 shadow-sm",
            mode === "reply"
              ? "bg-primary hover:bg-primary-dark"
              : "bg-yellow-500 hover:bg-yellow-600 text-yellow-900",
          )}
        >
          {sending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : mode === "reply" ? (
            <Send size={18} />
          ) : (
            <StickyNote size={18} />
          )}
        </button>
      </form>
    </div>
  );
}

function AttachmentMenu({
  onPick,
  disabled,
}: {
  onPick: (kind: MediaKind) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="tap-44 h-11 w-11 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 flex items-center justify-center text-gray-600"
        aria-label="إرفاق ملف"
        aria-expanded={open}
      >
        <Paperclip size={18} />
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[40]"
            aria-hidden
          />
          <div className="absolute bottom-full mb-2 start-0 z-[41] bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[170px]">
            <AttachBtn
              label="صورة"
              icon={<ImageIcon size={16} />}
              onClick={() => {
                setOpen(false);
                onPick("image");
              }}
            />
            <AttachBtn
              label="فيديو"
              icon={<FileText size={16} />}
              onClick={() => {
                setOpen(false);
                onPick("video");
              }}
            />
            <AttachBtn
              label="مستند"
              icon={<FileText size={16} />}
              onClick={() => {
                setOpen(false);
                onPick("document");
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function AttachBtn({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gold-soft"
    >
      <span className="text-primary">{icon}</span>
      {label}
    </button>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
