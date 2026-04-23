"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Manages the Web Push lifecycle for the WhatsApp inbox.
 *
 *   isSupported   — `PushManager`, `serviceWorker`, `Notification` all present.
 *   permission    — current Notification.permission value.
 *   isSubscribed  — `pushManager.getSubscription()` returned non-null.
 *   subscribe()   — registers /sw.js, requests permission, subscribes, posts
 *                    the endpoint to /api/whatsapp/push/subscribe.
 *   unsubscribe() — calls `subscription.unsubscribe()` and deletes the row
 *                    on the server.
 *   testPush()    — fires a dummy push via /api/whatsapp/push/test.
 */
export interface WhatsAppPushState {
  isSupported: boolean;
  permission: NotificationPermission | "default";
  isSubscribed: boolean;
  loading: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  testPush: () => Promise<boolean>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

export function useWhatsAppPush(): WhatsAppPushState {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);
    if (!supported) return;
    setPermission(Notification.permission);
    navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("تم رفض إذن الإشعارات من المتصفح.");
        return false;
      }

      const reg =
        (await navigator.serviceWorker.getRegistration("/sw.js")) ||
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/whatsapp/push/vapid-public-key");
      if (!keyRes.ok) {
        setError("VAPID غير مُعدّ على الخادم.");
        return false;
      }
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
            .buffer as ArrayBuffer,
        });
      }

      const json = sub.toJSON();
      const res = await fetch("/api/whatsapp/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? "تعذّر تسجيل الإشعارات.");
        return false;
      }
      setIsSubscribed(true);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/whatsapp/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setIsSubscribed(false);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const testPush = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/whatsapp/push/test", { method: "POST" });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
    testPush,
  };
}
