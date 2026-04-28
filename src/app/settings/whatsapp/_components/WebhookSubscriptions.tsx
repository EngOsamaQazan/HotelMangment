"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Webhook,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Trash2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Can } from "@/components/Can";

/**
 * WebhookSubscriptions — surfaces WHICH apps receive this WABA's webhook
 * events and lets the operator subscribe / unsubscribe directly. Without
 * an active subscription Meta will NOT call our `/api/whatsapp/webhook`,
 * which is the #1 cause of "messages not arriving in the inbox".
 */

interface AppSub {
  whatsapp_business_api_data?: {
    id: string;
    name?: string;
    link?: string;
    category?: string;
  };
  override_callback_uri?: string;
}

export function WebhookSubscriptions() {
  const [apps, setApps] = useState<AppSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/subscriptions", {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "تعذّر التحميل");
      setApps(Array.isArray(j.apps) ? j.apps : []);
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

  async function subscribe() {
    setActing(true);
    try {
      const res = await fetch("/api/whatsapp/subscriptions", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل الاشتراك");
      toast.success("تم اشتراك التطبيق — الـ webhook الآن نشط");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الاشتراك");
    } finally {
      setActing(false);
    }
  }

  async function unsubscribe() {
    if (
      !confirm(
        "إلغاء الاشتراك سيوقف وصول رسائل الضيوف للنظام تماماً. هل أنت متأكد؟",
      )
    ) {
      return;
    }
    setActing(true);
    try {
      const res = await fetch("/api/whatsapp/subscriptions", { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل الإلغاء");
      toast.success("تم إلغاء الاشتراك");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الإلغاء");
    } finally {
      setActing(false);
    }
  }

  return (
    <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Webhook size={20} className="text-primary" />
          <h2 className="text-lg font-bold text-gray-800">
            اشتراكات الـ Webhook
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
          تحديث
        </button>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        لكي يستقبل النظام رسائل الضيوف وأحداث Meta (delivered/read/failed)
        يجب أن يكون التطبيق مشتركاً (subscribed_apps) في حساب الـ WABA.
        إذا كانت القائمة فارغة فالرسائل لن تصلك حتى لو ضبطت Callback URL.
      </p>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      ) : (
        <>
          <div
            className={`rounded-xl border p-3 flex items-center gap-2 text-sm ${
              apps.length > 0
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            {apps.length > 0 ? (
              <CheckCircle2 size={16} />
            ) : (
              <XCircle size={16} />
            )}
            <span>
              {apps.length > 0
                ? `${apps.length} تطبيق مشترك — webhook نشط`
                : "لا يوجد تطبيق مشترك — webhook معطّل"}
            </span>
          </div>

          {apps.length > 0 && (
            <div className="space-y-2">
              {apps.map((app, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg p-3"
                >
                  <div className="text-sm">
                    <div className="font-medium text-gray-800">
                      {app.whatsapp_business_api_data?.name ?? "تطبيق غير مسمّى"}
                    </div>
                    <div className="text-[11px] text-gray-500 direction-ltr text-right">
                      ID: {app.whatsapp_business_api_data?.id ?? "—"}
                    </div>
                    {app.override_callback_uri && (
                      <div className="text-[11px] text-gray-500 direction-ltr text-right">
                        Callback: {app.override_callback_uri}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Can permission="settings.whatsapp:edit">
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={subscribe}
                disabled={acting}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm disabled:opacity-50"
              >
                {acting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                اشتراك التطبيق الحالي
              </button>
              {apps.length > 0 && (
                <button
                  onClick={unsubscribe}
                  disabled={acting}
                  className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  إلغاء اشتراك التطبيق الحالي
                </button>
              )}
            </div>
          </Can>
        </>
      )}
    </section>
  );
}
