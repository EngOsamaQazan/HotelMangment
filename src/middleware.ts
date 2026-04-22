import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Top-level gate. Two distinct audiences live side-by-side:
 *
 *   • staff  → can access admin paths (/, /reservations, /rooms, ...)
 *   • guest  → can access /account/*, /book/checkout, /book/confirm/*
 *
 * Anonymous visitors can still browse /landing, /book, /book/results, and
 * /book/type/* — the gate only kicks in for authenticated-only pages.
 *
 * Fine-grained permission checks still run inside each Route Handler / page
 * via `requirePermission()` and `<Can>`.
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/signin",
  "/signup",
  "/api/auth",
  "/api/guest-auth",
  "/api/build-id",
  "/_next",
  "/favicon",
  "/public",
  // Public marketing / compliance pages.
  "/landing",
  "/privacy",
  "/terms",
  "/about",
  // Public booking funnel — searchable without an account.
  "/book",
  // Public read-only booking APIs (availability + quote are stateless).
  "/api/book/availability",
  "/api/book/quote",
  "/api/book/voucher",
  "/api/book/unit-types",
  "/api/book/merges",
  // Public photo endpoints for UnitType / UnitPhoto galleries.
  "/api/files/unit-photo",
  "/api/files/unit-type-photo",
  // Meta WhatsApp Webhook: verified by hub.challenge (GET) and HMAC (POST).
  "/api/whatsapp/webhook",
];

// Paths that explicitly require a guest session (not a staff one).
const GUEST_ONLY_PREFIXES = ["/account", "/api/guest-me"];

// Paths that explicitly require a staff session (any role — fine-grained
// permission checks happen downstream in each route/page).
const STAFF_ONLY_PREFIXES = [
  "/reservations",
  "/rooms",
  "/guests",
  "/maintenance",
  "/tasks",
  "/chat",
  "/whatsapp",
  "/finance",
  "/reports",
  "/accounting",
  "/settings",
  "/profile",
];

// Admin-only APIs — mirror of the page list above.
const STAFF_ONLY_API_PREFIXES = [
  "/api/reservations",
  "/api/rooms",
  "/api/units",
  "/api/guests",
  "/api/maintenance",
  "/api/tasks",
  "/api/chat",
  "/api/whatsapp",
  "/api/finance",
  "/api/reports",
  "/api/accounting",
  "/api/roles",
  "/api/permissions",
  "/api/users",
  "/api/seasonal-prices",
  "/api/seasons",
  "/api/unit-types",
  "/api/unit-type-prices",
  "/api/amenities",
  "/api/me",
  "/api/notifications",
  "/api/booking",
];

const PUBLIC_FILES = new Set([
  "/icon.png",
  "/apple-icon.png",
  "/opengraph-image.png",
  "/twitter-image.png",
  "/manifest.json",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  if (PUBLIC_FILES.has(pathname)) return true;
  if (/^\/[^/]+\.(png|jpe?g|svg|webp|ico|txt|xml|json)$/.test(pathname)) {
    return true;
  }
  return false;
}

function matchesPrefixList(pathname: string, list: string[]): boolean {
  return list.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const audience =
    (token?.audience as "staff" | "guest" | undefined) ?? undefined;

  if (!token) {
    if (isApi) {
      return NextResponse.json(
        { error: "غير مصرّح — يجب تسجيل الدخول أولاً" },
        { status: 401 },
      );
    }
    // Root: anonymous visitors see the marketing site, not the admin login.
    if (pathname === "/") {
      const landingUrl = req.nextUrl.clone();
      landingUrl.pathname = "/landing";
      return NextResponse.redirect(landingUrl);
    }
    // Guest pages redirect to /signin; staff pages to /login.
    const isGuestArea = matchesPrefixList(pathname, GUEST_ONLY_PREFIXES);
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = isGuestArea ? "/signin" : "/login";
    redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated — enforce audience segregation.
  const needsGuest = matchesPrefixList(pathname, GUEST_ONLY_PREFIXES);
  const needsStaff =
    matchesPrefixList(pathname, STAFF_ONLY_PREFIXES) ||
    matchesPrefixList(pathname, STAFF_ONLY_API_PREFIXES) ||
    pathname === "/";

  if (needsGuest && audience !== "guest") {
    if (isApi) {
      return NextResponse.json(
        { error: "هذه الصفحة مخصصة لحسابات الضيوف فقط." },
        { status: 403 },
      );
    }
    // Staff hitting /account → back to staff dashboard; anonymous → signin.
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = audience === "staff" ? "/" : "/signin";
    if (audience !== "staff") {
      redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
    } else {
      redirectUrl.search = "";
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (needsStaff && audience !== "staff") {
    if (isApi) {
      return NextResponse.json(
        { error: "هذه الصفحة مخصصة لفريق العمل فقط." },
        { status: 403 },
      );
    }
    // Guest trying to reach an admin page → send them to their own /account.
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = audience === "guest" ? "/account" : "/login";
    if (audience !== "guest") {
      redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
    } else {
      redirectUrl.search = "";
    }
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     *  - Next.js internals (_next/*)
     *  - Anything ending in a file extension (e.g. /logo.png, /brand-1.jpeg,
     *    /robots.txt) — these are served from /public and must be public.
     */
    "/((?!_next/|.*\\..*).*)",
  ],
};
