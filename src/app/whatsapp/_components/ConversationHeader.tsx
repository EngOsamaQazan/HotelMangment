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
  MoreVertical,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

/**
 * Header above the active conversation. Responsive behaviour:
 *   • ≥ md  : AssignMenu + priority picker + status actions render inline.
 *   • < md  : They collapse into a single kebab (⋮) overflow menu with a
 *             bottom-sheet–style panel, so the header never wraps onto
 *             multiple rows on narrow phones.
 */
export function ConversationHeader({
  conversation,
  currentUserId,
  showDetails,
  setShowDetails,
  onChange,
}: Props) {
  const canManage = useHasPermission("whatsapp:manage_status");
  const [busy, setBusy] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!overflowRef.current?.contains(e.target as Node))
        setOverflowOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverflowOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [overflowOpen]);

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
      setOverflowOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(null);
    }
  }

  const prio = PRIORITY_LABELS[conversation.priority] ?? PRIORITY_LABELS.normal;
  const status = STATUS_LABELS[conversation.status] ?? STATUS_LABELS.open;

  return (
    <header className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-100 flex items-center gap-2 sm:gap-3">
      {/* Avatar + name block */}
      <div
        className={cn(
          "w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center shrink-0",
          conversation.contact?.isBlocked
            ? "bg-red-50 text-red-500"
            : "bg-primary/10 text-primary",
        )}
        aria-hidden
      >
        {initials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-gray-800 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{name}</span>
          {conversation.contact?.isBlocked && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded shrink-0">
              <AlertOctagon size={10} />
              <span className="hidden sm:inline">محظور</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] sm:text-[11px] flex-wrap">
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
            <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded truncate max-w-[10rem]">
              {conversation.assignedTo.name}
            </span>
          ) : (
            <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              غير مسندة
            </span>
          )}
        </div>
      </div>

      {/* ═════════════ Desktop action row (≥ md) ═════════════ */}
      <div className="hidden md:flex items-center gap-2 flex-wrap">
        <AssignMenu
          contactPhone={conversation.contactPhone}
          assignedToUserId={conversation.assignedToUserId}
          currentUserId={currentUserId}
          onChange={onChange}
        />

        {canManage && (
          <details className="relative group">
            <summary className="tap-44 list-none cursor-pointer flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
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
                    "w-full text-right text-xs px-2.5 py-2 rounded-lg hover:bg-gray-50",
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
            className="tap-44 flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
            className="tap-44 flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ArchiveX size={12} className="text-gray-500" />
            أرشفة
          </button>
        )}
        {canManage && conversation.status !== "open" && (
          <button
            onClick={() => call("status", `${basePath}/status`, { status: "open" })}
            disabled={busy === "status"}
            className="tap-44 flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ArchiveRestore size={12} className="text-gray-500" />
            إعادة فتح
          </button>
        )}

        <button
          onClick={() => setShowDetails(!showDetails)}
          className={cn(
            "tap-44 flex items-center gap-1.5 text-xs px-2.5 py-1.5 border rounded-lg hover:bg-gray-50",
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

      {/* ═════════════ Mobile compact actions (< md) ═════════════ */}
      <div className="md:hidden flex items-center gap-1 shrink-0" ref={overflowRef}>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={cn(
            "tap-44 flex items-center justify-center p-2 rounded-lg border",
            showDetails
              ? "border-primary text-primary bg-gold-soft"
              : "border-gray-200 text-gray-700 hover:bg-gray-50",
          )}
          aria-pressed={showDetails}
          aria-label="تفاصيل جهة الاتصال"
        >
          <Info size={16} />
        </button>
        <button
          onClick={() => setOverflowOpen((v) => !v)}
          className="tap-44 flex items-center justify-center p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          aria-label="المزيد من الإجراءات"
          aria-haspopup="menu"
          aria-expanded={overflowOpen}
        >
          <MoreVertical size={16} />
        </button>

        {overflowOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setOverflowOpen(false)}
              aria-hidden
            />
            <div
              role="menu"
              className="fixed inset-x-3 bottom-3 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] max-h-[70dvh] overflow-y-auto"
            >
              <div className="flex justify-center pt-1 pb-2">
                <span
                  aria-hidden
                  className="w-10 h-1.5 rounded-full bg-gray-200"
                />
              </div>
              <div className="px-2 pb-1 text-[11px] text-gray-500 font-medium">
                الإسناد
              </div>
              <AssignMenuCompact
                contactPhone={conversation.contactPhone}
                assignedToUserId={conversation.assignedToUserId}
                currentUserId={currentUserId}
                onChange={() => {
                  onChange();
                  setOverflowOpen(false);
                }}
              />

              {canManage && (
                <>
                  <div className="px-2 pt-3 pb-1 text-[11px] text-gray-500 font-medium">
                    الأولوية
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 px-1">
                    {(["low", "normal", "high", "urgent"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() =>
                          call("priority", `${basePath}/priority`, { priority: p })
                        }
                        disabled={busy === "priority"}
                        className={cn(
                          "tap-44 text-xs px-3 py-2 rounded-lg border",
                          conversation.priority === p
                            ? "bg-gold-soft border-primary text-primary"
                            : "border-gray-200 text-gray-700 hover:bg-gray-50",
                        )}
                      >
                        {PRIORITY_LABELS[p].label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {canManage && (
                <>
                  <div className="px-2 pt-3 pb-1 text-[11px] text-gray-500 font-medium">
                    الحالة
                  </div>
                  <div className="flex flex-col gap-1 px-1">
                    {conversation.status === "open" && (
                      <button
                        onClick={() =>
                          call("status", `${basePath}/status`, { status: "resolved" })
                        }
                        disabled={busy === "status"}
                        className="tap-44 flex items-center gap-2 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
                      >
                        <CheckCircle2 size={16} className="text-green-600" />
                        تعيين كمحلولة
                      </button>
                    )}
                    {conversation.status !== "archived" && (
                      <button
                        onClick={() =>
                          call("status", `${basePath}/status`, { status: "archived" })
                        }
                        disabled={busy === "status"}
                        className="tap-44 flex items-center gap-2 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
                      >
                        <ArchiveX size={16} className="text-gray-500" />
                        أرشفة
                      </button>
                    )}
                    {conversation.status !== "open" && (
                      <button
                        onClick={() =>
                          call("status", `${basePath}/status`, { status: "open" })
                        }
                        disabled={busy === "status"}
                        className="tap-44 flex items-center gap-2 text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
                      >
                        <ArchiveRestore size={16} className="text-gray-500" />
                        إعادة فتح
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}

/**
 * Compact assignment controls for the mobile overflow menu. Uses the same
 * endpoints as <AssignMenu/> but renders a flat list instead of a popover,
 * because we're already inside a bottom sheet.
 */
function AssignMenuCompact({
  contactPhone,
  assignedToUserId,
  currentUserId,
  onChange,
}: {
  contactPhone: string;
  assignedToUserId: number | null;
  currentUserId: number;
  onChange: () => void;
}) {
  const canAssign = useHasPermission("whatsapp:assign");
  const canSend = useHasPermission("whatsapp:send");
  const [busy, setBusy] = useState(false);
  const basePath = `/api/whatsapp/conversations/${encodeURIComponent(contactPhone)}`;
  const isMe = assignedToUserId === currentUserId;

  async function call(path: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      await readJsonSafe(res, "تعذّر تنفيذ العملية");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 px-1">
      {!assignedToUserId && canSend && (
        <button
          onClick={() => call(`${basePath}/claim`)}
          disabled={busy}
          className="tap-44 flex items-center gap-2 text-sm px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <CheckCircle2 size={16} className="text-green-600" />
          استلمها لي
        </button>
      )}
      {assignedToUserId && (isMe || canAssign) && (
        <button
          onClick={() => call(`${basePath}/unassign`)}
          disabled={busy}
          className="tap-44 flex items-center gap-2 text-sm px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <ArchiveX size={16} className="text-orange-500" />
          إلغاء الإسناد
        </button>
      )}
      {!canSend && !canAssign && (
        <div className="text-xs text-gray-400 px-3 py-2">
          لا تملك صلاحية الإسناد.
        </div>
      )}
    </div>
  );
}
