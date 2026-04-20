/**
 * Seeds realistic demo task boards for a hotel operation.
 *
 * Creates 4 Kanban boards that mirror real hotel workflows:
 *   1. الصيانة اليومية
 *   2. الاستقبال والحجوزات
 *   3. التنظيف والإشراف الداخلي
 *   4. تجربة النزيل والشكاوى
 *
 * Each board has columns, labels, cards with priorities, due dates,
 * descriptions, checklists, comments, assignees, and activity log entries.
 *
 * Idempotent: reruns skip boards that already exist (matched by name).
 *
 *   npx ts-node --project tsconfig.scripts.json scripts/seed-demo-tasks.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────
// Types describing the shape of the demo data
// ────────────────────────────────────────────────────────────
type Priority = "low" | "med" | "high" | "urgent";

interface DemoCard {
  title: string;
  description?: string;
  priority?: Priority;
  /** Days offset from "now" for the due date. Negative = overdue. */
  dueInDays?: number;
  /** Label names (must exist in the board's label list). */
  labels?: string[];
  /** Assignee user-ids (resolved at runtime). */
  assignees?: "all" | "owner" | number[];
  checklist?: { text: string; done: boolean }[];
  comments?: { body: string; daysAgo?: number }[];
  /** If set, card is already completed. */
  completedDaysAgo?: number;
  /** Which column name this card belongs to (must exist in board.columns). */
  column: string;
}

interface DemoBoard {
  name: string;
  description: string;
  color: string;
  columns: string[];
  labels: { name: string; color: string }[];
  cards: DemoCard[];
}

