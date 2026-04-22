"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/Can";
import { cn } from "@/lib/utils";

interface Props {
  /** Raw phone as stored in DB (may be local or international). */
  phone: string | null | undefined;
  /** Optional reservation ID to tag the outbound row with. */
  reservationId?: number | null;
  /** Optional initial text to prefill the composer. */
  defaultText?: string;
  /** Visual variant: compact icon button (default) or pill with label. */
  variant?: "icon" | "pill";
  /** Extra className for the trigger button. */
  className?: string;
}

/**
 * Small reusable "send on WhatsApp" button. Opens a popover with a composer,
 * posts to `/api/whatsapp/send`, and gracefully falls back to a wa.me link
 * for users without `whatsapp:send` permission.
 */
export function WhatsAppQuickSendButton({
  phone,
  reservationId,
  defaultText = "",
  variant = "icon",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(defaultText);
  const [sending, setSending] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const hasPhone = !!(phone && phone.trim());

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function send() {
    if (!phone || !text.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: phone,
          text: text.trim(),
          reservationId: reservationId ?? null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "فشل الإرسال");
      toast.success("تم إرسال الرسالة");
      setOpen(false);
      setText(defaultText);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الإرسال");
    } finally {
      setSending(false);
    }
  }

  if (!hasPhone) return null;

  return (
    <Can
      permission="whatsapp:send"
      fallback={
        // No API permission → fall back to wa.me so reception can still use
        // the phone number easily.
        <a
          href={`https://wa.me/${(phone ?? "").replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-1 text-green-600 hover:text-green-700",
            className,
          )}
          title="فتح واتساب"
        >
          <MessageCircle size={variant === "pill" ? 16 : 14} />
          {variant === "pill" && <span className="text-xs">واتساب</span>}
        </a>
      }
    >
      <div className="relative inline-block" ref={popRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            variant === "pill"
              ? "inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
              : "inline-flex items-center justify-center w-7 h-7 rounded-full text-green-600 hover:bg-green-50",
            className,
          )}
          title="إرسال رسالة واتساب"
        >
          <MessageCircle size={variant === "pill" ? 14 : 16} />
          {variant === "pill" && <span>واتساب</span>}
        </button>

        {open && (
          <div
            className="absolute z-40 top-full mt-2 end-0 w-80 bg-white rounded-xl shadow-lg border border-gray-100 p-3 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                <MessageCircle size={14} className="text-green-600" />
                رسالة واتساب
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            </div>
            <div className="text-[11px] text-gray-500 direction-ltr text-right">
              إلى: {phone}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="نص الرسالة…"
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || !text.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Send size={12} />
                )}
                إرسال
              </button>
            </div>
            <p className="text-[10px] text-amber-600 leading-relaxed">
              خارج نافذة 24 ساعة من آخر رسالة من العميل، قد يرفض Meta الرسائل
              الحرّة؛ استخدم قالبًا معتمدًا.
            </p>
          </div>
        )}
      </div>
    </Can>
  );
}
