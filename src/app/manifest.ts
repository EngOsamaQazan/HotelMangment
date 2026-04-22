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
 * الأيقونات (192×192 و512×512) تأتي من مجلد `public/` المولَّد سابقاً
 * بواسطة `scripts/_gen-brand-icons.cjs`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.nameAr,
    short_name: SITE.nameAr,
    description: SITE.descriptionAr,
    start_url: "/landing",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFFFF",
    theme_color: "#0E3B33",
    lang: "ar",
    dir: "rtl",
    categories: ["travel", "hotel", "lifestyle"],
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