// ────────────────────────────────────────────────────────────
// Demo data — designed to feel like real hotel ops
// ────────────────────────────────────────────────────────────
const BOARDS: DemoBoard[] = [
  {
    name: "الصيانة اليومية",
    description:
      "متابعة أعطال الغرف والمرافق والصيانة الدورية (تكييف، سباكة، كهرباء، أثاث).",
    color: "#ef4444",
    columns: ["وارد", "قيد التنفيذ", "بانتظار قطعة", "منجز"],
    labels: [
      { name: "تكييف", color: "#0ea5e9" },
      { name: "سباكة", color: "#3b82f6" },
      { name: "كهرباء", color: "#f59e0b" },
      { name: "أثاث", color: "#8b5cf6" },
      { name: "عاجل", color: "#dc2626" },
      { name: "صيانة دورية", color: "#10b981" },
    ],
    cards: [
      {
        column: "وارد",
        title: "غرفة 305 — مكيف لا يبرّد",
        description:
          "النزيل أبلغ الاستقبال صباحاً عن عدم برودة المكيف. ريموت المكيف يعمل والأنوار تضيء لكن الهواء دافئ. يحتمل نقص فريون أو مشكلة مكثّف.",
        priority: "urgent",
        dueInDays: 0,
        labels: ["تكييف", "عاجل"],
        assignees: "owner",
        checklist: [
          { text: "فحص ضغط الفريون", done: false },
          { text: "تنظيف الفلاتر", done: false },
          { text: "فحص المكثّف الخارجي", done: false },
          { text: "اختبار التشغيل ١٥ دقيقة", done: false },
        ],
        comments: [
          {
            body: "النزيل مستعجل — عنده اجتماع عمل بعد الظهر.",
            daysAgo: 0,
          },
        ],
      },
      {
        column: "وارد",
        title: "غرفة 118 — تسريب تحت المغسلة",
        description:
          "الطاقم لاحظ بقعة ماء على أرضية الحمام. يحتاج فحص وصلات سيفون المغسلة.",
        priority: "high",
        dueInDays: 0,
        labels: ["سباكة"],
      },
      {
        column: "وارد",
        title: "المصعد الرئيسي — صوت غير طبيعي عند الإقلاع",
        description:
          "عند الصعود من الأرضي للأول يصدر صوت طقطقة خفيفة. يحتاج فحص دولاب السحب والكابلات.",
        priority: "high",
        dueInDays: 1,
        labels: ["صيانة دورية"],
      },
      {
        column: "قيد التنفيذ",
        title: "غرفة 402 — قابس الشحن بجانب السرير لا يعمل",
        description:
          "تم فتح البلاطة، يبدو أن السلك محروق من المقبس. سأستبدل المقبس والسلك.",
        priority: "med",
        dueInDays: 0,
        labels: ["كهرباء"],
        checklist: [
          { text: "فصل التيار عن الدائرة", done: true },
          { text: "استبدال المقبس", done: true },
          { text: "استبدال السلك من اللوحة", done: false },
          { text: "اختبار مع جهاز فولت", done: false },
        ],
        comments: [
          {
            body: "اشتريت المقبس الجديد من المخزن رقم 7.",
            daysAgo: 0,
          },
        ],
      },
      {
        column: "قيد التنفيذ",
        title: "بوّابة الموقف — جهاز البطاقات الممغنطة بطيء",
        description:
          "البوّابة تستغرق ٣-٤ ثواني لقراءة البطاقة. المطلوب تحديث البرنامج أو تنظيف رأس القراءة.",
        priority: "med",
        dueInDays: 2,
        labels: ["كهرباء"],
      },
      {
        column: "بانتظار قطعة",
        title: "غرفة 512 — بديل مصباح السقف LED مطلوب",
        description:
          "المصباح محروق والقطعة غير متوفّرة في المخزن. طلبت من المورّد ومفروض تصل الأربعاء.",
        priority: "low",
        dueInDays: 3,
        labels: ["كهرباء"],
        comments: [
          {
            body: "تواصلت مع شركة الأنوار — الطلب رقم SO-2026-0418.",
            daysAgo: 1,
          },
        ],
      },
      {
        column: "بانتظار قطعة",
        title: "صالة الطعام — مضخّة سخان المياه الرئيسي",
        description:
          "المضخّة تصدر صوتاً مرتفعاً وضغط المياه الساخنة ضعيف في المطبخ. الفني يرى أنها بحاجة استبدال.",
        priority: "high",
        dueInDays: -1,
        labels: ["سباكة", "عاجل"],
      },
      {
        column: "منجز",
        title: "صيانة دورية — مكيفات الردهة الرئيسية",
        description:
          "تم تنظيف الفلاتر وفحص الغاز وتعقيم مجاري الهواء. الأداء طبيعي.",
        priority: "med",
        labels: ["تكييف", "صيانة دورية"],
        completedDaysAgo: 2,
      },
      {
        column: "منجز",
        title: "غرفة 208 — تثبيت رأس دش جديد",
        description: "استُبدل الرأس التالف، التدفّق ممتاز الآن.",
        priority: "low",
        labels: ["سباكة"],
        completedDaysAgo: 1,
      },
    ],
  },

  {
    name: "الاستقبال والحجوزات",
    description:
      "إدارة الحجوزات، تأكيدات الوصول، ترتيبات VIP، والاستعدادات اليومية قبل الدوام.",
    color: "#0ea5e9",
    columns: ["قائمة الوصول", "قيد التحضير", "بانتظار تأكيد النزيل", "جاهز"],
    labels: [
      { name: "VIP", color: "#dc2626" },
      { name: "Walk-in", color: "#f59e0b" },
      { name: "Booking.com", color: "#2563eb" },
      { name: "حجز مباشر", color: "#16a34a" },
      { name: "طلب خاص", color: "#a855f7" },
    ],
    cards: [
      {
        column: "قائمة الوصول",
        title: "تحضير غرفة 701 — وصول ضيف VIP الساعة 5 عصراً",
        description:
          "الأستاذ ماهر العبد الله — نزيل متكرر. يطلب دائماً: ماء بارد، فواكه موسمية، وسادتين إضافيتين، وضبط الحرارة على 21.",
        priority: "urgent",
        dueInDays: 0,
        labels: ["VIP", "طلب خاص"],
        checklist: [
          { text: "تأكيد تنظيف الغرفة مع الإشراف الداخلي", done: false },
          { text: "تجهيز طبق فواكه + ماء بارد في الثلاجة", done: false },
          { text: "ضبط الحرارة على 21 قبل الوصول بنصف ساعة", done: false },
          { text: "اتصال تأكيد قبل الوصول بساعتين", done: false },
          { text: "إعلام مدير المناوبة", done: true },
        ],
        comments: [
          {
            body: "تواصلت مع النزيل — قادم من مطار الملكة علياء، سيصل تقريباً 5:15.",
            daysAgo: 0,
          },
        ],
      },
      {
        column: "قائمة الوصول",
        title: "3 غرف Booking.com وصول اليوم (210, 212, 305)",
        description:
          "تأكيدات الحجوزات جاهزة. المطلوب طباعة بطاقات الدخول وتحضير مفاتيح ممغنطة.",
        priority: "high",
        dueInDays: 0,
        labels: ["Booking.com"],
      },
      {
        column: "قيد التحضير",
        title: "طباعة تقرير الإشغال اليومي الساعة 8 صباحاً",
        description:
          "التقرير اليومي يُرسل للإدارة قبل اجتماع الصباح، يحتوي: نسبة الإشغال، المغادرين، الواصلين، الغرف المعطّلة.",
        priority: "med",
        dueInDays: 0,
        checklist: [
          { text: "استخراج بيانات الإشغال من النظام", done: true },
          { text: "إضافة ملاحظات الوردية الليلية", done: false },
          { text: "تحويله PDF وإرساله للمدير العام", done: false },
        ],
      },
      {
        column: "قيد التحضير",
        title: "تحويل حجز العائلة المصرية — طلب غرفة ثانية مجاورة",
        description:
          "وصلت العائلة أمس، يطلبون غرفة إضافية مجاورة للغرفة 408. نتحقق من توفّر 409 أو 407.",
        priority: "high",
        dueInDays: 0,
        labels: ["حجز مباشر", "طلب خاص"],
      },
      {
        column: "بانتظار تأكيد النزيل",
        title: "حجز الأستاذ خالد 28-30 إبريل — لم يصل دفع مقدّم",
        description:
          "الحجز معلّق بانتظار تحويل 30% كعربون. أرسلنا رسالة تذكير أمس.",
        priority: "med",
        dueInDays: 1,
        labels: ["حجز مباشر"],
        comments: [
          { body: "ذكّرته بالواتساب الساعة 10 صباحاً.", daysAgo: 0 },
        ],
      },
      {
        column: "جاهز",
        title: "تسكين زوجين شهر عسل — الغرفة 601",
        description:
          "الغرفة جاهزة مع باقة ترحيب: ورد، شوكولاتة، بطاقة تهنئة، تخفيف إضاءة رومانسي.",
        priority: "high",
        labels: ["VIP", "طلب خاص"],
        completedDaysAgo: 0,
      },
      {
        column: "جاهز",
        title: "تحديث قائمة أسعار العطل الصيفية 2026",
        description:
          "تم رفع الأسعار الجديدة على Booking.com وعلى موقعنا المباشر، متوافقة مع سياسة التسعير الموسمي.",
        priority: "med",
        completedDaysAgo: 3,
      },
    ],
  },

  {
    name: "التنظيف والإشراف الداخلي",
    description:
      "جداول تنظيف الغرف، الغسيل، المخزون، فحوصات الجودة اليومية للأدوار.",
    color: "#10b981",
    columns: [
      "مطلوب تنظيف",
      "قيد التنظيف",
      "بانتظار فحص الإشراف",
      "جاهز للإشغال",
    ],
    labels: [
      { name: "Check-out", color: "#f97316" },
      { name: "تنظيف يومي", color: "#10b981" },
      { name: "غسيل", color: "#6366f1" },
      { name: "تعقيم عميق", color: "#dc2626" },
      { name: "نقص مستلزمات", color: "#eab308" },
    ],
    cards: [
      {
        column: "مطلوب تنظيف",
        title: "الدور الثالث — 6 غرف check-out صباح اليوم",
        description:
          "الغرف: 301, 303, 307, 309, 312, 315. كلها مغادرة قبل الساعة 11، والواصلون قد يبدأون الوصول من 2 ظهراً.",
        priority: "urgent",
        dueInDays: 0,
        labels: ["Check-out"],
        checklist: [
          { text: "تجميع المناشف والأغطية المتسخة", done: false },
          { text: "تفريغ سلّات المهملات", done: false },
          { text: "تبديل الأسرّة", done: false },
          { text: "تعقيم الحمّامات", done: false },
          { text: "إعادة تعبئة المستلزمات (شامبو، صابون، قهوة)", done: false },
        ],
      },
      {
        column: "مطلوب تنظيف",
        title: "الجناح الملكي 801 — تعقيم عميق قبل نزيل VIP",
        description:
          "نزيل دبلوماسي قادم مساء الغد. المطلوب تعقيم عميق (شفط السجاد، تلميع الخشب، تبديل كامل للمفروشات).",
        priority: "high",
        dueInDays: 1,
        labels: ["تعقيم عميق", "Check-out"],
      },
      {
        column: "قيد التنظيف",
        title: "الدور الثاني — الطاقم (فاطمة + منى) يعمل منذ 9 صباحاً",
        description:
          "أنهينا حتى الآن 4 غرف من أصل 7. الإيقاع طبيعي.",
        priority: "med",
        dueInDays: 0,
        labels: ["تنظيف يومي"],
        checklist: [
          { text: "غرف 201, 204, 206, 208 — جاهزة", done: true },
          { text: "غرف 210, 212, 214 — قيد التنفيذ", done: false },
        ],
      },
      {
        column: "قيد التنظيف",
        title: "مغسلة الفندق — تحميل 3 دفعات غسيل",
        description:
          "الدفعة الأولى (بيضاء) انتهت، قيد التجفيف. الدفعة الثانية (ملوّنة) داخل الغسّالات.",
        priority: "med",
        dueInDays: 0,
        labels: ["غسيل"],
      },
      {
        column: "بانتظار فحص الإشراف",
        title: "غرفة 415 — طاقم التنظيف أبلغ بالإنجاز",
        description:
          "المشرفة أمل ستفحص الغرفة: بياضات، حمّام، مستلزمات، تلميع الزجاج.",
        priority: "high",
        dueInDays: 0,
        labels: ["Check-out"],
      },
      {
        column: "بانتظار فحص الإشراف",
        title: "غرفة 222 — نقص مستلزمات بعد التنظيف",
        description:
          "الطاقم لاحظ انتهاء القهوة وأكياس الشاي، يحتاج إعادة تعبئة من مخزن الأدوار.",
        priority: "low",
        dueInDays: 0,
        labels: ["نقص مستلزمات"],
      },
      {
        column: "جاهز للإشغال",
        title: "غرف 102, 105, 110 — جاهزة ومُختومة",
        description:
          "اجتازت فحص الإشراف، وُضعت الأختام على الأبواب، ومُسجّلت في النظام.",
        priority: "med",
        labels: ["Check-out"],
        completedDaysAgo: 0,
      },
      {
        column: "جاهز للإشغال",
        title: "جرد أسبوعي لمخزن المستلزمات — اكتمل",
        description:
          "طلبات الأسبوع القادم: 200 عبوة شامبو، 150 عبوة صابون، 80 عبوة قهوة فورية.",
        priority: "low",
        labels: ["نقص مستلزمات"],
        completedDaysAgo: 2,
      },
    ],
  },

  {
    name: "تجربة النزيل والشكاوى",
    description:
      "متابعة ملاحظات النزلاء، الشكاوى، التقييمات، وتحسينات الخدمة.",
    color: "#a855f7",
    columns: ["جديد", "قيد المعالجة", "بانتظار رد النزيل", "مغلق"],
    labels: [
      { name: "شكوى", color: "#dc2626" },
      { name: "ملاحظة", color: "#f59e0b" },
      { name: "تقدير/شكر", color: "#16a34a" },
      { name: "متابعة Google Review", color: "#3b82f6" },
      { name: "تعويض", color: "#a855f7" },
    ],
    cards: [
      {
        column: "جديد",
        title: "شكوى من الغرفة 309 — ضجيج من الغرفة المجاورة",
        description:
          "النزيلة سيّدة أبلغت الاستقبال في منتصف الليل بأن الغرفة المجاورة صاخبة. تم التواصل مع نزلاء 311 وهدأت الأجواء، لكن النزيلة طلبت تقييم الموضوع صباحاً.",
        priority: "high",
        dueInDays: 0,
        labels: ["شكوى"],
        comments: [
          {
            body: "المشرف الليلي سجّل الحادثة في تقرير الوردية.",
            daysAgo: 0,
          },
        ],
      },
      {
        column: "جديد",
        title: "تقييم Google 3 نجوم — بطء check-in",
        description:
          'النزيل ذكر "انتظار 25 دقيقة على الاستقبال يوم الجمعة الماضي". نحتاج الرد علناً + تحليل داخلي.',
        priority: "med",
        dueInDays: 1,
        labels: ["متابعة Google Review", "ملاحظة"],
      },
      {
        column: "قيد المعالجة",
        title: "شكوى — طاولة الإفطار لم تُنظّف بشكل جيد",
        description:
          "النزيل الأستاذ عمر أبلغ مدير المطعم. تم الاعتذار وتقديم قسائم مشروبات مجانية لبقية الإقامة.",
        priority: "high",
        dueInDays: 0,
        labels: ["شكوى", "تعويض"],
        checklist: [
          { text: "اعتذار شخصي من مدير المطعم", done: true },
          { text: "تقديم قسائم مشروبات مجاناً", done: true },
          { text: "مراجعة بروتوكول تنظيف الطاولات مع الطاقم", done: false },
          { text: "رسالة متابعة بعد المغادرة", done: false },
        ],
      },
      {
        column: "قيد المعالجة",
        title: "ملاحظة — الواي-فاي في الدور الرابع ضعيف",
        description:
          "نزيلان ذكرا ضعف الإشارة. تم إبلاغ فريق الـ IT بالتحقّق من access point الدور.",
        priority: "med",
        dueInDays: 2,
        labels: ["ملاحظة"],
      },
      {
        column: "بانتظار رد النزيل",
        title: "الأستاذ رامي — تعويض قسيمة ليلة مجانية",
        description:
          "قدّمنا قسيمة ليلة مجانية في زيارته القادمة تعويضاً عن تأخّر check-in الأسبوع الماضي. بانتظار تأكيد موعد الزيارة القادم.",
        priority: "med",
        dueInDays: 5,
        labels: ["تعويض"],
      },
      {
        column: "مغلق",
        title: "رسالة شكر من عائلة الأستاذ حسن — إقامة 3 ليالٍ",
        description:
          'نشروا تقييم 5 نجوم على Booking وأرسلوا رسالة شكر خاصة للطاقم. تم مشاركة الرسالة في مجموعة الواتساب الداخلية لرفع المعنويات.',
        priority: "low",
        labels: ["تقدير/شكر"],
        completedDaysAgo: 1,
      },
      {
        column: "مغلق",
        title: "شكوى مكيف غرفة 305 من الأسبوع الماضي — تم الحل نهائياً",
        description:
          "استُبدل المكيف بالكامل، تواصلنا مع النزيل وقدّمنا خصم 20% على زيارته القادمة. أغلق الملف.",
        priority: "med",
        labels: ["شكوى", "تعويض"],
        completedDaysAgo: 4,
      },
    ],
  },
];

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function dueDate(days: number | undefined): Date | null {
  if (days === undefined) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return d;
}

function agoDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ────────────────────────────────────────────────────────────
// Main seed routine
// ────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Seeding realistic hotel demo boards...");

  const users = await prisma.user.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, role: true },
  });
  if (users.length === 0) {
    console.error("❌ لا يوجد مستخدمون. شغّل seed المستخدمين أولاً.");
    process.exit(1);
  }

  const admin =
    users.find((u) => u.role === "admin") ?? users[0];
  console.log(`   صاحب اللوحات: #${admin.id} ${admin.name} (${admin.role})`);
  console.log(`   عدد الأعضاء المرشحين للإسناد: ${users.length}`);

  let createdBoards = 0;
  let skippedBoards = 0;

  for (const demo of BOARDS) {
    const existing = await prisma.taskBoard.findFirst({
      where: { name: demo.name, ownerId: admin.id },
    });
    if (existing) {
      console.log(`   ⏭ موجودة مسبقاً: ${demo.name} (board #${existing.id})`);
      skippedBoards++;
      continue;
    }

    const board = await prisma.taskBoard.create({
      data: {
        name: demo.name,
        description: demo.description,
        color: demo.color,
        ownerId: admin.id,
      },
    });

    await prisma.taskBoardMember.create({
      data: { boardId: board.id, userId: admin.id, role: "owner" },
    });
    for (const u of users) {
      if (u.id === admin.id) continue;
      await prisma.taskBoardMember.create({
        data: { boardId: board.id, userId: u.id, role: "editor" },
      });
    }

    const columnByName = new Map<string, number>();
    for (let i = 0; i < demo.columns.length; i++) {
      const col = await prisma.taskColumn.create({
        data: {
          boardId: board.id,
          name: demo.columns[i],
          position: i * 1000,
        },
      });
      columnByName.set(demo.columns[i], col.id);
    }

    const labelByName = new Map<string, number>();
    for (const l of demo.labels) {
      const lbl = await prisma.taskLabel.create({
        data: { boardId: board.id, name: l.name, color: l.color },
      });
      labelByName.set(l.name, lbl.id);
    }

    const positionByCol = new Map<string, number>();
    for (const card of demo.cards) {
      const columnId = columnByName.get(card.column);
      if (!columnId) {
        console.warn(`   ⚠ عمود غير معروف: ${card.column}`);
        continue;
      }
      const pos = (positionByCol.get(card.column) ?? 0) + 1000;
      positionByCol.set(card.column, pos);

      const completed = card.completedDaysAgo !== undefined;
      const task = await prisma.task.create({
        data: {
          boardId: board.id,
          columnId,
          title: card.title,
          description: card.description ?? null,
          priority: card.priority ?? "med",
          dueAt: dueDate(card.dueInDays),
          position: pos,
          createdById: admin.id,
          completedAt: completed ? agoDate(card.completedDaysAgo!) : null,
        },
      });

      // Assignees
      let assigneeIds: number[] = [];
      if (card.assignees === "all") {
        assigneeIds = users.map((u) => u.id);
      } else if (card.assignees === "owner") {
        assigneeIds = [admin.id];
      } else if (Array.isArray(card.assignees)) {
        assigneeIds = card.assignees;
      } else {
        // Default: assign to admin + 1 random other user (if any).
        assigneeIds = [admin.id];
        const others = users.filter((u) => u.id !== admin.id);
        if (others.length)
          assigneeIds.push(
            others[Math.floor(Math.random() * others.length)].id,
          );
      }
      for (const uid of Array.from(new Set(assigneeIds))) {
        await prisma.taskAssignee
          .create({ data: { taskId: task.id, userId: uid } })
          .catch(() => undefined);
      }

      // Labels
      if (card.labels?.length) {
        for (const ln of card.labels) {
          const lid = labelByName.get(ln);
          if (lid) {
            await prisma.taskLabelOnTask
              .create({ data: { taskId: task.id, labelId: lid } })
              .catch(() => undefined);
          }
        }
      }

      // Checklist
      if (card.checklist?.length) {
        for (let i = 0; i < card.checklist.length; i++) {
          const it = card.checklist[i];
          await prisma.taskChecklistItem.create({
            data: {
              taskId: task.id,
              text: it.text,
              done: it.done,
              position: i * 1000,
            },
          });
        }
      }

      // Comments
      if (card.comments?.length) {
        for (const c of card.comments) {
          const when = c.daysAgo !== undefined ? agoDate(c.daysAgo) : new Date();
          await prisma.taskComment.create({
            data: {
              taskId: task.id,
              authorId: admin.id,
              body: c.body,
              createdAt: when,
            },
          });
        }
      }

      // Minimal activity trail so the "النشاط" tab isn't empty
      await prisma.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: admin.id,
          type: "created",
          payloadJson: { seeded: true } as object,
        },
      });
      if (completed) {
        await prisma.taskActivity.create({
          data: {
            taskId: task.id,
            actorId: admin.id,
            type: "completed",
            createdAt: agoDate(card.completedDaysAgo!),
            payloadJson: { seeded: true } as object,
          },
        });
      }
    }

    console.log(
      `   ✅ ${demo.name} — ${demo.columns.length} أعمدة، ${demo.labels.length} تسميات، ${demo.cards.length} بطاقات`,
    );
    createdBoards++;
  }

  console.log(
    `\n🎉 انتهى: ${createdBoards} لوحة جديدة، ${skippedBoards} لوحة موجودة مسبقاً.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
