"use client";

import { AlertTriangle, Check, CheckCheck, Clock, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "../_types";
import { humanizeWaError, isReengagementError } from "../_utils";

interface Props {
  m: Message;
}

export function MessageBubble({ m }: Props) {
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
  return (
    <div className={cn("flex", outbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          outbound
            ? "bg-green-100 text-gray-800 rounded-bl-sm"
            : "bg-white text-gray-800 rounded-br-sm border border-gray-100",
          m.status === "failed" && "bg-red-50 border border-red-200",
        )}
      >
        {m.type === "template" && (
          <div className="text-[11px] font-medium text-gray-500 mb-1">
            📋 قالب: {m.templateName}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{m.body ?? ""}</div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-1 justify-end">
          <span>
            {new Date(m.createdAt).toLocaleTimeString("ar", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {outbound && <StatusIcon status={m.status} />}
        </div>
        {m.status === "failed" && (
          <div className="text-[11px] text-red-600 mt-1 flex flex-col gap-0.5">
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
  );
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
