"use client";

import { MessageSquare } from "lucide-react";
import { ChatSidebar } from "@/components/chat/ChatSidebar";

export default function ChatIndexPage() {
  return (
    <div className="flex flex-col md:flex-row -mx-4 md:-mx-6 -mt-4 md:-mt-6 h-[calc(100vh-4rem)] md:h-[calc(100vh-3rem)]">
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
