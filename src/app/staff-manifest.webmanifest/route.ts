import { NextResponse } from "next/server";

/**
 * Staff PWA Manifest  (served at `/staff-manifest.webmanifest`)
 *
 * منفصل تمامًا عن `/manifest.webmanifest` (تطبيق الضيوف) لنتمكّن من
 * تثبيت تطبيقَين مميّزَين على نفس الشاشة الرئيسيّة:
 *
 *   • تطبيق الضيف  → id: "/"        → start_url: "/landing"
 *   • تطبيق الطاقم → id: "/staff"   → start_url: "/whatsapp"
 *
 * Chrome يعتمد على حقل `id` لتمييز تطبيقَي PWA من نفس الأصل؛ بدونه
 * سيرفض تثبيت الثاني ويعتبره تحديثًا للأوّل. لذلك `id` مختلف هنا.
 *
 * يتمّ تفعيل هذا الـ manifest عبر مبدِّل العميل (`StaffManifestSwitch`)
 * الذي يبدّل `<link rel="manifest">` تلقائيًّا عند دخول المستخدم لأيّ
 * صفحة طاقم (غير landing / booking / auth). بذلك إذا نقر المستخدم
 * «تثبيت التطبيق» من `/settings/whatsapp/notifications` ستُركَّب نسخة
 * الطاقم التي تفتح فورًا على صندوق الواتساب عند النقر على أيقونتها.
 */
export const dynamic = "force-static";

const MANIFEST = {
  id: "/staff",
  name: "واتساب المفرق — طاقم العمل",
  short_name: "واتساب المفرق",
  description:
    "التطبيق المخصّص لطاقم فندق المفرق لإدارة محادثات الواتساب، الحجوزات، المهام والصيانة. يفتح مباشرة على صندوق الواتساب.",
  start_url: "/whatsapp",
  scope: "/",
  display: "standalone",
  display_override: ["window-controls-overlay", "standalone"],
  orientation: "portrait",
  background_color: "#0E3B33",
  theme_color: "#0E3B33",
  lang: "ar",
  dir: "rtl",
  categories: ["business", "productivity", "communication"],
  prefer_related_applications: false,
  icons: [
    {
      src: "/staff-icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/staff-icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/staff-icon-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  shortcuts: [
    {
      name: "صندوق الواتساب",
      short_name: "الواتساب",
      description: "فتح محادثات واتساب مع الضيوف مباشرة",
      url: "/whatsapp",
      icons: [{ src: "/staff-icon-192.png", sizes: "192x192" }],
    },
    {
      name: "الحجوزات",
      short_name: "الحجوزات",
      description: "إدارة الحجوزات الحالية والقادمة",
      url: "/reservations",
      icons: [{ src: "/icon-192.png", sizes: "192x192" }],
    },
    {
      name: "المهام",
      short_name: "المهام",
      description: "مهام الطاقم اليوميّة",
      url: "/tasks",
      icons: [{ src: "/icon-192.png", sizes: "192x192" }],
    },
    {
      name: "الصيانة",
      short_name: "الصيانة",
      description: "طلبات الصيانة والأعطال",
      url: "/maintenance",
      icons: [{ src: "/icon-192.png", sizes: "192x192" }],
    },
  ],
} as const;

export function GET() {
  return NextResponse.json(MANIFEST, {
    headers: {
      // يفضّل المتصفّح عدم التخزين الطويل لأنّ تغيير start_url أو الأيقونة
      // يجب أن يصل سريعًا لكلّ الأجهزة المثبّتة.
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Content-Type": "application/manifest+json; charset=utf-8",
    },
  });
}
