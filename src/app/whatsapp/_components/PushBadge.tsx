"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WhatsAppPushState } from "@/lib/whatsapp/hooks/useWhatsAppPush";

/**
 * Small pill-button shown in the inbox header so users always see whether
 * push notifications are on, and can enable them with one click.
 */
export function PushBadge({ push }: { push: WhatsAppPushState }) {
  if (!push.isSupported) return null;

  if (push.isSubscribed) {
    return (
      <button
        onClick={async () => {
          const ok = await push.unsubscribe();
          if (ok) toast.success("تم إيقاف الإشعارات على هذا الجهاز");
          else toast.error(push.error ?? "فشل");
        }}
        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
        title="الإشعارات مفعّلة — اضغط للإيقاف"
      >
        {push.loading ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Bell size={11} />
        )}
        الإشعارات مفعّلة
      </button>
    );
  }

  const denied = push.permission === "denied";
  return (
    <button
      onClick={async () => {
        if (denied) {
          toast.error(
            "الإشعارات محظورة من المتصفح. فعّلها من إعدادات الموقع أولاً.",
          );
          return;
        }
        const ok = await push.subscribe();
        if (ok) toast.success("تم تفعيل الإشعارات — جرّب اختبارها الآن");
        else toast.error(push.error ?? "فشل تفعيل الإشعارات");
      }}
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full border",
        denied
          ? "border-red-200 bg-red-50 text-red-600"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
      )}
      title={denied ? "محظورة من المتصفح" : "فعّل الإشعارات المكتبية"}
    >
      {push.loading ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <BellOff size={11} />
      )}
      {denied ? "محظورة" : "تفعيل الإشعارات"}
    </button>
  );
}
