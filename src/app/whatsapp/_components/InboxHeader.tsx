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
 * Responsive behaviour:
 *   • ≥ sm : buttons show label + icon.
 *   • < sm : buttons collapse to icon-only (labels retained via aria-label
 *            + visually-hidden span for AT). All targets remain ≥ 44×44 px
 *            (WCAG 2.5.5 AAA).
 *   • Order is reversed on mobile so the title stays on top and the action
 *     row wraps beneath it, keeping line length manageable.
 */
export function InboxHeader({ onNewMessage, onUseTemplate, pushBadge }: Props) {
  return (
    <div className="pt-2 sm:pt-4 border-b-2 border-gold/30 pb-3 sm:pb-4 flex items-start sm:items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <span
          aria-hidden
          className="hidden sm:inline-block w-1 h-8 bg-gold rounded-full shrink-0"
        />
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center bg-green-50 border border-green-200 shrink-0">
          <MessageCircle size={20} className="text-green-600 sm:hidden" />
          <MessageCircle
            size={22}
            className="text-green-600 hidden sm:inline"
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-primary font-[family-name:var(--font-amiri)] tracking-tight leading-tight">
            واتساب
          </h1>
          <p className="text-[11px] sm:text-sm text-gray-500 mt-0.5 sm:mt-1 truncate">
            <span className="hidden sm:inline">صندوق الوارد الموحّد — </span>
            WhatsApp Business Cloud
          </p>
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 sm:gap-2 flex-wrap w-full sm:w-auto order-last sm:order-none justify-end"
        role="toolbar"
        aria-label="إجراءات الصندوق"
      >
        {pushBadge}
        <Can permission="whatsapp:view">
          <Link
            href="/whatsapp/phonebook"
            className="tap-44 flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
            aria-label="دفتر الهاتف"
            title="دفتر الهاتف"
          >
            <BookUser size={16} />
            <span className="hidden sm:inline">دفتر الهاتف</span>
          </Link>
        </Can>
        <Can permission="whatsapp:send_template">
          <button
            onClick={onUseTemplate}
            className="tap-44 flex items-center justify-center gap-2 px-3 py-2 border border-primary text-primary rounded-lg hover:bg-gold-soft text-sm font-medium"
            aria-label="إرسال قالب معتمد"
            title="إرسال قالب معتمد — مناسب لأول رسالة خارج نافذة 24 ساعة"
          >
            <FileText size={16} />
            <span className="hidden sm:inline">إرسال قالب</span>
          </button>
        </Can>
        <Can permission="whatsapp:send">
          <button
            onClick={onNewMessage}
            className="tap-44 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium"
            aria-label="رسالة جديدة لرقم جديد"
            title="رسالة لرقم جديد"
          >
            <Phone size={16} />
            <span className="hidden sm:inline">رسالة لرقم جديد</span>
          </button>
        </Can>
        <Can permission="whatsapp:view">
          <Link
            href="/settings/whatsapp/notifications"
            aria-label="إعدادات الإشعارات"
            title="إعدادات الإشعارات"
            className="tap-44 flex items-center justify-center p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            <Settings size={16} />
          </Link>
        </Can>
      </div>
    </div>
  );
}
