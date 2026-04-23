"use client";

import { AlertTriangle, FileText, Loader2, Send } from "lucide-react";
import { CombinedPhoneInput } from "@/components/ui/CombinedPhoneInput";

interface Props {
  to: string;
  setTo: (s: string) => void;
  text: string;
  setText: (s: string) => void;
  sending: boolean;
  templatesCount: number;
  onUseTemplate: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function NewMessagePane({
  to,
  setTo,
  text,
  setText,
  sending,
  templatesCount,
  onUseTemplate,
  onSubmit,
  onCancel,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="flex-1 flex flex-col min-h-0">
      <header className="px-3 sm:px-4 py-3 border-b border-gray-100 font-medium text-sm">
        رسالة جديدة
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-3 sm:mx-4 mt-3 sm:mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={16}
              className="shrink-0 mt-0.5 text-amber-600"
            />
            <div className="space-y-1.5 flex-1">
              <p>
                <span className="font-semibold">قاعدة WhatsApp:</span>{" "}
                الرسائل النصية الحرة لا تصل إلا لعميل راسلك خلال آخر 24 ساعة.
                لأول محادثة مع رقم جديد استخدم <strong>قالبًا معتمدًا</strong>.
              </p>
              {templatesCount > 0 ? (
                <button
                  type="button"
                  onClick={onUseTemplate}
                  className="tap-44 inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-md px-2.5 py-2"
                >
                  <FileText size={13} />
                  استخدم قالبًا معتمدًا ({templatesCount})
                </button>
              ) : (
                <p className="text-[11.5px] text-amber-800">
                  لا توجد قوالب معتمدة بعد — أضفها من «إعدادات واتساب».
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              رقم الهاتف
            </label>
            <CombinedPhoneInput
              value={to}
              onChange={setTo}
              placeholder="07XXXXXXXX"
              className="text-sm"
            />
          </div>
          <label className="block">
            <span className="text-xs text-gray-500">
              نص الرسالة (فقط إذا راسلك العميل خلال آخر 24 ساعة)
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y min-h-[120px]"
              required
            />
          </label>
        </div>
      </div>
      <footer className="p-3 border-t border-gray-100 flex items-center justify-end gap-2 pb-safe">
        <button
          type="button"
          onClick={onCancel}
          className="tap-44 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={sending || !to || !text}
          className="tap-44 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm"
        >
          {sending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          إرسال
        </button>
      </footer>
    </form>
  );
}
