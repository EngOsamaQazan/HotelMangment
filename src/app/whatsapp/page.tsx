"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/Can";
import { cn } from "@/lib/utils";

import type {
  ConversationSummary,
  Message,
  ScopeFilter,
  StatusFilter,
  TemplateRow,
} from "./_types";
import {
  conversationDisplayName,
  humanizeWaError,
  isReengagementError,
  messagePreview,
  readJsonSafe,
} from "./_utils";

import { InboxHeader } from "./_components/InboxHeader";
import { FilterTabs } from "./_components/FilterTabs";
import { ThreadList } from "./_components/ThreadList";
import { ConversationHeader } from "./_components/ConversationHeader";
import { MessageBubble } from "./_components/MessageBubble";
import { Composer } from "./_components/Composer";
import { ContactPanel } from "./_components/ContactPanel";
import { NewMessagePane } from "./_components/NewMessagePane";
import { TemplateSendModal } from "./_components/TemplateSendModal";
import { PushBadge } from "./_components/PushBadge";

import { useInboxData } from "./_hooks/useInboxData";
import { useIsMobile, useIsBelowLg } from "./_hooks/useMediaQuery";
import { useWhatsAppRealtime } from "@/lib/whatsapp/hooks/useWhatsAppRealtime";
import { useWhatsAppPush } from "@/lib/whatsapp/hooks/useWhatsAppPush";
import { useWhatsAppSound } from "@/lib/whatsapp/hooks/useWhatsAppSound";
import { useTabAttention } from "@/lib/whatsapp/hooks/useTabAttention";
import { useHasPermission } from "@/lib/permissions/client";

/**
 * Modular WhatsApp Business inbox — responsive Master-Detail layout.
 *
 *   Desktop (≥ lg / 1024):  [ThreadList 340] [Conversation flex] [ContactPanel 340 inline]
 *   Tablet  (md  / 768):    [ThreadList 300] [Conversation flex] + ContactPanel overlay
 *   Mobile  (< md):         Exactly one pane: either ThreadList OR Conversation,
 *                           with Back button + history state wiring. ContactPanel
 *                           slides up as a bottom-sheet.
 */
export default function WhatsAppInboxPage() {
  return (
    <Suspense fallback={null}>
      <WhatsAppInboxInner />
    </Suspense>
  );
}

