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
    <div className="flex flex-col md:flex-row -mx-4 md:-mx-6 -mt-4 md:-mt-6 -mb-4 md:-mb-6 h-[calc(100dvh-4rem)] md:h-[calc(100dvh-3rem)] min-h-0">
      <div className="hidden md:block">
        <ChatSidebar activeId={conversationId} />
      </div>
      <ChatThread conversationId={conversationId} />
    </div>
  );
}
