import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Dynamic robots.txt served at `/robots.txt`.
 *
 * نسمح بفهرسة الواجهات العامّة فقط (الصفحة التسويقية، الحجز، صفحات
 * تفاصيل الأنواع، الصفحات القانونية) ونحظر كل ما يخصّ لوحة تحكّم
 * الموظفين وحساب الضيف الشخصي وAPI.
 *
 * هذا يحلّ محل `public/robots.txt` القديم — Next.js يُفضّل هذا الملف
 * المُولَّد ديناميكياً لأنه يقرأ `SITE_URL` من البيئة تلقائياً.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/landing",
          "/book",
          "/book/type/",
          "/about",
          "/privacy",
          "/terms",
          "/api/files/unit-type-photo/",
          "/api/files/unit-photo/",
        ],
        disallow: [
          "/",
          "/api/",
          "/account/",
          "/reservations/",
          "/rooms/",
          "/guests/",
          "/accounting/",
          "/finance/",
          "/reports/",
          "/settings/",
          "/tasks/",
          "/maintenance/",
          "/chat/",
          "/whatsapp/",
          "/profile/",
          "/signin",
          "/signup",
          "/login",
          "/book/checkout",
          "/book/confirm/",
          "/book/voucher/",
        ],
      },
      // Explicitly block the AI data-scrapers. Legit search-engine crawlers
      // keep working through the wildcard rule above.
      {
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "CCBot",
          "anthropic-ai",
          "Claude-Web",
          "Google-Extended",
          "PerplexityBot",
        ],
        disallow: ["/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
