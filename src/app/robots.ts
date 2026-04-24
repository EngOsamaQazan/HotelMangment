import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/seo/site";
import { classifyHost } from "@/lib/hosts";

/**
 * Dynamic robots.txt served at `/robots.txt`.
 *
 * نسمح بفهرسة الواجهات العامّة فقط (الصفحة التسويقية، الحجز، صفحات
 * تفاصيل الأنواع، الصفحات القانونية) ونحظر كل ما يخصّ لوحة تحكّم
 * الموظفين وحساب الضيف الشخصي وAPI.
 *
 * إضافة: إذا وصل الطلب من نطاق الإدارة (`admin.mafhotel.com`) نُرجع
 * `Disallow: /` لجميع الزواحف — لا شيء على هذا النطاق معدّ للفهرسة.
 *
 * هذا يحلّ محل `public/robots.txt` القديم — Next.js يُفضّل هذا الملف
 * المُولَّد ديناميكياً لأنه يقرأ `SITE_URL` من البيئة تلقائياً.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostKind = classifyHost((await headers()).get("host"));

  if (hostKind === "admin") {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

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