function WhatsAppInboxInner() {
  const { data: session } = useSession();
  const currentUserId = Number(
    (session?.user as { id?: string | number })?.id ?? 0,
  );
  const canSend = useHasPermission("whatsapp:send");
  const canAssign = useHasPermission("whatsapp:assign");
  const canNotes = useHasPermission("whatsapp:notes");

  const isMobile = useIsMobile();
  const isBelowLg = useIsBelowLg();

  // ─── Filters ──────────────────────────────────────────────
  // Default to "الكل" so staff see the full inbox on first open — the old
  // "mine"-first default was hiding unassigned threads from anyone who
  // hadn't claimed one yet.
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");

  // ─── Data layer ───────────────────────────────────────────
  const data = useInboxData({ scope, status, search });

  // ─── Deep link via ?contact=<phone> ───────────────────────
  // A tap on a Web Push notification lands us here. We must:
  //   1. Select the phone immediately (thread pane renders instantly).
  //   2. Hydrate the conversation regardless of the current filter scope —
  //      otherwise a thread assigned to someone else (or resolved) would
  //      not appear in `conversations` and `activeConversation` stays null,
  //      leaving the mobile user on an empty-state dead-end.
  //   3. On mobile, push a history entry so Back unwinds to the list.
  //   4. Strip `?contact=...` from the URL once consumed so a refresh / back
  //      doesn't re-trigger the deep link.
  const searchParams = useSearchParams();
  const deepLinkPhone = searchParams.get("contact");
  const consumedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkPhone) return;
    const normalized = deepLinkPhone.replace(/\D/g, "");
    if (!normalized) return;
    if (consumedDeepLinkRef.current === normalized) return;
    consumedDeepLinkRef.current = normalized;

    data.setSelectedPhone(normalized);
    // Fetch the single conv irrespective of filter, so it shows up.
    void data.hydrateConversation(normalized);

    // Strip the `contact` query param so the deep-link is one-shot.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("contact");
      window.history.replaceState(
        { waThread: normalized },
        "",
        url.pathname + (url.search || "") + url.hash,
      );
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkPhone]);

  // ─── Right-pane modes ─────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  // On desktop (≥ lg) the contact details live inline beside the thread, so
  // we default them to open. On anything smaller (tablet/mobile) the panel is
  // an overlay — keep it CLOSED by default so landing here from a push
  // notification doesn't pop a big sheet on top of the conversation.
  //
  // NOTE: `useIsBelowLg` is SSR-safe and starts at `false` on first render,
  // only flipping to the real value inside a client effect. The old code
  // ran the auto-open branch during that initial `false` tick on mobile —
  // and never reset it once the real media query resolved. Fix: one-shot
  // init using the authoritative `matchMedia` result inside an effect.
  const [showDetails, setShowDetails] = useState(false);
  const showDetailsInitRef = useRef(false);
  useEffect(() => {
    if (showDetailsInitRef.current) return;
    if (typeof window === "undefined") return;
    showDetailsInitRef.current = true;
    setShowDetails(window.matchMedia("(min-width: 1024px)").matches);
  }, []);

  // ─── Mobile history-state Back handling ───────────────────
  // When the user taps a thread on mobile we push a history entry so the
  // browser / Android Back button unwinds to the list instead of leaving the
  // page — matches WhatsApp / Gmail / Telegram behaviour.
  useEffect(() => {
    if (!isMobile) return;
    const onPop = () => {
      if (data.selectedPhone || showNew) {
        data.setSelectedPhone(null);
        setShowNew(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, data.selectedPhone, showNew]);

  const openThread = useCallback(
    (phone: string) => {
      setShowNew(false);
      const already = data.selectedPhone === phone;
      data.setSelectedPhone(phone);
      if (isMobile && !already) {
        try {
          window.history.pushState({ waThread: phone }, "");
        } catch {
          /* noop */
        }
      }
    },
    [data, isMobile],
  );

  const backToList = useCallback(() => {
    setShowNew(false);
    data.setSelectedPhone(null);
    if (isMobile) {
      try {
        window.history.back();
      } catch {
        /* noop */
      }
    }
  }, [data, isMobile]);

  // ─── Templates ────────────────────────────────────────────
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateTo, setTemplateTo] = useState("");
  const [sendingTemplate, setSendingTemplate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/whatsapp/templates", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as TemplateRow[];
        if (!cancelled) setTemplates(body.filter((t) => t.status === "APPROVED"));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Notifications plumbing ───────────────────────────────
  const push = useWhatsAppPush();
  const sound = useWhatsAppSound(true);
  const attention = useTabAttention();

  // Prime the Web Audio ctx on any click inside the page.
  useEffect(() => {
    const onClick = () => sound.prime();
    window.addEventListener("click", onClick, { once: true });
    return () => window.removeEventListener("click", onClick);
  }, [sound]);

  // ─── Scroll to bottom on new messages ─────────────────────
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data.messages]);

  // ─── Refresh on tab return ────────────────────────────────
  // Socket.IO occasionally drops events during background / sleep / weak-
  // signal periods — especially on mobile when the browser parks the tab.
  // Whenever the tab becomes visible again (or the window regains focus)
  // refetch the inbox list + active thread so nothing is silently missing.
  // Cheap: the list query is already indexed and capped at 80, and the
  // messages query at 200.
  useEffect(() => {
    const refresh = () => {
      data.loadList();
      data.loadCounts();
      if (data.selectedPhone) void data.loadMessages(data.selectedPhone);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
    // We intentionally re-bind when the selected phone changes so the focus
    // handler captures the latest phone, not a stale closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.selectedPhone]);

  // ─── Realtime hookup ──────────────────────────────────────
  useWhatsAppRealtime({
    conversationId: data.activeConversation?.id ?? null,
    onMessageNew: (p) => {
      // The realtime payload is a *signal*, not a full Message row — it
      // carries a preview body ("📷 صورة") and omits media fields. For
      // the currently-open thread we must refetch the authoritative row
      // so captions, media thumbnails, and status all match the DB.
      // (Merging the signal directly made images render as the preview
      //  text "📷 صورة" on desktop — bug reported 2026-04-24.)
      if (
        data.selectedPhone &&
        p.contactPhone === data.selectedPhone &&
        !showNew
      ) {
        void data.loadMessages(data.selectedPhone);
        data.markRead(p.contactPhone);
      }

      data.loadList();
      data.loadCounts();

      if (p.op === "message:new") {
        sound.play();
        attention.flash(`● ${p.contactName ?? `+${p.contactPhone}`}`);
        toast(p.contactName ?? `+${p.contactPhone}`, {
          description: (p.body ?? "رسالة جديدة").slice(0, 120),
          action: {
            label: "فتح",
            onClick: () => openThread(p.contactPhone),
          },
        });
      }
    },
    onMessageStatus: (p) => {
      data.patchMessageStatus(p.messageId, {
        status: p.status ?? "sent",
        errorCode: p.errorCode ?? null,
      });
    },
    onConversationUpdate: () => {
      data.loadList();
      data.loadCounts();
    },
    onContactUpdate: () => {
      data.loadList();
    },
    onTabPush: () => {
      sound.play();
      attention.flash();
    },
    onOpenConversation: ({ contactPhone }) => {
      if (!contactPhone) return;
      const normalized = contactPhone.replace(/\D/g, "");
      if (!normalized) return;
      // Hydrate irrespective of filter so the chosen thread is guaranteed to
      // resolve on mobile even if it's assigned to someone else.
      void data.hydrateConversation(normalized);
      openThread(normalized);
    },
  });

  // ─── Sending ──────────────────────────────────────────────
  const send = useCallback(
    async (to: string, text: string) => {
      setSending(true);
      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, text }),
        });
        await readJsonSafe<unknown>(res, "فشل الإرسال");
        toast.success("تم الإرسال");
        setComposerText("");
        const normalized = to.replace(/\D/g, "");
        data.setSelectedPhone(normalized);
        await Promise.all([data.loadMessages(normalized), data.loadList()]);
      } catch (err) {
        const raw = err instanceof Error ? err.message : "فشل الإرسال";
        if (isReengagementError(null, raw)) {
          toast.error(
            "مضى أكثر من 24 ساعة — استخدم زر «📋 قالب» بالأعلى.",
            { duration: 6000 },
          );
          setTemplateTo(to.startsWith("+") ? to : `+${to}`);
          setTemplateModalOpen(true);
          setShowNew(false);
        } else {
          toast.error(humanizeWaError(null, raw));
        }
      } finally {
        setSending(false);
      }
    },
    [data],
  );

  const sendMediaFile = useCallback(
    async (to: string, file: File, caption: string, kind: "image" | "video" | "document" | "audio") => {
      setSending(true);
      try {
        const fd = new FormData();
        fd.append("to", to);
        fd.append("kind", kind);
        if (caption) fd.append("caption", caption);
        fd.append("file", file, file.name);
        const res = await fetch("/api/whatsapp/send-media", {
          method: "POST",
          body: fd,
        });
        await readJsonSafe(res, "فشل الإرسال");
        toast.success("تم الإرسال");
        const normalized = to.replace(/\D/g, "");
        data.setSelectedPhone(normalized);
        await Promise.all([data.loadMessages(normalized), data.loadList()]);
      } catch (err) {
        const raw = err instanceof Error ? err.message : "فشل الإرسال";
        if (isReengagementError(null, raw)) {
          toast.error(
            "مضى أكثر من 24 ساعة — لا يمكن إرسال الوسائط إلا داخل نافذة 24 ساعة.",
            { duration: 6000 },
          );
        } else {
          toast.error(humanizeWaError(null, raw));
        }
      } finally {
        setSending(false);
      }
    },
    [data],
  );

  const sendNote = useCallback(
    async (text: string) => {
      if (!data.selectedPhone) return;
      setSending(true);
      try {
        const res = await fetch(
          `/api/whatsapp/conversations/${encodeURIComponent(data.selectedPhone)}/notes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: text, mirrorToConversation: true }),
          },
        );
        await readJsonSafe(res, "فشل إضافة الملاحظة");
        await Promise.all([
          data.loadMessages(data.selectedPhone),
          data.loadList(),
        ]);
        toast.success("تمت إضافة الملاحظة الداخلية");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "فشل");
      } finally {
        setSending(false);
      }
    },
    [data],
  );

  const sendTemplate = useCallback(
    async (to: string, name: string, language: string) => {
      setSendingTemplate(true);
      try {
        const res = await fetch("/api/whatsapp/send-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, templateName: name, language }),
        });
        await readJsonSafe(res, "فشل إرسال القالب");
        toast.success(`تم إرسال القالب "${name}"`);
        setTemplateModalOpen(false);
        const normalized = to.replace(/\D/g, "");
        data.setSelectedPhone(normalized);
        await Promise.all([data.loadMessages(normalized), data.loadList()]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "فشل إرسال القالب");
      } finally {
        setSendingTemplate(false);
      }
    },
    [data],
  );

  // ─── Derived UI state ─────────────────────────────────────
  const active = data.activeConversation;
  const assignedToMe = active?.assignedToUserId === currentUserId;
  const canReply = useMemo(() => {
    if (!active) return false;
    if (!canSend) return false;
    if (active.contact?.isBlocked) return false;
    if (active.status === "archived") return false;
    if (!active.assignedToUserId) return true;
    return assignedToMe || canAssign;
  }, [active, canSend, canAssign, assignedToMe]);

  const replyDisabledReason = useMemo(() => {
    if (!active) return null;
    if (!canSend) return "ليس لديك صلاحية الإرسال.";
    if (active.contact?.isBlocked)
      return "جهة الاتصال محظورة — لا يمكن الإرسال.";
    if (active.status === "archived")
      return "المحادثة مؤرشفة — أعد فتحها للرد.";
    if (
      active.assignedToUserId &&
      active.assignedToUserId !== currentUserId &&
      !canAssign
    )
      return `مُسنَدة إلى ${active.assignedTo?.name ?? "موظف آخر"} — لا يمكنك الرد إلا إذا أسندت إليك.`;
    return null;
  }, [active, canSend, canAssign, currentUserId]);

  // Show the list pane on mobile only when nothing else is open.
  const showListPane = !isMobile || (!data.selectedPhone && !showNew);
  const showThreadPane = !isMobile || data.selectedPhone || showNew;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <InboxHeader
        onNewMessage={() => {
          setShowNew(true);
          data.setSelectedPhone(null);
          setComposerText("");
          if (isMobile) {
            try {
              window.history.pushState({ waNew: true }, "");
            } catch {
              /* noop */
            }
          }
        }}
        onUseTemplate={() => {
          setTemplateTo(data.selectedPhone ? `+${data.selectedPhone}` : "");
          setTemplateModalOpen(true);
        }}
        pushBadge={<PushBadge push={push} />}
      />

      <div
        className={cn(
          "flex gap-0 md:gap-3 overflow-hidden",
          // Dynamic viewport height avoids the iOS Safari address-bar gap.
          "h-[calc(100dvh-9rem)] sm:h-[calc(100dvh-11rem)] md:h-[calc(100dvh-13rem)]",
          "min-h-[480px]",
        )}
      >
        {/* ═════════════ LIST PANE ═════════════ */}
        <aside
          className={cn(
            "bg-card-bg md:rounded-xl shadow-sm overflow-hidden flex flex-col",
            "w-full md:w-[300px] lg:w-[340px] md:shrink-0",
            !showListPane && "hidden",
          )}
          aria-label="قائمة المحادثات"
        >
          <FilterTabs
            scope={scope}
            setScope={setScope}
            status={status}
            setStatus={setStatus}
            counts={data.counts}
          />
          <ThreadList
            conversations={data.conversations}
            selectedPhone={data.selectedPhone}
            search={search}
            setSearch={setSearch}
            loading={data.loadingList}
            onSelect={openThread}
          />
        </aside>

        {/* ═════════════ THREAD PANE ═════════════ */}
        <section
          className={cn(
            "bg-card-bg md:rounded-xl shadow-sm overflow-hidden flex flex-1 min-w-0",
            !showThreadPane && "hidden",
          )}
          aria-label="المحادثة النشطة"
        >
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Mobile-only back button appears above every thread state */}
            {isMobile && (showNew || active || data.selectedPhone) && (
              <button
                type="button"
                onClick={backToList}
                className="tap-44 md:hidden inline-flex items-center gap-1.5 px-3 self-start text-sm text-primary font-medium"
                aria-label="رجوع إلى قائمة المحادثات"
              >
                <ArrowRight size={16} className="rotate-180" />
                <span>قائمة المحادثات</span>
              </button>
            )}

            {showNew ? (
              <NewMessagePane
                to={newTo}
                setTo={setNewTo}
                text={composerText}
                setText={setComposerText}
                sending={sending}
                templatesCount={templates.length}
                onUseTemplate={() => {
                  setTemplateTo(newTo || "");
                  setTemplateModalOpen(true);
                }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newTo.trim() || !composerText.trim()) return;
                  await send(newTo.trim(), composerText.trim());
                  setShowNew(false);
                  setNewTo("");
                }}
                onCancel={() => {
                  setShowNew(false);
                  if (isMobile) {
                    try {
                      window.history.back();
                    } catch {
                      /* noop */
                    }
                  }
                }}
              />
            ) : active ? (
              <ActiveConversation
                conversation={active}
                messages={data.messages}
                loadingMessages={data.loadingMessages}
                currentUserId={currentUserId}
                showDetails={showDetails}
                setShowDetails={setShowDetails}
                canReply={canReply}
                replyDisabledReason={replyDisabledReason}
                canNotes={canNotes}
                sending={sending}
                onSend={(t) => send(active.contactPhone, t)}
                onSendNote={sendNote}
                onSendMedia={(file, caption, kind) =>
                  sendMediaFile(active.contactPhone, file, caption, kind)
                }
                onOpenTemplate={() => {
                  setTemplateTo(`+${active.contactPhone}`);
                  setTemplateModalOpen(true);
                }}
                onConversationChanged={() => {
                  data.loadList();
                  data.loadCounts();
                  if (data.selectedPhone)
                    data.loadMessages(data.selectedPhone);
                }}
                bottomRef={bottomRef}
              />
            ) : data.selectedPhone ? (
              <PendingThreadState
                phone={data.selectedPhone}
                loading={data.loadingList || data.loadingMessages}
                onBack={backToList}
              />
            ) : (
              <EmptyState />
            )}
          </div>

          {/* Inline details drawer — desktop only (≥ lg) */}
          {active && showDetails && !showNew && (
            <ContactPanel
              variant="inline"
              phone={active.contactPhone}
              onClose={() => setShowDetails(false)}
              onChange={() => {
                data.loadList();
                if (data.selectedPhone) data.loadMessages(data.selectedPhone);
              }}
              className="hidden lg:flex"
            />
          )}
        </section>
      </div>

      {/* Overlay details — mobile + tablet (< lg) */}
      {active && showDetails && !showNew && isBelowLg && (
        <ContactPanel
          variant="overlay"
          phone={active.contactPhone}
          onClose={() => setShowDetails(false)}
          onChange={() => {
            data.loadList();
            if (data.selectedPhone) data.loadMessages(data.selectedPhone);
          }}
        />
      )}

      {templateModalOpen && (
        <TemplateSendModal
          templates={templates}
          initialTo={templateTo}
          sending={sendingTemplate}
          onClose={() => setTemplateModalOpen(false)}
          onSend={sendTemplate}
        />
      )}
    </div>
  );
}

// ───────────────── Active conversation shell ─────────────────
function ActiveConversation({
  conversation,
  messages,
  loadingMessages,
  currentUserId,
  showDetails,
  setShowDetails,
  canReply,
  replyDisabledReason,
  canNotes,
  sending,
  onSend,
  onSendNote,
  onSendMedia,
  onOpenTemplate,
  onConversationChanged,
  bottomRef,
}: {
  conversation: ConversationSummary;
  messages: Message[];
  loadingMessages: boolean;
  currentUserId: number;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  canReply: boolean;
  replyDisabledReason: string | null;
  canNotes: boolean;
  sending: boolean;
  onSend: (t: string) => Promise<void>;
  onSendNote: (t: string) => Promise<void>;
  onSendMedia: (
    file: File,
    caption: string,
    kind: "image" | "video" | "document" | "audio",
  ) => Promise<void>;
  onOpenTemplate: () => void;
  onConversationChanged: () => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <ConversationHeader
        conversation={conversation}
        currentUserId={currentUserId}
        showDetails={showDetails}
        setShowDetails={setShowDetails}
        onChange={onConversationChanged}
      />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-gray-50/60 scrollbar-thin">
        {loadingMessages && messages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8">
            لا توجد رسائل بعد — ابدأ بإرسال رد أو ملاحظة داخلية.
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <Can
        permission="whatsapp:send"
        fallback={
          <div className="p-3 text-xs text-gray-400 text-center border-t border-gray-100">
            ليس لديك صلاحية الإرسال.
          </div>
        }
      >
        <Composer
          disabled={!canReply && !canNotes}
          disabledReason={replyDisabledReason}
          sending={sending}
          onSend={onSend}
          onSendNote={onSendNote}
          onSendMedia={onSendMedia}
          onOpenTemplate={onOpenTemplate}
        />
      </Can>
    </>
  );
}

// ───────────────── Pending thread (deep-link landing) ─────────────────
/**
 * Shown on the thread pane when the user tapped a notification (or deep link)
 * but the conversation row hasn't been merged into `conversations` yet — or
 * the phone simply doesn't match any existing conversation.
 *
 * Critical for mobile: without this, the list pane is hidden AND the thread
 * pane would fall back to `<EmptyState>` with no back button, trapping the
 * user on a blank screen.
 */
function PendingThreadState({
  phone,
  loading,
  onBack,
}: {
  phone: string;
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 sm:p-8 gap-3 text-center">
      {loading ? (
        <>
          <Loader2 size={28} className="animate-spin text-primary" />
          <div>
            <div className="text-gray-700 font-medium text-sm">
              جارٍ فتح المحادثة…
            </div>
            <div className="text-xs text-gray-400 mt-1" dir="ltr">
              +{phone}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center">
            <MessageCircle size={30} className="text-green-500" />
          </div>
          <div>
            <div className="text-gray-700 font-medium text-sm">
              لا توجد رسائل بعد مع هذا الرقم
            </div>
            <div className="text-xs text-gray-400 mt-1" dir="ltr">
              +{phone}
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="tap-44 md:hidden mt-2 inline-flex items-center gap-1.5 px-4 rounded-full bg-primary text-white text-sm font-medium"
          >
            <ArrowRight size={16} className="rotate-180" />
            <span>العودة للقائمة</span>
          </button>
        </>
      )}
    </div>
  );
}

// ───────────────── Empty state ─────────────────
function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 sm:p-8 gap-3 text-center">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center">
        <MessageCircle size={30} className="text-green-500" />
      </div>
      <div>
        <div className="text-gray-600 font-medium text-sm">
          اختر محادثة من القائمة
        </div>
        <div className="text-xs text-gray-400 mt-1">
          أو ابدأ رسالة جديدة لرقم لم يراسلنا من قبل.
        </div>
      </div>
    </div>
  );
}

/** Re-export util so tree-shaking keeps it if referenced elsewhere. */
export { messagePreview, conversationDisplayName };
