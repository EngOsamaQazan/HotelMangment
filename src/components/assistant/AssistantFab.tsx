"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, X, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Can } from "@/components/Can";
import { AssistantQuickPanel } from "./AssistantQuickPanel";

/**
 * Floating Action Button mounted globally inside AppShell.
 *
 * Behavior:
 *   • Hidden on the `/assistant` route (we already render the full page there).
 *   • Wrapped in <Can permission="assistant:use"> so it disappears for users
 *     who don't have the assistant; the same permission gates the underlying
 *     API endpoints, so nothing leaks to unauthorized roles even if they
 *     hand-craft requests.
 *   • Persists the active conversation id in localStorage so navigation
 *     between pages keeps the same chat. Clearing the storage starts fresh.
 *   • The popover opens at bottom-right on desktop, sits above the sidebar
 *     z-index, and goes near-fullscreen on mobile (with safe-bottom padding).
 */

const STORAGE_KEY = "assistant:fab:conversationId";

export function AssistantFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load the cached conversation id once, but only after the user opens the
  // FAB the first time (to avoid an extra fetch for users who never click it).
  useEffect(() => {
    if (!open || conversationId !== null) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = Number(raw);
        if (Number.isInteger(parsed) && parsed > 0) {
          setConversationId(parsed);
          return;
        }
      }
    } catch {
      /* localStorage unavailable */
    }
    void ensureConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ensureConversation = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const conv = (await res.json()) as { id: number };
      setConversationId(conv.id);
      try {
        localStorage.setItem(STORAGE_KEY, String(conv.id));
      } catch {
        /* ignore */
      }
    } finally {
      setCreating(false);
    }
  }, []);

  const startFresh = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setConversationId(null);
    void ensureConversation();
  }, [ensureConversation]);

  // Close on Esc + click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const t = e.target as Node;
      if (!panelRef.current.contains(t)) {
        const fabBtn = document.getElementById("assistant-fab-btn");
        if (fabBtn && fabBtn.contains(t)) return;
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Hide on the dedicated assistant route to avoid the duplicate UI.
  if (pathname === "/assistant" || pathname.startsWith("/assistant/")) return null;
  if (pathname === "/login" || pathname === "/signin" || pathname === "/signup") return null;

  return (
    <Can permission="assistant:use">
      <>
        <button
          id="assistant-fab-btn"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "إغلاق المساعد" : "فتح المساعد الذكي"}
          className={cn(
            "fixed bottom-4 left-4 md:bottom-6 md:left-6 z-[80] no-print",
            "w-14 h-14 rounded-full shadow-lg flex items-center justify-center",
            "transition-all hover:scale-105 active:scale-95",
            "bg-gradient-to-br from-amber-400 to-amber-600 text-white",
            "ring-2 ring-amber-200/60 hover:ring-amber-200",
            open && "rotate-90",
          )}
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {open ? <X size={22} /> : <Sparkles size={22} />}
        </button>

        {open && (
          <div
            ref={panelRef}
            className={cn(
              "fixed z-[80] no-print bg-white shadow-2xl rounded-2xl border border-gray-200",
              "flex flex-col overflow-hidden",
              // Mobile: nearly full screen with margins.
              "inset-x-3 bottom-20 top-20",
              // Desktop: anchored to bottom-left, fixed size.
              "md:inset-x-auto md:top-auto md:bottom-24 md:left-6 md:w-[420px] md:h-[640px]",
            )}
          >
            <header className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-amber-100">
              <Sparkles size={18} className="text-amber-600" />
              <h2 className="text-sm font-bold text-gray-800 flex-1">المساعد الذكي</h2>
              <button
                onClick={startFresh}
                className="text-[11px] text-gray-600 hover:text-amber-700 px-2 py-1 rounded hover:bg-white/70"
                title="بدء محادثة جديدة"
              >
                جديدة
              </button>
              {conversationId != null && (
                <Link
                  href={`/assistant/${conversationId}`}
                  onClick={() => setOpen(false)}
                  className="p-1 text-gray-500 hover:text-amber-700 hover:bg-white/70 rounded"
                  title="فتح كصفحة كاملة"
                >
                  <ExternalLink size={14} />
                </Link>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-700 rounded"
                aria-label="إغلاق"
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex-1 min-h-0 flex">
              {creating || conversationId == null ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <Loader2 size={28} className="animate-spin" />
                </div>
              ) : (
                <AssistantQuickPanel conversationId={conversationId} pathname={pathname} />
              )}
            </div>
          </div>
        )}
      </>
    </Can>
  );
}
