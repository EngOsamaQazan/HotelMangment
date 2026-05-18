import { NextRequest, NextResponse } from "next/server";
import { classifyHost } from "@/lib/hosts";
import { SITE } from "@/lib/seo/site";

const GUEST_MANIFEST = {
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
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
} as const;

const STAFF_MANIFEST = {
  id: "/staff",
  name: "واتساب المفرق — طاقم العمل",
  short_name: "واتساب المفرق",
  description:
    "التطبيق المخصّص لطاقم فندق المفرق لإدارة محادثات الواتساب، الحجوزات، المهام والصيانة.",
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
    { src: "/staff-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/staff-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/staff-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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

export function GET(req: NextRequest) {
  const hostKind = classifyHost(req.headers.get("host"));
  const manifest = hostKind === "admin" ? STAFF_MANIFEST : GUEST_MANIFEST;

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Content-Type": "application/manifest+json; charset=utf-8",
    },
  });
}
