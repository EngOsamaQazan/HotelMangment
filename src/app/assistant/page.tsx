import { Sparkles } from "lucide-react";
import { AssistantSidebar } from "@/components/assistant/AssistantSidebar";

export const dynamic = "force-dynamic";

export default function AssistantIndexPage() {
  return (
    <div
      className="flex flex-col md:flex-row h-[calc(100dvh-4rem)] md:h-[calc(100dvh-3rem)] min-h-0"
      style={{
        margin: "calc(-1 * var(--page-py)) calc(-1 * var(--page-px))",
      }}
    >
      <AssistantSidebar activeId={null} />
      <main className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400 px-6 max-w-md">
          <Sparkles size={64} className="mx-auto mb-4 opacity-40" />
          <h2 className="text-lg font-medium text-gray-600">
            المساعد الذكي للموظفين
          </h2>
          <p className="text-sm mt-2 text-gray-500 leading-relaxed">
            اطلب أي عملية بصياغة طبيعية: قيد محاسبي، حجز، طلب صيانة، سُلفة لموظف…
            المساعد يجهّز المسودة ويعرضها عليك للمراجعة، ثم ينفّذها بعد ضغطك على
            تأكيد. ابدأ محادثة جديدة من القائمة.
          </p>
        </div>
      </main>
    </div>
  );
}
