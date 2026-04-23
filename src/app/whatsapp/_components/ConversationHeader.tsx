"use client";

import {
  AlertOctagon,
  ArchiveRestore,
  ArchiveX,
  CheckCircle2,
  ChevronDown,
  Flag,
  Info,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHasPermission } from "@/lib/permissions/client";
import type { ConversationSummary } from "../_types";
import { conversationDisplayName, initials, readJsonSafe } from "../_utils";
import { AssignMenu } from "./AssignMenu";

interface Props {
  conversation: ConversationSummary;
  currentUserId: number;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  onChange: () => void;
}

const PRIORITY_LABELS: Record<string, { label: string; className: string }> = {
  urgent: { label: "عاجل", className: "bg-red-100 text-red-700 border-red-200" },
  high: { label: "مرتفعة", className: "bg-orange-100 text-orange-700 border-orange-200" },
  normal: { label: "عادية", className: "bg-gray-100 text-gray-600 border-gray-200" },
  low: { label: "منخفضة", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: "مفتوحة", className: "bg-green-100 text-green-700" },
  resolved: { label: "محلولة", className: "bg-blue-100 text-blue-700" },
  archived: { label: "مؤرشفة", className: "bg-gray-100 text-gray-600" },
};

export function ConversationHeader({
  conversation,
  currentUserId,
  showDetails,
  setShowDetails,
  onChange,
}: Props) {
  const canManage = useHasPermission("whatsapp:manage_status");
  const [busy, setBusy] = useState<string | null>(null);
  const name = conversationDisplayName(conversation);
  const basePath = `/api/whatsapp/conversations/${encodeURIComponent(conversation.contactPhone)}`;

  async function call(what: string, path: string, body: unknown) {
    setBusy(what);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await readJsonSafe(res, "تعذّر تنفيذ العملية");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(null);
    }
  }

  const prio = PRIORITY_LABELS[conversation.priority] ?? PRIORITY_LABELS.normal;
  const status = STATUS_LABELS[conversation.status] ?? STATUS_LABELS.open;

  return (
    <header className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
      <div
        className={cn(
          "w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center shrink-0",
          conversation.contact?.isBlocked
            ? "bg-red-50 text-red-500"
            : "bg-primary/10 text-primary",
        )}
      >
        {initials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-gray-800 flex items-center gap-2">
          <span className="truncate">{name}</span>
          {conversation.contact?.isBlocked && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
              <AlertOctagon size={10} />
              محظور
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px]">
          <span className="text-gray-500 direction-ltr">
            +{conversation.contactPhone}
          </span>
          <span className={cn("px-1.5 py-0.5 rounded", status.className)}>
            {status.label}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border",
              prio.className,
            )}
          >
            <Flag size={9} />
            {prio.label}
          </span>
          {conversation.assignedTo ? (
            <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
              مُسنَدة إلى {conversation.assignedTo.name}
            </span>
          ) : (
            <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              غير مسندة
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <AssignMenu
          contactPhone={conversation.contactPhone}
          assignedToUserId={conversation.assignedToUserId}
          currentUserId={currentUserId}
          onChange={onChange}
        />

        {canManage && (
          <details className="relative group">
            <summary className="list-none cursor-pointer flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
              <Flag size={12} />
              الأولوية
              <ChevronDown size={10} />
            </summary>
            <div className="absolute end-0 mt-1 z-40 bg-white rounded-xl border border-gray-100 shadow-lg p-1 w-40">
              {(["low", "normal", "high", "urgent"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => call("priority", `${basePath}/priority`, { priority: p })}
                  disabled={busy === "priority"}
                  className={cn(
                    "w-full text-right text-xs px-2.5 py-1.5 rounded-lg hover:bg-gray-50",
                    conversation.priority === p && "bg-gray-50 font-medium",
                  )}
                >
                  {PRIORITY_LABELS[p].label}
                </button>
              ))}
            </div>
          </details>
        )}

        {canManage && conversation.status === "open" && (
          <button
            onClick={() => call("status", `${basePath}/status`, { status: "resolved" })}
            disabled={busy === "status"}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "status" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCircle2 size={12} className="text-green-600" />
            )}
            تعيين كمحلولة
          </button>
        )}
        {canManage && conversation.status !== "archived" && (
          <button
            onClick={() => call("status", `${basePath}/status`, { status: "archived" })}
            disabled={busy === "status"}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ArchiveX size={12} className="text-gray-500" />
            أرشفة
          </button>
        )}
        {canManage && conversation.status !== "open" && (
          <button
            onClick={() => call("status", `${basePath}/status`, { status: "open" })}
            disabled={busy === "status"}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ArchiveRestore size={12} className="text-gray-500" />
            إعادة فتح
          </button>
        )}

        <button
          onClick={() => setShowDetails(!showDetails)}
          className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1.5 border rounded-lg hover:bg-gray-50",
            showDetails
              ? "border-primary text-primary bg-gold-soft"
              : "border-gray-200 text-gray-700",
          )}
          aria-pressed={showDetails}
        >
          <Info size={12} />
          التفاصيل
        </button>
      </div>
    </header>
  );
}
