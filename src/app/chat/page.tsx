"use client";

import { MessageSquare } from "lucide-react";
import { ChatSidebar } from "@/components/chat/ChatSidebar";

export default function ChatIndexPage() {
  return (
    <div
      className="flex flex-col md:flex-row h-[calc(100dvh-4rem)] md:h-[calc(100dvh-3rem)] min-h-0"
      style={{
        margin: "calc(-1 * var(--page-py)) calc(-1 * var(--page-px))",
      }}
    >
      <ChatSidebar activeId={null} />
      <main className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400 px-6">
          <MessageSquare size={64} className="mx-auto mb-4 opacity-40" />
          <h2 className="text-lg font-medium text-gray-500">
            اختر محادثة أو ابدأ واحدة جديدة
          </h2>
          <p className="text-sm mt-1">
            المحادثات الفورية مع الزملاء، ومحادثات المهام.
          </p>
        </div>
      </main>
    </div>
  );
}
