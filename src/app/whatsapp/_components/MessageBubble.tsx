"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock,
  StickyNote,
  FileText,
  Download,
  Mic,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "../_types";
import { humanizeWaError, isReengagementError } from "../_utils";

interface Props {
  m: Message;
}

export function MessageBubble({ m }: Props) {
  const [lightbox, setLightbox] = useState(false);

  if (m.isInternalNote) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-xl px-3 py-2 text-sm shadow-sm flex items-start gap-2">
          <StickyNote size={14} className="shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="text-[10px] text-yellow-700 font-medium">
              ملاحظة داخلية — {m.contactName ?? ""}
            </div>
            <div className="whitespace-pre-wrap break-words">{m.body ?? ""}</div>
            <div className="text-[10px] text-yellow-700/70">
              {new Date(m.createdAt).toLocaleTimeString("ar", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
    outbound && (m.status === "queued" || m.status === "sending") && !hasMediaId && (isImageish || isVideo || isDocument || isAudio);

  return (
    <>
      <div className={cn("flex", outbound ? "justify-start" : "justify-end")}>
        <div
          className={cn(
            "max-w-[80%] rounded-2xl text-sm shadow-sm overflow-hidden",
            outbound
              ? "bg-green-100 text-gray-800 rounded-bl-sm"
              : "bg-white text-gray-800 rounded-br-sm border border-gray-100",
            m.status === "failed" && "bg-red-50 border border-red-200",
          )}
        >
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
    </>
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
