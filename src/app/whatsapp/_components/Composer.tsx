"use client";

import { useState } from "react";
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
 * (stored locally, visible to staff only). Tabs here keep everything in one
 * place instead of cluttering the thread header with a separate notes tab.
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    const promise = mode === "reply" ? onSend(value) : onSendNote(value);
    promise.then(() => setText(""));
  }

  if (disabled) {
    return (
      <div className="p-3 text-xs text-gray-500 text-center border-t border-gray-100 bg-gray-50">
        {disabledReason ?? "لا يمكنك الإرسال في هذه المحادثة."}
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100">
      <div className="flex items-center gap-2 px-3 pt-2">
        <button
          onClick={() => setMode("reply")}
          className={cn(
            "flex items-center gap-1.5 text-xs px-3 py-1 rounded-full transition-colors",
            mode === "reply"
              ? "bg-primary text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200",
          )}
        >
          <Send size={11} />
          رد على العميل
        </button>
        <Can permission="whatsapp:notes">
          <button
            onClick={() => setMode("note")}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1 rounded-full transition-colors",
              mode === "note"
                ? "bg-yellow-400 text-yellow-900"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
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
            className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full text-primary hover:bg-gold-soft"
            title="إرسال قالب معتمد"
          >
            <FileText size={11} />
            قالب
          </button>
        </Can>
      </div>
      <form onSubmit={submit} className="p-3 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === "reply"
              ? "اكتب ردًا للعميل… (Enter للإرسال، Shift+Enter لسطر جديد)"
              : "ملاحظة داخلية للفريق — لن تصل للعميل."
          }
          rows={2}
          className={cn(
            "flex-1 border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 transition-colors",
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
          className={cn(
            "h-[40px] px-3 rounded-lg disabled:opacity-50 flex items-center gap-1 text-sm text-white",
            mode === "reply"
              ? "bg-primary hover:bg-primary-dark"
              : "bg-yellow-500 hover:bg-yellow-600 text-yellow-900",
          )}
        >
          {sending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : mode === "reply" ? (
            <Send size={16} />
          ) : (
            <StickyNote size={16} />
          )}
        </button>
      </form>
    </div>
  );
}
