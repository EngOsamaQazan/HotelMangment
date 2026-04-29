"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Paperclip,
  X,
  Loader2,
  FileText,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions/client";

export interface JournalAttachmentDTO {
  id: number;
  fileName: string;
  mimeType: string;
  size: number;
  caption: string | null;
  createdAt: string | Date;
}

/**
 * Reusable attachments panel for a posted Journal Entry.
 *
 * - When `entryId` is null/undefined, the component is in "deferred" mode:
 *   it only collects files locally via `onPendingFilesChange`. The parent
 *   uploads them after creating the JE.
 * - When `entryId` is a number, the component is in "live" mode: it lists
 *   existing attachments, supports add/remove against the API directly.
 */
interface Props {
  entryId?: number | null;
  /** Initial server-side list (for live mode). Optional. */
  initial?: JournalAttachmentDTO[];
  /** Called whenever the local pending file queue changes (deferred mode). */
  onPendingFilesChange?: (files: File[]) => void;
  /** Show an inline form vs. a compact widget. Default: true. */
  showHeader?: boolean;
  className?: string;
}

const ACCEPT =
  "image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
const MAX_BYTES = 20 * 1024 * 1024; // align with src/lib/uploads.ts MAX_UPLOAD_BYTES

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function JournalAttachments({
  entryId,
  initial,
  onPendingFilesChange,
  showHeader = true,
  className,
}: Props) {
  const live = entryId != null;
  const { can } = usePermissions();
  const canUpload = can("accounting.journal:upload_attachment");
  const canRemove = can("accounting.journal:remove_attachment");

  const [items, setItems] = useState<JournalAttachmentDTO[]>(initial ?? []);
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!live) return;
    try {
      const res = await fetch(
        `/api/accounting/journal/${entryId}/attachments`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("فشل تحميل المرفقات");
      const j = await res.json();
      setItems(j.attachments as JournalAttachmentDTO[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    }
  }, [live, entryId]);

  useEffect(() => {
    if (live && initial === undefined) refresh();
  }, [live, initial, refresh]);

  function notifyPending(next: File[]) {
    setPending(next);
    onPendingFilesChange?.(next);
  }

  function handleSelect(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list);
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > MAX_BYTES) {
        setError(`«${f.name}» يتجاوز 20MB`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;
    setError(null);

    if (live) {
      void uploadFiles(valid);
    } else {
      notifyPending([...pending, ...valid]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadFiles(files: File[]) {
    if (!live || !entryId) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch(
        `/api/accounting/journal/${entryId}/attachments`,
        { method: "POST", body: fd }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل الرفع");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(att: JournalAttachmentDTO) {
    if (!live || !entryId) return;
    if (!confirm(`حذف المرفق «${att.fileName}»؟`)) return;
    try {
      const res = await fetch(
        `/api/accounting/journal/${entryId}/attachments/${att.id}`,
        { method: "DELETE" }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل الحذف");
      setItems((prev) => prev.filter((x) => x.id !== att.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    }
  }

  function removePending(idx: number) {
    notifyPending(pending.filter((_, i) => i !== idx));
  }

  return (
    <div className={cn("space-y-3", className)}>
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <Paperclip size={16} className="text-primary" />
            <span>الفواتير والمستندات</span>
            {(items.length > 0 || pending.length > 0) && (
              <span className="text-xs text-gray-400">
                ({items.length + pending.length})
              </span>
            )}
          </div>
          {canUpload && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-primary/40 text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              إرفاق ملفات
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        onChange={(e) => handleSelect(e.target.files)}
        className="hidden"
      />

      {(items.length === 0 && pending.length === 0) && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !canUpload}
          className={cn(
            "w-full border-2 border-dashed border-gray-200 rounded-lg p-6 text-center transition-colors",
            canUpload
              ? "hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
              : "cursor-not-allowed opacity-60"
          )}
        >
          <Upload size={28} className="text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            {canUpload
              ? "اضغط لإرفاق فاتورة أو إيصال"
              : "لا توجد مرفقات"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            صور (JPG/PNG) أو PDF أو Excel — حد 20MB لكل ملف
          </p>
        </button>
      )}

      {(items.length > 0 || pending.length > 0) && (
        <ul className="space-y-2">
          {items.map((att) => (
            <li
              key={`saved-${att.id}`}
              className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-lg bg-white"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                {isImage(att.mimeType) ? (
                  <ImageIcon size={18} className="text-blue-500" />
                ) : (
                  <FileText size={18} className="text-red-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={`/api/files/journal/${att.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-gray-800 hover:text-primary truncate block"
                >
                  {att.fileName}
                </a>
                <p className="text-xs text-gray-400">
                  {formatBytes(att.size)}
                  {att.caption && (
                    <span className="text-gray-500"> · {att.caption}</span>
                  )}
                </p>
              </div>
              <a
                href={`/api/files/journal/${att.id}`}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors shrink-0"
                title="فتح/تنزيل"
              >
                <ExternalLink size={14} />
              </a>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => handleRemove(att)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors shrink-0"
                  title="حذف"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
          {pending.map((f, i) => (
            <li
              key={`pending-${i}-${f.name}`}
              className="flex items-center gap-3 p-2.5 border border-amber-200 rounded-lg bg-amber-50/40"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                {f.type.startsWith("image/") ? (
                  <ImageIcon size={18} className="text-amber-700" />
                ) : (
                  <FileText size={18} className="text-amber-700" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {f.name}
                </p>
                <p className="text-xs text-amber-700">
                  {formatBytes(f.size)} · معلّق — سيُرفع عند الحفظ
                </p>
              </div>
              <button
                type="button"
                onClick={() => removePending(i)}
                className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-700 transition-colors shrink-0"
                title="إزالة من القائمة"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
