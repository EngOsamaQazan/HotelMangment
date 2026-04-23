"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, UserPlus, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHasPermission } from "@/lib/permissions/client";
import { useIsMobile } from "../_hooks/useMediaQuery";
import { readJsonSafe } from "../_utils";

interface ChatUser {
  id: number;
  name: string;
  email: string | null;
}

interface Props {
  contactPhone: string;
  assignedToUserId: number | null;
  currentUserId: number;
  onChange: () => void;
}

/**
 * Compact assign/claim dropdown shown in the conversation header.
 *
 *   • Anyone with `whatsapp:send` can CLAIM an unassigned thread.
 *   • Managers with `whatsapp:assign` get the full "assign to…" picker and
 *     can also override/steal a thread from another user.
 *   • Current assignee can release themselves (unassign).
 */
export function AssignMenu({
  contactPhone,
  assignedToUserId,
  currentUserId,
  onChange,
}: Props) {
  const canAssign = useHasPermission("whatsapp:assign");
  const canSend = useHasPermission("whatsapp:send");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || isMobile) return; // bottom-sheet dismisses via backdrop tap
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open || !canAssign) return;
    const ctrl = new AbortController();
    (async () => {
      setLoadingUsers(true);
      try {
        const res = await fetch(
          `/api/chat/users?q=${encodeURIComponent(search)}&limit=50`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        const data = (await res.json()) as ChatUser[];
        setUsers(data);
      } finally {
        setLoadingUsers(false);
      }
    })();
    return () => ctrl.abort();
  }, [open, search, canAssign]);

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
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(false);
    }
  }

  const basePath = `/api/whatsapp/conversations/${encodeURIComponent(contactPhone)}`;
  const isAssigneeMe = assignedToUserId === currentUserId;

  const panel = (
    <>
      {isMobile && (
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span
            aria-hidden
            className="w-10 h-1.5 rounded-full bg-gray-200 mx-auto"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="tap-44 absolute end-2 top-2 p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="إغلاق"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="p-2 space-y-1.5">
        {!assignedToUserId && canSend && (
          <button
            onClick={() => call(`${basePath}/claim`)}
            className="tap-44 w-full text-right text-sm px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Check size={16} className="text-green-600" />
            استلمها لي
          </button>
        )}
        {assignedToUserId && (isAssigneeMe || canAssign) && (
          <button
            onClick={() => call(`${basePath}/unassign`)}
            className="tap-44 w-full text-right text-sm px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <UserX size={16} className="text-orange-500" />
            إلغاء الإسناد
          </button>
        )}
      </div>

      {canAssign && (
        <>
          <div className="border-t border-gray-100" />
          <div className="p-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن موظف…"
              className="w-full text-base sm:text-sm bg-gray-50 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div
            className={cn(
              "overflow-y-auto scrollbar-thin",
              isMobile ? "max-h-[50dvh]" : "max-h-56",
            )}
          >
            {loadingUsers && (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="animate-spin text-primary" />
              </div>
            )}
            {!loadingUsers && users.length === 0 && (
              <div className="text-center text-xs text-gray-400 py-4">
                لا توجد نتائج
              </div>
            )}
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => call(`${basePath}/assign`, { userId: u.id })}
                className="tap-44 w-full text-right px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                  {(u.name ?? "?").slice(0, 2)}
                </span>
                <span className="flex-1 min-w-0">
                  <div className="truncate">{u.name}</div>
                  {u.email && (
                    <div className="text-[10px] text-gray-400 truncate">
                      {u.email}
                    </div>
                  )}
                </span>
                {u.id === assignedToUserId && (
                  <Check size={12} className="text-green-500" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="tap-44 flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <UserPlus size={12} />
        )}
        <span>إسناد المحادثة</span>
      </button>

      {open && !isMobile && (
        <div
          role="menu"
          className="absolute end-0 mt-2 w-64 max-w-[calc(100vw-1rem)] bg-white rounded-xl shadow-xl border border-gray-100 z-40 overflow-hidden"
        >
          {panel}
        </div>
      )}

      {open && isMobile && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            aria-modal="true"
            className="fixed inset-x-3 bottom-3 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[80dvh] overflow-hidden pb-[env(safe-area-inset-bottom)]"
          >
            {panel}
          </div>
        </>
      )}
    </div>
  );
}
