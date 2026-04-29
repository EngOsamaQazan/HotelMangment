/**
 * Seeds the default Cost Center hierarchy for this property.
 *
 * Business profile (locked-in for the seed):
 *   • 1 building, 15 units, 3 unit-type families (Studio, Apartment, Hotel-Room)
 *   • 3 partners share the entire property by equity ratio (no per-unit ownership)
 *
 * Therefore the recommended USALI-aligned structure is:
 *
 *   CC-100  العمليات الفندقية         (parent)
 *     CC-110  الإدارة العامة (G&A)
 *     CC-120  الاستقبال
 *     CC-130  التدبير والنظافة
 *     CC-140  الصيانة
 *     CC-150  التسويق والمبيعات
 *     CC-160  المرافق المشتركة (كهرباء/ماء/إنترنت)
 *
 *   CC-200  مراكز الإيراد              (parent)
 *     CC-210  إيراد الغرف الفندقية
 *     CC-220  إيراد الاستوديوهات
 *     CC-230  إيراد الشقق
 *     CC-290  إيرادات إضافية وخدمات الضيف
 *
 * Why this shape:
 *   • Departmental cost centers = where managerial responsibility lives
 *     (cleaning manager owns CC-130, front-office owns CC-120, …).
 *   • Revenue centers per UNIT TYPE (not per unit) so the GM can see
 *     "are studios more profitable per night than hotel rooms?" without
 *     drowning in 15 noisy per-unit centers.
 *   • Partners do NOT need their own CCs — they share net profit by equity.
 *
 * Safe to re-run anytime (uses upsert by code).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CostCenterSeed = {
  code: string;
  name: string;
  description?: string;
  parent?: string;
};

const COST_CENTERS: CostCenterSeed[] = [
  // ─────────── Operating departments ───────────
  {
    code: "CC-100",
    name: "العمليات الفندقية",
    description: "تجميعة لكافة مراكز التكلفة التشغيلية للمبنى",
  },
  {
    code: "CC-110",
    name: "الإدارة العامة",
    parent: "CC-100",
    description:
      "رواتب الإدارة، إيجار مكاتب، أتعاب مهنية، رخص، ومصاريف عامة لا تنسب لقسم تشغيلي محدد",
  },
  {
    code: "CC-120",
    name: "الاستقبال",
    parent: "CC-100",
    description: "رواتب موظفي الاستقبال، قرطاسية، نظام الحجز، باقات الترحيب",
  },
  {
    code: "CC-130",
    name: "التدبير والنظافة",
    parent: "CC-100",
    description:
      "رواتب التدبير، مواد التنظيف، البياضات، الغسيل، مستهلكات الضيف (شامبو، صابون، مناديل)",
  },
  {
    code: "CC-140",
    name: "الصيانة",
    parent: "CC-100",
    description:
      "رواتب الصيانة، قطع غيار، أعمال السباكة والكهرباء، عقود الصيانة الدورية للمكيفات والمصاعد",
  },
  {
    code: "CC-150",
    name: "التسويق والمبيعات",
    parent: "CC-100",
    description:
      "إعلانات Booking.com وميتا وجوجل، تصوير، عمولات قنوات الحجز، عروض ترويجية",
  },
  {
    code: "CC-160",
    name: "المرافق المشتركة",
    parent: "CC-100",
    description:
      "الكهرباء، الماء، الإنترنت، الغاز، رسوم المياه/المجاري — للمناطق المشتركة وما لا يُنسب لوحدة محددة",
  },

  // ─────────── Revenue centers (by unit-type family) ───────────
  {
    code: "CC-200",
    name: "مراكز الإيراد",
    description:
      "تجميعة الإيرادات حسب نوع الوحدة لقياس الربحية النسبية لكل عائلة",
  },
  {
    code: "CC-210",
    name: "إيراد الغرف الفندقية",
    parent: "CC-200",
    description:
      "إيرادات الحجوزات للوحدات من نوع HTL-* (كينج، توين، ثلاثية، رباعية، VIP)",
  },
  {
    code: "CC-220",
    name: "إيراد الاستوديوهات",
    parent: "CC-200",
    description: "إيرادات الحجوزات للوحدات من نوع STUDIO",
  },
  {
    code: "CC-230",
    name: "إيراد الشقق",
    parent: "CC-200",
    description:
      "إيرادات الحجوزات للوحدات من نوع APT-* (غرفة نوم، غرفتين، إلخ)",
  },
  {
    code: "CC-290",
    name: "إيرادات إضافية وخدمات الضيف",
    parent: "CC-200",
    description:
      "تمديدات الحجز، خدمات إضافية (ليلة إضافية، late-checkout)، إيرادات خارج الإقامة",
  },
];

export async function seedCostCenters() {
  console.log("🎯 بذر مراكز التكلفة الافتراضية...");

  // Two-pass upsert so children always find their parent.
  const codeToId = new Map<string, number>();

  for (const cc of COST_CENTERS) {
    const existing = await prisma.costCenter.findUnique({
      where: { code: cc.code },
    });
    const created = await prisma.costCenter.upsert({
      where: { code: cc.code },
      update: {
        name: cc.name,
        description: cc.description ?? null,
      },
      create: {
        code: cc.code,
        name: cc.name,
        description: cc.description ?? null,
        isActive: true,
      },
    });
    codeToId.set(cc.code, created.id);

    if (!existing) {
      console.log(`  ➕ ${cc.code}  ${cc.name}`);
    }
  }

  // Second pass: wire parents.
  for (const cc of COST_CENTERS) {
    if (!cc.parent) continue;
    const parentId = codeToId.get(cc.parent);
    if (!parentId) continue;
    await prisma.costCenter.update({
      where: { code: cc.code },
      data: { parentId },
    });
  }

  console.log(`✅ تم بذر ${COST_CENTERS.length} مركز تكلفة`);
}

if (require.main === module) {
  seedCostCenters()
    .catch((e) => {
      console.error("❌ خطأ:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
