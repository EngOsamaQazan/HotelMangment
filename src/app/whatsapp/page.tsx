"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/Can";

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
import { useWhatsAppRealtime } from "@/lib/whatsapp/hooks/useWhatsAppRealtime";
import { useWhatsAppPush } from "@/lib/whatsapp/hooks/useWhatsAppPush";
import { useWhatsAppSound } from "@/lib/whatsapp/hooks/useWhatsAppSound";
import { useTabAttention } from "@/lib/whatsapp/hooks/useTabAttention";
import { useHasPermission } from "@/lib/permissions/client";

/**
 * Modular WhatsApp Business inbox.
 *
 *   ┌─────────────────── InboxHeader ───────────────────┐
 *   │  FilterTabs │                                     │
 *   │  ThreadList │  ConversationHeader  │ContactPanel? │
 *   │             │  [messages]          │              │
 *   │             │  Composer            │              │
 *   └─────────────┴──────────────────────┴──────────────┘
 *
 * Realtime updates from Socket.IO + Service Worker push land in the callbacks
 * below and mutate the two main state slices (`conversations` / `messages`).
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

  // ─── Filters ──────────────────────────────────────────────
  const [scope, setScope] = useState<ScopeFilter>("mine");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");

  // ─── Data layer ───────────────────────────────────────────
  const data = useInboxData({ scope, status, search });

  // ─── Deep link via ?contact=<phone> ───────────────────────
  const searchParams = useSearchParams();
  const deepLinkPhone = searchParams.get("contact");
  useEffect(() => {
    if (!deepLinkPhone) return;
    const normalized = deepLinkPhone.replace(/\D/g, "");
    if (normalized) data.setSelectedPhone(normalized);
    // one-shot: don't re-run when the search string stays the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkPhone]);

  // ─── Right-pane modes ─────────────────────────────────────
  const [showNew, setShowNew] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [showDetails, setShowDetails] = useState(true);

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

  // ─── Realtime hookup ──────────────────────────────────────
  useWhatsAppRealtime({
    conversationId: data.activeConversation?.id ?? null,
    onMessageNew: (p) => {
      // If it's for the open thread, append immediately.
      if (
        data.selectedPhone &&
        p.contactPhone === data.selectedPhone &&
        !showNew
      ) {
        data.mergeIncomingMessage({
          id: p.messageId,
          direction:
            p.op === "message:new" && p.type && p.type !== "template"
              ? "inbound"
              : "inbound",
          contactPhone: p.contactPhone,
          contactName: p.contactName ?? null,
          type: p.type ?? "text",
          body: p.body ?? null,
          templateName: null,
          status: p.status ?? "received",
          errorCode: null,
          errorMessage: null,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          createdAt: p.createdAt ?? new Date().toISOString(),
        });
        // Auto-mark read since the user is looking at it.
        data.markRead(p.contactPhone);
      }

      // Refresh list order and counts.
      data.loadList();
      data.loadCounts();

      // In-app attention (sound + tab flash) — only for inbound.
      if (p.op === "message:new") {
        sound.play();
        attention.flash(`● ${p.contactName ?? `+${p.contactPhone}`}`);
        toast(p.contactName ?? `+${p.contactPhone}`, {
          description: (p.body ?? "رسالة جديدة").slice(0, 120),
          action: {
            label: "فتح",
            onClick: () => {
              setShowNew(false);
              data.setSelectedPhone(p.contactPhone);
            },
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
    if (!active.assignedToUserId) return true; // anyone can claim+reply
    return assignedToMe || canAssign; // managers can override
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

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <InboxHeader
        onNewMessage={() => {
          setShowNew(true);
          data.setSelectedPhone(null);
          setComposerText("");
        }}
        onUseTemplate={() => {
          setTemplateTo(data.selectedPhone ? `+${data.selectedPhone}` : "");
          setTemplateModalOpen(true);
        }}
        pushBadge={<PushBadge push={push} />}
      />

      <div className="grid md:grid-cols-[320px_1fr] gap-3 h-[calc(100vh-14rem)] min-h-[520px]">
        {/* Thread list */}
        <aside className="bg-card-bg rounded-xl shadow-sm overflow-hidden flex flex-col">
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
            onSelect={(phone) => {
              setShowNew(false);
              data.setSelectedPhone(phone);
            }}
          />
        </aside>

        {/* Active conversation */}
        <section className="bg-card-bg rounded-xl shadow-sm overflow-hidden flex">
          <div className="flex-1 min-w-0 flex flex-col">
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
                onCancel={() => setShowNew(false)}
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
            ) : (
              <EmptyState />
            )}
          </div>

          {/* Contact details drawer */}
          {active && showDetails && !showNew && (
            <ContactPanel
              phone={active.contactPhone}
              onClose={() => setShowDetails(false)}
              onChange={() => {
                data.loadList();
                if (data.selectedPhone) data.loadMessages(data.selectedPhone);
              }}
            />
          )}
        </section>
      </div>

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
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/60 scrollbar-thin">
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
          onOpenTemplate={onOpenTemplate}
        />
      </Can>
    </>
  );
}

// ───────────────── Empty state ─────────────────
function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 gap-3 text-center">
      <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center">
        <MessageCircle size={32} className="text-green-500" />
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
