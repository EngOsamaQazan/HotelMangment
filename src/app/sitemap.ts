import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { buildUnitTypeSlug } from "@/lib/booking/slug";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Dynamic sitemap served at `/sitemap.xml`.
 *
 * نولد هنا خريطة شاملة تضم:
 *   • الصفحات الثابتة ذات الأولوية العالية (الصفحة الرئيسية، الحجز،
 *     about، privacy، terms، landing).
 *   • صفحة تفصيل لكل نوع وحدة متاح للحجز عبر الإنترنت (UnitType نشطة
 *     ومعلّمة publiclyBookable) باستخدام الـslug النظيف.
 *
 * جوجل تفضّل `lastModified` حقيقية، لذا نستخدم `updatedAt` الخاص بكل
 * UnitType. ولتفادي إبطاء بناء الصفحة بحقنها في كل طلب، نجعل نتيجة
 * هذه الدالّة قابلة لإعادة التوليد كل ساعة.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static, high-priority public pages. Admin routes stay out via robots.ts.
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/landing`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/book`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.95,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  let dynamicEntries: MetadataRoute.Sitemap = [];
  try {
    const unitTypes = await prisma.unitType.findMany({
      where: { isActive: true, publiclyBookable: true },
      select: {
        id: true,
        code: true,
        nameEn: true,
        createdAt: true,
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    dynamicEntries = unitTypes.map((t) => ({
      url: `${SITE_URL}/book/type/${buildUnitTypeSlug(t.nameEn, t.code, t.id)}`,
      lastModified: t.createdAt ?? now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
  } catch {
    // If the DB is briefly unavailable during build we ship the static
    // portion rather than failing the whole sitemap.
    dynamicEntries = [];
  }

  return [...staticEntries, ...dynamicEntries];
}
