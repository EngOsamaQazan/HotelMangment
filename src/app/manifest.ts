import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo/site";

/**
 * PWA manifest served at `/manifest.webmanifest`.
 *
 * وجود ملف manifest ديناميكي:
 *   • يحسّن Lighthouse PWA score (يُؤخذ كإشارة جودة في جوجل).
 *   • يسمح بإضافة الموقع كتطبيق على الشاشة الرئيسية لجهاز الزائر.
 *   • يُستخدم من سفاري/أندرويد لتحديد لون الحالة (theme_color).
 *
 * الأيقونات تأتي من مجلد `public/` وتُولَّد بواسطة
 * `scripts/_gen-brand-icons.cjs` انطلاقًا من صورة الهوية المعتمدة
 * `public/brand-icon-source.png` (مربّع أخضر مع «المفرق HOTEL» الذهبي).
 * النسخة maskable تحتوي مساحة أمان (safe zone) إضافية حتى لا يُقصّ
 * الشعار عند تطبيق قناع الأندرويد الدائري/المستدير.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` صريح (وليس start_url) لنتمكّن من تثبيت تطبيق طاقم منفصل
    // (id: "/staff", يُقدَّم من `/staff-manifest.webmanifest`) على نفس
    // الأصل. بدون حقل `id` مختلف، يعامل Chrome التطبيقَين كتطبيق واحد.
    id: "/",
    name: SITE.nameAr,
    short_name: SITE.nameAr,
    description: SITE.descriptionAr,
    start_url: "/landing",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0E3B33",
    theme_color: "#0E3B33",
    lang: "ar",
    dir: "rtl",
    categories: ["travel", "hotel", "lifestyle"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
