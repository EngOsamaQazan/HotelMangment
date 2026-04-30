import { notFound } from "next/navigation";
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar";
import { AssistantChat } from "@/components/assistant/AssistantChat";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ conversationId: string }>;
}

export default async function AssistantConversationPage({ params }: Props) {
  const { conversationId } = await params;
  const id = Number(conversationId);
  if (!Number.isFinite(id)) notFound();

  return (
    <div
      className="flex flex-col md:flex-row h-[calc(100dvh-4rem)] md:h-[calc(100dvh-3rem)] min-h-0"
      style={{
        margin: "calc(-1 * var(--page-py)) calc(-1 * var(--page-px))",
      }}
    >
      <AssistantSidebar activeId={id} />
      <main className="flex-1 flex min-h-0">
        <AssistantChat conversationId={id} />
      </main>
    </div>
  );
}
