"use client";

import { useState } from "react";
import { AlertTriangle, FileText, Loader2, Send, X } from "lucide-react";
import { CombinedPhoneInput } from "@/components/ui/CombinedPhoneInput";
import type { TemplateRow } from "../_types";

interface Props {
  templates: TemplateRow[];
  initialTo: string;
  sending: boolean;
  onClose: () => void;
  onSend: (to: string, name: string, language: string) => void;
}

export function TemplateSendModal({
  templates,
  initialTo,
  sending,
  onClose,
  onSend,
}: Props) {
  const [to, setTo] = useState(initialTo);
  const [selectedId, setSelectedId] = useState<number | null>(
    templates[0]?.id ?? null,
  );
  const current = templates.find((t) => t.id === selectedId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !to.trim()) return;
    onSend(to.trim(), current.name, current.language);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={22} className="text-primary" />
            <h3 className="text-lg font-bold text-gray-800">إرسال قالب معتمد</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              لا توجد قوالب معتمدة بعد. اذهب إلى{" "}
              <strong>الإعدادات ← واتساب ← قوالب الرسائل</strong> واضغط
              «مزامنة من Meta».
            </div>
          </div>
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              القوالب المعتمدة تُرسَل بدون الحاجة لنافذة 24 ساعة، وهي الطريقة
              الصحيحة لأول تواصل مع عميل.
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">
                رقم المستلم
              </label>
              <CombinedPhoneInput
                value={to}
                onChange={setTo}
                placeholder="07XXXXXXXX"
                className="text-sm"
              />
            </div>
            <label className="block">
              <span className="text-sm text-gray-600">القالب</span>
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.language} ({t.category})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={sending || !current || !to.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            إرسال القالب
          </button>
        </div>
      </form>
    </div>
  );
}
