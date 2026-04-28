"use client";

import { useState } from "react";
import { Loader2, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/Can";
import { cn } from "@/lib/utils";

interface Props {
  reservationId: number;
  hasPhone: boolean;
  className?: string;
}

/**
 * Compact "Resend booking confirmation + contract PDF" action.
 *
 * Hits `POST /api/whatsapp/booking-confirmation/:id` which delegates to
 * the same `sendBookingConfirmation` helper used by the auto-trigger
 * (warm welcome + PDF + Quranic follow-up text), so a manual click is
 * functionally identical to the automatic dispatch on reservation
 * create.
 *
 * Use case: the auto-trigger never fired (dev-server hot-reload, Meta
 * outage, …) and the operator wants to resend without recreating the
 * reservation.
 */
export function ResendBookingConfirmationButton({
  reservationId,
  hasPhone,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function resend() {
    if (!hasPhone) {
      toast.error("لا يوجد رقم هاتف مسجّل لهذا الحجز");
      return;
    }
    setBusy(true);
    const tid = toast.loading("جاري إرسال تأكيد الحجز + ملف العقد...");
    try {
      const res = await fetch(`/api/whatsapp/booking-confirmation/${reservationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // server pulls all defaults from WhatsAppConfig
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        templateMessageId?: string;
        documentMessageId?: string;
        followUpMessageId?: string;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const summary = [
        data.templateMessageId && "✅ رسالة الترحيب + العقد",
        data.documentMessageId && "✅ ملف العقد",
        data.followUpMessageId && "✅ رسالة الذكر",
      ]
        .filter(Boolean)
        .join(" · ");
      toast.success(`تمّ الإرسال — ${summary || "بنجاح"}`, { id: tid });
      if (data.warnings && data.warnings.length > 0) {
        for (const w of data.warnings.slice(0, 3)) toast.warning(w);
      }
    } catch (err) {
      toast.error(
        `فشل الإرسال: ${err instanceof Error ? err.message : "خطأ غير معروف"}`,
        { id: tid },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can permission="whatsapp:send_template">
      <button
        type="button"
        onClick={resend}
        disabled={busy || !hasPhone}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
          "bg-emerald-50 text-emerald-700 border border-emerald-200",
          "hover:bg-emerald-100 transition-colors",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          className,
        )}
        title="إرسال تأكيد الحجز + ملف العقد + رسالة الذكر إلى رقم الضيف"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" />
        )}
        <FileText className="w-3.5 h-3.5" />
        <span>إعادة إرسال تأكيد الحجز + PDF</span>
      </button>
    </Can>
  );
}
