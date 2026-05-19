"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useInstallPWA
 * -------------
 * يدير دورة حياة تثبيت الـ PWA من داخل التطبيق، ويكشف ما إذا كان الجهاز
 * قابلًا للتثبيت البرمجي (`beforeinstallprompt` على Chrome/Edge Android
 * و Chrome/Edge Desktop) أم يحتاج إلى إرشاد يدوي (Safari iOS لا يدعم
 * prompt برمجيًّا — يجب على المستخدم استخدام «مشاركة → إضافة إلى الشاشة
 * الرئيسية»).
 *
 * **لماذا؟** عند فتح الموقع من داخل تبويب متصفّح عادي، يُظهر الأندرويد
 * أيقونة المتصفّح (Chrome) كمصدر للإشعار — وهذا قيد من نظام التشغيل لا
 * يمكن تجاوزه برمجيًّا. عند تثبيت الموقع كتطبيق، تحلّ هويّة الـ PWA
 * (اسم الفندق + أيقونته) محلّ Chrome، ويصبح الإشعار كإشعارات التطبيقات
 * الأصليّة.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function getInstalledState() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getIOSState() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export interface InstallPWAState {
  /** الحدث جاهز → يمكن استدعاء `install()` مباشرة (Android/Chrome/Edge). */
  canInstall: boolean;
  /** التطبيق مثبَّت فعلًا (display-mode: standalone) أو تمّ التثبيت للتو. */
  isInstalled: boolean;
  /** المنصّة ديفوس iOS/Safari → نعرض إرشادات يدوية بدلاً من زر. */
  isIOS: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export function useInstallPWA(): InstallPWAState {
  const [deferred, setDeferred] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(getInstalledState);
  const [isIOS] = useState(getIOSState);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Capture the prompt event for later programmatic use.
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setIsInstalled(true);
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<
    "accepted" | "dismissed" | "unavailable"
  > => {
    if (!deferred) return "unavailable";
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      return choice.outcome;
    } catch {
      return "unavailable";
    }
  }, [deferred]);

  return {
    canInstall: !!deferred && !isInstalled,
    isInstalled,
    isIOS,
    install,
  };
}
