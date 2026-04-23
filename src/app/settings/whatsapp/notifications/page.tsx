"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellOff,
  ChevronLeft,
  Loader2,
  Moon,
  Save,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWhatsAppPush } from "@/lib/whatsapp/hooks/useWhatsAppPush";
import { useWhatsAppSound } from "@/lib/whatsapp/hooks/useWhatsAppSound";

interface Prefs {
  pushEnabled: boolean;
  soundEnabled: boolean;
  soundKey: string;
  notifyScope: "all" | "mine" | "none";
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

/**
 * Per-user WhatsApp notification settings:
 *   • Browser push toggle with install + permission flow
 *   • Sound on/off + preview
 *   • Notification scope (mine / all / none)
 *   • Quiet hours window (no sound / no push)
 */
export default function WhatsAppNotificationSettings() {
  const push = useWhatsAppPush();
  const sound = useWhatsAppSound(true);

  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/notification-prefs", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("فشل التحميل");
      const data = (await res.json()) as Prefs;
      setPrefs(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: Partial<Prefs>) {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("فشل الحفظ");
      const data = (await res.json()) as Prefs;
      setPrefs(data);
      toast.success("تم الحفظ");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="pt-2 sm:pt-4 border-b-2 border-gold/30 pb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-block w-1 h-8 bg-gold rounded-full" />
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-green-50 border border-green-200">
            <Bell size={22} className="text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary font-[family-name:var(--font-amiri)] tracking-tight">
              إشعارات واتساب
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              إعدادات الإشعارات الصوتية والدفع (Push) لهذا المستخدم
            </p>
          </div>
        </div>
        <Link
          href="/settings/whatsapp"
          className="flex items-center gap-1 text-sm px-3 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          <ChevronLeft size={16} />
          إعدادات واتساب
        </Link>
      </div>

      {loading || !prefs ? (
        <div className="bg-card-bg rounded-xl shadow-sm p-12 text-center">
          <Loader2 size={22} className="animate-spin text-primary inline-block" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* ─── Push ─── */}
          <section className="bg-card-bg rounded-xl shadow-sm p-5 space-y-4">
            <header className="flex items-center gap-2">
              <Bell size={18} className="text-primary" />
              <h2 className="font-bold text-gray-800">الإشعارات المكتبية</h2>
            </header>
            <p className="text-sm text-gray-500 leading-relaxed">
              تصلك إشعارات حتى لو كان المتصفح مغلقًا، كأنها تطبيق WhatsApp.
              نستخدم <strong>Web Push</strong> عبر Service Worker.
            </p>
            {!push.isSupported ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                متصفحك لا يدعم Web Push.
              </div>
            ) : push.permission === "denied" ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                الإشعارات محظورة من إعدادات المتصفح — فعّلها من شريط العنوان
                ثم عد إلى هذه الصفحة.
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {push.isSubscribed ? (
                  <>
                    <button
                      onClick={async () => {
                        const ok = await push.unsubscribe();
                        if (ok) toast.success("تم إيقاف الإشعارات");
                      }}
                      className="flex items-center gap-1.5 text-sm px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                    >
                      <BellOff size={14} />
                      إيقاف على هذا الجهاز
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await push.testPush();
                        if (ok) toast.success("أُرسلت اختبارية — راقب الإشعار.");
                        else toast.error("فشل إرسال الاختبار");
                      }}
                      className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <Bell size={14} />
                      اختبار الإشعار
                    </button>
                  </>
                ) : (
                  <button
                    onClick={async () => {
                      const ok = await push.subscribe();
                      if (ok) toast.success("تم التفعيل — جرّب الاختبار");
                      else toast.error(push.error ?? "فشل");
                    }}
                    disabled={push.loading}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
                  >
                    {push.loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Bell size={14} />
                    )}
                    تفعيل الإشعارات المكتبية
                  </button>
                )}
                <label className="flex items-center gap-2 ms-auto text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={prefs.pushEnabled}
                    onChange={(e) => save({ pushEnabled: e.target.checked })}
                  />
                  تمكين Push في حسابي
                </label>
              </div>
            )}
          </section>

          {/* ─── Sound ─── */}
          <section className="bg-card-bg rounded-xl shadow-sm p-5 space-y-4">
            <header className="flex items-center gap-2">
              <Volume2 size={18} className="text-primary" />
              <h2 className="font-bold text-gray-800">التنبيه الصوتي</h2>
            </header>
            <p className="text-sm text-gray-500 leading-relaxed">
              نغمة قصيرة عند وصول رسالة جديدة داخل الموقع. تعمل فقط بعد
              تفاعل المستخدم مع الصفحة (قيود المتصفح).
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.soundEnabled}
                onChange={(e) => save({ soundEnabled: e.target.checked })}
              />
              تفعيل الصوت
            </label>
            <button
              onClick={() => sound.play()}
              className="flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Volume2 size={14} />
              اختبار الصوت
            </button>
          </section>

          {/* ─── Scope ─── */}
          <section className="bg-card-bg rounded-xl shadow-sm p-5 space-y-4">
            <header className="flex items-center gap-2">
              <Bell size={18} className="text-primary" />
              <h2 className="font-bold text-gray-800">نطاق الإشعارات</h2>
            </header>
            <p className="text-sm text-gray-500">
              تحدد أي الرسائل تُشعرني بها.
            </p>
            <div className="space-y-2">
              {(
                [
                  { k: "mine", label: "محادثاتي فقط (والمحادثات غير المسندة)" },
                  { k: "all", label: "كل المحادثات — مفيد للمشرفين" },
                  { k: "none", label: "لا شيء — صامت تمامًا" },
                ] as const
              ).map((s) => (
                <label
                  key={s.k}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg cursor-pointer",
                    prefs.notifyScope === s.k
                      ? "bg-gold-soft border border-primary"
                      : "hover:bg-gray-50 border border-transparent",
                  )}
                >
                  <input
                    type="radio"
                    name="scope"
                    checked={prefs.notifyScope === s.k}
                    onChange={() => save({ notifyScope: s.k })}
                  />
                  <span className="text-sm">{s.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* ─── Quiet hours ─── */}
          <section className="bg-card-bg rounded-xl shadow-sm p-5 space-y-4">
            <header className="flex items-center gap-2">
              <Moon size={18} className="text-primary" />
              <h2 className="font-bold text-gray-800">ساعات الهدوء</h2>
            </header>
            <p className="text-sm text-gray-500">
              فترة يوميّة لن تصلك فيها إشعارات صوتية أو مكتبية.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const start = String(f.get("start") ?? "");
                const end = String(f.get("end") ?? "");
                save({
                  quietHoursStart: start || null,
                  quietHoursEnd: end || null,
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">من</span>
                  <input
                    name="start"
                    type="time"
                    defaultValue={prefs.quietHoursStart ?? ""}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">إلى</span>
                  <input
                    name="end"
                    type="time"
                    defaultValue={prefs.quietHoursEnd ?? ""}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 text-sm px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                حفظ ساعات الهدوء
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
