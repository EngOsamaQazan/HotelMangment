"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Send, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Can } from "@/components/Can";

interface Props {
  onSend: (text: string) => Promise<void>;
  onSendNote: (text: string) => Promise<void>;
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
  onOpenTemplate,
  disabled,
  disabledReason,
  sending,
}: Props) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: reset to measure new scrollHeight then clamp at ~6 rows.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 24 * 6 + 16; // roughly 6 rows of 24px line-height + padding
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [text]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    const promise = mode === "reply" ? onSend(value) : onSendNote(value);
    promise.then(() => setText(""));
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
            className={cn(
              "shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors",
              "min-h-[32px] touch-manipulation",
              mode === "note"
                ? "bg-yellow-400 text-yellow-900"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
            aria-pressed={mode === "note"}
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
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === "reply"
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
          disabled={sending || !text.trim()}
          aria-label={mode === "reply" ? "إرسال الرد" : "حفظ الملاحظة"}
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
