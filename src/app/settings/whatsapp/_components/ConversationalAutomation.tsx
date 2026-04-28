"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Save,
  Sparkles,
  Plus,
  Trash2,
  RefreshCw,
  MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/Can";

/**
 * ConversationalAutomation — manage what the user sees the moment they
 * open a WhatsApp chat with the business: an auto-greeting, up to 4
 * one-tap "ice-breaker" prompts, and up to 30 slash-commands. All three
 * are configured at Meta and surfaced inside the WhatsApp UI itself.
 */

interface Command {
  command_name: string;
  command_description: string;
}

interface State {
  enable_welcome_message: boolean;
  prompts: string[];
  commands: Command[];
}

export function ConversationalAutomation() {
  const [state, setState] = useState<State>({
    enable_welcome_message: false,
    prompts: [],
    commands: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/automation", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "تعذّر التحميل");
      setState({
        enable_welcome_message: !!j.enable_welcome_message,
        prompts: Array.isArray(j.prompts) ? j.prompts : [],
        commands: Array.isArray(j.commands) ? j.commands : [],
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      // Strip empty rows before sending — Meta rejects blanks.
      const payload = {
        enable_welcome_message: state.enable_welcome_message,
        prompts: state.prompts.map((p) => p.trim()).filter(Boolean).slice(0, 4),
        commands: state.commands
          .filter(
            (c) =>
              c.command_name.trim().length > 0 &&
              c.command_description.trim().length > 0,
          )
          .slice(0, 30),
      };
      const res = await fetch("/api/whatsapp/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل الحفظ");
      toast.success("تم الحفظ");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-primary" />
          <h2 className="text-lg font-bold text-gray-800">
            تجربة فتح المحادثة (Conversational Automation)
          </h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          مزامنة من Meta
        </button>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        هذه الإعدادات تُحفظ مباشرة عند Meta وتظهر للضيف في تطبيق WhatsApp فور
        فتحه محادثتك: رسالة ترحيب تلقائية، عبارات بدء سريعة، وقائمة أوامر
        تظهر عند كتابة <code className="bg-gray-100 px-1 rounded">/</code>.
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      ) : (
        <>
          {/* Welcome message toggle */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-2">
            <label className="flex items-start gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={state.enable_welcome_message}
                onChange={(e) =>
                  setState({
                    ...state,
                    enable_welcome_message: e.target.checked,
                  })
                }
                className="w-4 h-4 mt-0.5 accent-primary"
              />
              <span>
                تفعيل رسالة الترحيب التلقائية
                <span className="block text-[11px] font-normal text-gray-500 mt-0.5">
                  يستقبل الضيف رسالة ترحيب فور فتحه المحادثة لأول مرة في كل
                  نافذة 24 ساعة. النصّ يُكتب من{" "}
                  <code className="bg-gray-100 px-1 rounded text-[10px]">
                    قواعد الردّ التلقائي
                  </code>{" "}
                  أدناه (event = welcome).
                </span>
              </span>
            </label>
          </div>

          {/* Ice-breakers / prompts */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <MessageSquareText size={16} className="text-primary" />
                عبارات البدء (Ice-breakers) — حدّ أقصى 4
              </div>
              {state.prompts.length < 4 && (
                <button
                  onClick={() =>
                    setState({ ...state, prompts: [...state.prompts, ""] })
                  }
                  className="text-[11px] flex items-center gap-1 px-2 py-1 border border-primary text-primary rounded hover:bg-gold-soft"
                >
                  <Plus size={12} />
                  إضافة
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              تظهر للمستخدم كأزرار قابلة للضغط قبل كتابة أيّ شيء — تُعجّل بدء
              الحديث. مثال: «احجز غرفة الآن»، «الأسعار»، «خدمة العملاء».
            </p>
            {state.prompts.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-2">
                لا عبارات بدء — اختياري.
              </div>
            ) : (
              <div className="space-y-2">
                {state.prompts.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={p}
                      maxLength={80}
                      onChange={(e) =>
                        setState({
                          ...state,
                          prompts: state.prompts.map((x, idx) =>
                            idx === i ? e.target.value : x,
                          ),
                        })
                      }
                      placeholder="مثال: احجز غرفة"
                      className="input flex-1"
                    />
                    <button
                      onClick={() =>
                        setState({
                          ...state,
                          prompts: state.prompts.filter((_, idx) => idx !== i),
                        })
                      }
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Slash-commands */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                أوامر <code className="bg-gray-100 px-1 rounded">/</code> —
                حدّ أقصى 30
              </div>
              {state.commands.length < 30 && (
                <button
                  onClick={() =>
                    setState({
                      ...state,
                      commands: [
                        ...state.commands,
                        { command_name: "", command_description: "" },
                      ],
                    })
                  }
                  className="text-[11px] flex items-center gap-1 px-2 py-1 border border-primary text-primary rounded hover:bg-gold-soft"
                >
                  <Plus size={12} />
                  إضافة أمر
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              عند كتابة <code className="bg-gray-100 px-1 rounded">/</code> في
              الواتساب تظهر هذه الأوامر كقائمة منسدلة. الاسم لاتيني فقط بدون
              فراغات (مثل: <code>/booking</code>)، الوصف عربي مختصر.
            </p>
            {state.commands.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-2">
                لا أوامر — اختياري.
              </div>
            ) : (
              <div className="space-y-2">
                {state.commands.map((c, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[8rem_1fr_auto] items-center gap-2"
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">/</span>
                      <input
                        type="text"
                        value={c.command_name}
                        onChange={(e) =>
                          setState({
                            ...state,
                            commands: state.commands.map((x, idx) =>
                              idx === i
                                ? {
                                    ...x,
                                    command_name: e.target.value
                                      .toLowerCase()
                                      .replace(/[^a-z0-9_]/g, ""),
                                  }
                                : x,
                            ),
                          })
                        }
                        placeholder="booking"
                        maxLength={32}
                        className="input direction-ltr text-right"
                      />
                    </div>
                    <input
                      type="text"
                      value={c.command_description}
                      onChange={(e) =>
                        setState({
                          ...state,
                          commands: state.commands.map((x, idx) =>
                            idx === i
                              ? { ...x, command_description: e.target.value }
                              : x,
                          ),
                        })
                      }
                      maxLength={256}
                      placeholder="وصف الأمر بالعربية"
                      className="input"
                    />
                    <button
                      onClick={() =>
                        setState({
                          ...state,
                          commands: state.commands.filter(
                            (_, idx) => idx !== i,
                          ),
                        })
                      }
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Can permission="settings.whatsapp:edit">
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                حفظ الإعدادات على Meta
              </button>
            </Can>
          </div>
        </>
      )}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border: 1px solid rgb(229 231 235);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
          outline: none;
          border-color: var(--color-primary, rgb(180 83 9));
          box-shadow: 0 0 0 2px rgba(180, 83, 9, 0.15);
        }
      `}</style>
    </section>
  );
}
