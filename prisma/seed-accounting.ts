import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type AccountSeed = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  subtype?: string;
  normalBalance: "debit" | "credit";
  parent?: string;
  isSystem?: boolean;
  description?: string;
};

const ACCOUNTS: AccountSeed[] = [
  { code: "1000", name: "الأصول", type: "asset", normalBalance: "debit", isSystem: true },
  { code: "1010", name: "الصندوق النقدي", type: "asset", subtype: "cash", normalBalance: "debit", parent: "1000", isSystem: true, description: "الصندوق النقدي الرئيسي للفندق" },
  { code: "1020", name: "الحساب البنكي", type: "asset", subtype: "bank", normalBalance: "debit", parent: "1000", isSystem: true, description: "حساب الفندق في البنك" },
  { code: "1030", name: "المحفظة الإلكترونية", type: "asset", subtype: "wallet", normalBalance: "debit", parent: "1000", isSystem: true, description: "المحفظة الإلكترونية/الرقمية (CliQ, eFAWATEERcom, ...)" },
  { code: "1100", name: "ذمم الضيوف", type: "asset", subtype: "ar", normalBalance: "debit", parent: "1000", isSystem: true, description: "المبالغ المستحقة على الضيوف" },
  { code: "1110", name: "ذمم مدينة أخرى", type: "asset", subtype: "ar", normalBalance: "debit", parent: "1000", isSystem: true },

  { code: "2000", name: "الخصوم", type: "liability", normalBalance: "credit", isSystem: true },
  { code: "2010", name: "ذمم الموردين", type: "liability", subtype: "ap", normalBalance: "credit", parent: "2000", isSystem: true },
  { code: "2100", name: "حسابات الشركاء الجارية", type: "liability", subtype: "ap", normalBalance: "credit", parent: "2000", isSystem: true },
  { code: "2110", name: "مستحقات الموظفين", type: "liability", subtype: "ap", normalBalance: "credit", parent: "2000", isSystem: true },
  { code: "2120", name: "تأمينات صحية مستحقة", type: "liability", subtype: "ap", normalBalance: "credit", parent: "2000", isSystem: true, description: "اقتطاعات التأمين الصحي على الموظفين، تُسدّد للجهة المؤمِّنة" },
  { code: "2130", name: "ذمم محاكم وجهات حكومية", type: "liability", subtype: "ap", normalBalance: "credit", parent: "2000", isSystem: true, description: "اقتطاعات أحكام محاكم أو جهات حكومية من رواتب الموظفين" },
  { code: "2140", name: "رسوم تصاريح عمل مستحقة", type: "liability", subtype: "ap", normalBalance: "credit", parent: "2000", isSystem: true, description: "اقتطاعات رسوم تصاريح العمل التي يتحمّلها الموظف" },
  { code: "2150", name: "خصومات راتب أخرى", type: "liability", subtype: "ap", normalBalance: "credit", parent: "2000", isSystem: true, description: "حساب افتراضي للخصومات التي لا تخصّ جهة محدّدة" },
  { code: "2200", name: "قروض وسلف", type: "liability", subtype: "ap", normalBalance: "credit", parent: "2000", isSystem: true },

  { code: "3000", name: "حقوق الملكية", type: "equity", normalBalance: "credit", isSystem: true },
  { code: "3010", name: "رأس المال", type: "equity", subtype: "capital", normalBalance: "credit", parent: "3000", isSystem: true },
  { code: "3020", name: "المسحوبات", type: "equity", subtype: "drawing", normalBalance: "debit", parent: "3000", isSystem: true },
  { code: "3100", name: "الأرباح المرحّلة", type: "equity", subtype: "retained", normalBalance: "credit", parent: "3000", isSystem: true },

  { code: "4000", name: "الإيرادات", type: "revenue", normalBalance: "credit", isSystem: true },
  { code: "4010", name: "إيرادات الغرف", type: "revenue", normalBalance: "credit", parent: "4000", isSystem: true },
  { code: "4020", name: "إيرادات أخرى", type: "revenue", normalBalance: "credit", parent: "4000", isSystem: true },

  { code: "5000", name: "المصروفات", type: "expense", normalBalance: "debit", isSystem: true },
  { code: "5010", name: "الرواتب والأجور", type: "expense", normalBalance: "debit", parent: "5000", isSystem: true },
  { code: "5020", name: "كهرباء وماء وإنترنت", type: "expense", normalBalance: "debit", parent: "5000", isSystem: true },
  { code: "5030", name: "الصيانة", type: "expense", normalBalance: "debit", parent: "5000", isSystem: true },
  { code: "5040", name: "الضيافة", type: "expense", normalBalance: "debit", parent: "5000", isSystem: true },
  { code: "5050", name: "مصروفات متنوعة", type: "expense", normalBalance: "debit", parent: "5000", isSystem: true },
];

export async function seedAccounting() {
  console.log("📒 بذر دليل الحسابات الافتراضي...");

  for (const acc of ACCOUNTS) {
    const parentId = acc.parent
      ? (await prisma.account.findUnique({ where: { code: acc.parent } }))?.id
      : null;

    await prisma.account.upsert({
      where: { code: acc.code },
      update: {
        name: acc.name,
        type: acc.type,
        subtype: acc.subtype ?? null,
        normalBalance: acc.normalBalance,
        parentId: parentId ?? null,
        isSystem: acc.isSystem ?? false,
        description: acc.description ?? null,
      },
      create: {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subtype: acc.subtype ?? null,
        normalBalance: acc.normalBalance,
        parentId: parentId ?? null,
        isSystem: acc.isSystem ?? false,
        description: acc.description ?? null,
      },
    });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  await prisma.fiscalPeriod.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { year, month, status: "open" },
  });

  console.log(`✅ تم بذر ${ACCOUNTS.length} حساب + فتح فترة ${month}/${year}`);
}

if (require.main === module) {
  seedAccounting()
    .catch((e) => {
      console.error("❌ خطأ:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
