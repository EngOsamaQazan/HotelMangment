"use client";

import { use } from "react";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatThread } from "@/components/chat/ChatThread";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId: raw } = use(params);
  const conversationId = Number(raw);

  return (
    <div
      className="flex flex-col md:flex-row h-[calc(100dvh-4rem)] md:h-[calc(100dvh-3rem)] min-h-0"
      style={{
        margin: "calc(-1 * var(--page-py)) calc(-1 * var(--page-px))",
      }}
    >
      <div className="hidden md:block">
        <ChatSidebar activeId={conversationId} />
      </div>
      <ChatThread conversationId={conversationId} />
    </div>
  );
}
