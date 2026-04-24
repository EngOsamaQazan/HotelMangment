"use client";

import { useEffect } from "react";

/**
 * StaffManifestSwitch
 * -------------------
 * يبدّل وسم `<link rel="manifest">` المُولَّد من ميتاداتا الجذر (ضيف)
 * إلى `/staff-manifest.webmanifest` (طاقم) طالما المستخدم داخل شاشة
 * تابعة للّوحة الإدارية.
 *
 * لماذا؟
 *   • المتصفّح يأخذ بيانات الـ PWA من الـ manifest النشط وقت
 *     `beforeinstallprompt`. إن كان ضيف → يُثبَّت تطبيق الضيف.
 *   • نريد أنّ أيّ موظّف ينقر «تثبيت التطبيق» من داخل لوحة الإدارة
 *     (مثل `/settings/whatsapp/notifications`) يحصل على نسخة الطاقم
 *     (id مختلف، start_url = `/whatsapp`، أيقونة مميّزة).
 *
 * التنفيذ:
 *   نحافظ على `href` الأصلي ونُعيده عند الـ unmount (عندما يعود
 *   المستخدم لصفحات عامّة)، فيصبح التطبيق عمليًّا «ذكيًّا»:
 *   يعرض manifest الطاقم لصفحات الطاقم و manifest الضيف لصفحات الضيف.
 */
const STAFF_MANIFEST_HREF = "/staff-manifest.webmanifest";

export function StaffManifestSwitch() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]'
    );
    if (!link) return;

    const original = link.getAttribute("href");
    // لا نفعل شيئًا إن كنّا أصلًا على manifest الطاقم (تفادي loops).
    if (original === STAFF_MANIFEST_HREF) return;

    link.setAttribute("href", STAFF_MANIFEST_HREF);

    return () => {
      if (original) {
        link.setAttribute("href", original);
      }
    };
  }, []);

  return null;
}
