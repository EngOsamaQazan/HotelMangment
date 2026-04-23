"use client";

import Link from "next/link";
import { BookUser, FileText, MessageCircle, Phone, Settings } from "lucide-react";
import { Can } from "@/components/Can";

interface Props {
  onNewMessage: () => void;
  onUseTemplate: () => void;
  pushBadge: React.ReactNode;
}

/**
 * Main page header — title, brand mark, and primary actions (phonebook,
 * template composer, new-message composer, settings).
 *
 * Everything here that mutates data is wrapped in `<Can>` so the header
 * renders correctly even for view-only staff.
 */
export function InboxHeader({ onNewMessage, onUseTemplate, pushBadge }: Props) {
  return (
    <div className="pt-2 sm:pt-4 border-b-2 border-gold/30 pb-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-block w-1 h-8 bg-gold rounded-full"
        />
        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-green-50 border border-green-200">
          <MessageCircle size={22} className="text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary font-[family-name:var(--font-amiri)] tracking-tight">
            واتساب
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            صندوق الوارد الموحّد — WhatsApp Business Cloud
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {pushBadge}
        <Can permission="whatsapp:view">
          <Link
            href="/whatsapp/phonebook"
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            <BookUser size={16} />
            دفتر الهاتف
          </Link>
        </Can>
        <Can permission="whatsapp:send_template">
          <button
            onClick={onUseTemplate}
            className="flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg hover:bg-gold-soft text-sm font-medium"
            title="إرسال قالب معتمد — مناسب لأول رسالة خارج نافذة 24 ساعة"
          >
            <FileText size={16} />
            إرسال قالب
          </button>
        </Can>
        <Can permission="whatsapp:send">
          <button
            onClick={onNewMessage}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium"
          >
            <Phone size={16} />
            رسالة لرقم جديد
          </button>
        </Can>
        <Can permission="whatsapp:view">
          <Link
            href="/settings/whatsapp/notifications"
            aria-label="إعدادات الإشعارات"
            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <Settings size={16} />
          </Link>
        </Can>
      </div>
    </div>
  );
}
