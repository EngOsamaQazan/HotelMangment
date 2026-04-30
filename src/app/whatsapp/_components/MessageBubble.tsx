"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock,
  StickyNote,
  FileText,
  Download,
  Mic,
  MoreVertical,
  Pencil,
  Trash2,
  Video as VideoIcon,
  X,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Message } from "../_types";
import { humanizeWaError, isReengagementError, readJsonSafe } from "../_utils";

interface Props {
  m: Message;
  /** Current logged-in user id — used to gate edit/delete on ownership. */
  currentUserId?: number;
  /** True when the user has `whatsapp:edit_message`. */
  canEdit?: boolean;
  /** True when the user has `whatsapp:delete_message`. */
  canDelete?: boolean;
  /** True when the user has `whatsapp:assign` (manager override). */
  canManage?: boolean;
  /** Called after a successful edit/delete so the parent can refetch. */
  onMutated?: () => void;
}

export function MessageBubble({
  m,
  currentUserId,
  canEdit,
  canDelete,
  canManage,
  onMutated,
}: Props) {
  const [lightbox, setLightbox] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ─── Soft-deleted placeholder ─────────────────────────────────────────
  if (m.deletedAt) {
    const outboundDeleted = m.direction === "outbound";
    return (
      <div className={cn("flex", outboundDeleted ? "justify-start" : "justify-end")}>
        <div
          className={cn(
            "max-w-[80%] rounded-2xl text-sm shadow-sm overflow-hidden",
            "bg-gray-100 text-gray-500 italic border border-dashed border-gray-300",
          )}
        >
          <div className="px-3 py-2 flex items-center gap-2">
            <Ban size={14} className="shrink-0" />
            <span>حُذِفت هذه الرسالة من صندوق الفريق</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-1 px-3 pb-2 not-italic">
            {new Date(m.createdAt).toLocaleTimeString("ar", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── Internal note ────────────────────────────────────────────────────
  if (m.isInternalNote) {
    const ownsNote =
      m.sentByUserId != null && currentUserId === m.sentByUserId;
    const showMenu = !!(canEdit || canDelete) && (ownsNote || canManage);
    return (
      <div className="flex justify-center">
        <div className="group relative max-w-[85%] bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-xl px-3 py-2 text-sm shadow-sm flex items-start gap-2">
          <StickyNote size={14} className="shrink-0 mt-0.5" />
          <div className="space-y-0.5 flex-1 min-w-0">
            <div className="text-[10px] text-yellow-700 font-medium">
              ملاحظة داخلية — {m.contactName ?? ""}
              {m.editedAt && (
                <span className="ms-1 text-yellow-600/70">(عُدِّلَت)</span>
              )}
            </div>
            {editing ? (
              <NoteEditor
                value={draft}
                setValue={setDraft}
                busy={busy}
                onCancel={() => {
                  setEditing(false);
                  setDraft(m.body ?? "");
                }}
                onSave={async () => {
                  if (busy) return;
                  const text = draft.trim();
                  if (!text || text === m.body) {
                    setEditing(false);
                    return;
                  }
                  setBusy(true);
                  try {
                    const res = await fetch(`/api/whatsapp/messages/${m.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ body: text }),
                    });
                    await readJsonSafe(res, "فشل التعديل");
                    toast.success("تم تعديل الملاحظة");
                    setEditing(false);
                    onMutated?.();
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "فشل التعديل",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : (
              <div className="whitespace-pre-wrap break-words">{m.body ?? ""}</div>
            )}
            <div className="text-[10px] text-yellow-700/70">
              {new Date(m.createdAt).toLocaleTimeString("ar", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          {showMenu && !editing && (
            <BubbleMenu
              canEdit={!!canEdit && (ownsNote || !!canManage)}
              canDelete={!!canDelete}
              busy={busy}
              onEdit={() => {
                setDraft(m.body ?? "");
                setEditing(true);
              }}
              onDelete={() => setConfirmDelete(true)}
            />
          )}
        </div>
        {confirmDelete && (
          <DeleteConfirm
            kind="note"
            busy={busy}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              setBusy(true);
              try {
                const res = await fetch(`/api/whatsapp/messages/${m.id}`, {
                  method: "DELETE",
                });
                await readJsonSafe(res, "فشل الحذف");
                toast.success("تم حذف الملاحظة");
                setConfirmDelete(false);
                onMutated?.();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "فشل الحذف");
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </div>
    );
  }

  // ─── Regular inbound / outbound message ───────────────────────────────
  const outbound = m.direction === "outbound";
  const hasMediaId = !!m.mediaId;
  const mediaUrl = hasMediaId
    ? `/api/whatsapp/media/${encodeURIComponent(m.mediaId!)}?message=${m.id}`
    : null;
  const isImageish = m.type === "image" || m.type === "sticker";
  const isVideo = m.type === "video";
  const isAudio = m.type === "audio";
  const isDocument = m.type === "document";
  const isUploadingOutbound =
    outbound &&
    (m.status === "queued" || m.status === "sending") &&
    !hasMediaId &&
    (isImageish || isVideo || isDocument || isAudio);

  // Edit is intentionally NOT exposed for sent/received messages: WhatsApp
  // Cloud API does not propagate edits to the customer's device, so any
  // change would silently desync the staff inbox from the customer's view.
  // Only deletion (local-only, with a clear warning) is offered.
  const ownsMessage =
    m.sentByUserId != null && currentUserId === m.sentByUserId;
  const showDeleteMenu =
    !!canDelete && (m.direction === "inbound" || ownsMessage || !!canManage);

  return (
    <>
      <div className={cn("flex", outbound ? "justify-start" : "justify-end")}>
        <div
          className={cn(
            "group relative max-w-[80%] rounded-2xl text-sm shadow-sm overflow-hidden",
            outbound
              ? "bg-green-100 text-gray-800 rounded-bl-sm"
              : "bg-white text-gray-800 rounded-br-sm border border-gray-100",
            m.status === "failed" && "bg-red-50 border border-red-200",
          )}
        >
          {showDeleteMenu && (
            <BubbleMenu
              canEdit={false}
              canDelete
              busy={busy}
              align={outbound ? "end" : "start"}
              variant="ghost"
              onDelete={() => setConfirmDelete(true)}
            />
          )}

          {m.type === "template" && (
            <div className="text-[11px] font-medium text-gray-500 px-3 pt-2 pb-0">
              📋 قالب: {m.templateName}
            </div>
          )}

          {isImageish && mediaUrl ? (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="block w-full"
              aria-label="فتح الصورة بحجم كامل"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl}
                alt={m.body ?? "صورة"}
                className={cn(
                  "block w-full max-w-[280px] max-h-[280px] object-cover bg-black/5",
                  m.type === "sticker" && "max-w-[160px] max-h-[160px] object-contain bg-transparent",
                )}
                loading="lazy"
              />
            </button>
          ) : isImageish && isUploadingOutbound ? (
            <UploadingPreview label="جاري رفع الصورة…" />
          ) : null}

          {isVideo && mediaUrl ? (
            <video
              src={mediaUrl}
              controls
              playsInline
              preload="metadata"
              className="block w-full max-w-[320px] max-h-[320px] bg-black"
            />
          ) : isVideo && isUploadingOutbound ? (
            <UploadingPreview label="جاري رفع الفيديو…" icon={<VideoIcon size={18} />} />
          ) : null}

          {isAudio && mediaUrl ? (
            <div className="px-3 py-2 flex items-center gap-2">
              <Mic size={16} className="text-gray-500 shrink-0" />
              <audio src={mediaUrl} controls preload="metadata" className="max-w-[220px]" />
            </div>
          ) : null}

          {isDocument && mediaUrl ? (
            <a
              href={`${mediaUrl}&download=${encodeURIComponent(m.mediaFilename ?? "document")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 hover:bg-black/5 transition-colors border-b border-black/5"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {m.mediaFilename ?? "ملف"}
                </div>
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                  {m.mediaMimeType ?? "document"}
                  {m.mediaSize ? <span>· {formatBytes(m.mediaSize)}</span> : null}
                </div>
              </div>
              <Download size={16} className="text-gray-400 shrink-0" />
            </a>
          ) : isDocument && isUploadingOutbound ? (
            <UploadingPreview label="جاري رفع المستند…" icon={<FileText size={18} />} />
          ) : null}

          {m.body ? (
            <div className="whitespace-pre-wrap break-words px-3 py-2">{m.body}</div>
          ) : !isImageish && !isVideo && !isAudio && !isDocument && m.type !== "template" ? (
            <div className="px-3 py-2 text-gray-400 italic text-xs">
              (رسالة بدون نص — نوع: {m.type})
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-1 justify-end px-3 pb-2">
            <span>
              {new Date(m.createdAt).toLocaleTimeString("ar", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {outbound && <StatusIcon status={m.status} />}
          </div>

          {m.status === "failed" && (
            <div className="text-[11px] text-red-600 px-3 pb-2 flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <AlertTriangle size={12} />
                <span>{humanizeWaError(m.errorCode, m.errorMessage)}</span>
              </div>
              {isReengagementError(m.errorCode, m.errorMessage) && (
                <span className="text-[10px] text-red-500/80 pr-4">
                  💡 استخدم زر «📋 إرسال قالب» أعلاه.
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {lightbox && mediaUrl && isImageish && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute top-3 end-3 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
          <a
            href={`${mediaUrl}&download=${encodeURIComponent(m.mediaFilename ?? "image.jpg")}`}
            onClick={(e) => e.stopPropagation()}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-3 end-16 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="تنزيل"
          >
            <Download size={18} />
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt={m.body ?? "image"}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

      {confirmDelete && (
        <DeleteConfirm
          kind={
            m.direction === "outbound" && !m.isInternalNote
              ? "outbound"
              : "inbound"
          }
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              const res = await fetch(`/api/whatsapp/messages/${m.id}`, {
                method: "DELETE",
              });
              await readJsonSafe(res, "فشل الحذف");
              toast.success("تم إخفاء الرسالة من صندوق الفريق");
              setConfirmDelete(false);
              onMutated?.();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "فشل الحذف");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

// ─────────────────────── Sub-components ───────────────────────

function BubbleMenu({
  canEdit,
  canDelete,
  busy,
  align = "end",
  variant = "solid",
  onEdit,
  onDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  busy: boolean;
  align?: "start" | "end";
  variant?: "solid" | "ghost";
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!canEdit && !canDelete) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-1 z-[5]",
        align === "end" ? "end-1" : "start-1",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={busy}
        aria-label="خيارات الرسالة"
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center transition-opacity",
          variant === "solid"
            ? "bg-white/70 hover:bg-white text-gray-600 shadow-sm"
            : "bg-black/0 hover:bg-black/5 text-gray-500 opacity-0 group-hover:opacity-100 focus:opacity-100",
        )}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          className={cn(
            "absolute mt-1 z-[6] bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[160px]",
            align === "end" ? "end-0" : "start-0",
          )}
          role="menu"
        >
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gold-soft text-start"
            >
              <Pencil size={14} className="text-primary" />
              تعديل
            </button>
          )}
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-start"
            >
              <Trash2 size={14} />
              حذف
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NoteEditor({
  value,
  setValue,
  busy,
  onCancel,
  onSave,
}: {
  value: string;
  setValue: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={Math.min(6, Math.max(2, value.split("\n").length + 1))}
        autoFocus
        disabled={busy}
        className="w-full text-sm bg-white border border-yellow-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-300"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded-md text-gray-600 hover:bg-yellow-100"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !value.trim()}
          className="text-[11px] px-3 py-1 rounded-md bg-yellow-500 text-yellow-900 font-medium disabled:opacity-50"
        >
          {busy ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}

function DeleteConfirm({
  kind,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: "note" | "outbound" | "inbound";
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title =
    kind === "note"
      ? "حذف الملاحظة الداخلية؟"
      : kind === "outbound"
        ? "إخفاء الرسالة من الصندوق؟"
        : "إخفاء رسالة العميل من الصندوق؟";

  const desc =
    kind === "note"
      ? "لن تظهر الملاحظة بعد ذلك لأي عضو في الفريق."
      : kind === "outbound"
        ? "تنبيه: WhatsApp لا يدعم استرجاع الرسائل من جهاز العميل. ستختفي الرسالة من شاشة الفريق فقط، ويبقى العميل قادراً على رؤيتها في تطبيقه."
        : "ستختفي الرسالة من صندوق الفريق فقط — العميل لن يلاحظ أي تغيير.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[140] bg-black/40 flex items-center justify-center p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-3"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
            <Trash2 size={18} />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
            <p className="text-xs text-gray-600 leading-5">{desc}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 h-9 rounded-full text-sm text-gray-600 hover:bg-gray-100"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 h-9 rounded-full text-sm bg-red-500 text-white font-medium disabled:opacity-50 hover:bg-red-600"
          >
            {busy ? "جارٍ الحذف…" : "تأكيد الحذف"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadingPreview({
  label,
  icon,
}: {
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="w-[240px] h-40 bg-black/5 animate-pulse flex flex-col items-center justify-center gap-1 text-xs text-gray-500">
      {icon ?? null}
      <span>{label}</span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "read":
      return <CheckCheck size={12} className="text-blue-500" aria-label="مقروءة" />;
    case "delivered":
      return <CheckCheck size={12} aria-label="وصلت" />;
    case "sent":
      return <Check size={12} aria-label="أُرسلت" />;
    case "queued":
      return <Clock size={12} aria-label="في الطابور" />;
    default:
      return null;
  }
}
