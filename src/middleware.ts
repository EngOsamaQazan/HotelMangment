import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  classifyHost,
  getAdminHost,
  getPublicHost,
  isHostSplitEnabled,
  type HostKind,
} from "@/lib/hosts";

/**
 * Top-level gate. Two distinct audiences live side-by-side, on two hosts:
 *
 *   • staff  → `admin.mafhotel.com` (admin dashboard + staff APIs)
 *   • guest  → `mafhotel.com` (landing, booking funnel, `/account`)
 *
 * In local dev both audiences keep sharing `localhost:3000` (host split is
 * disabled when `ADMIN_HOST` is not configured — see `src/lib/hosts.ts`).
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

/**
 * Paths that belong to the public/guest site. On the admin host these are
 * rewritten to the public host (and vice-versa). Keep them prefix-exact.
 *
 * Note: `/signin`, `/signup`, `/landing`, `/book`, `/about`, `/privacy`,
 * `/terms`, `/account`, `/api/guest-auth`, `/api/guest-me`, `/api/book`,
 * `/api/files/unit-photo`, `/api/files/unit-type-photo` → public host.
 */
const PUBLIC_HOST_PATH_PREFIXES = [
  "/signin",
  "/signup",
  "/landing",
  "/privacy",
  "/terms",
  "/about",
  "/book",
  "/account",
  "/api/guest-auth",
  "/api/guest-me",
  "/api/book",
  "/api/files/unit-photo",
  "/api/files/unit-type-photo",
];

/**
 * Paths that belong to the admin host. On the public host these redirect to
 * the admin subdomain (except the ones a browser absolutely needs to reach
 * either way — like `/api/auth/*`, which is shared by both audiences).
 */
const ADMIN_HOST_PATH_PREFIXES = [
  "/login",
  ...STAFF_ONLY_PREFIXES,
  ...STAFF_ONLY_API_PREFIXES,
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

function buildCrossHostRedirect(
  req: NextRequest,
  targetHost: string,
  pathname: string,
): NextResponse {
  const proto =
    req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const url = `${proto}://${targetHost}${pathname}${req.nextUrl.search}`;
  return NextResponse.redirect(url, 308);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const hostHeader = req.headers.get("host");
  const hostKind: HostKind = classifyHost(hostHeader);
  const splitEnabled = isHostSplitEnabled();

  // ─── 1. Host-level routing (production only) ────────────────────────────
  //
  // Send each request to the subdomain that owns the path. `/api/auth/*` is
  // intentionally excluded because NextAuth callbacks need to post back to
  // whichever host initiated the flow.
  //
  // We do this BEFORE the auth check so a guest typing `mafhotel.com/login`
  // or a staff member clicking an old `mafhotel.com/reservations` bookmark
  // lands on the right host without first seeing an auth error.
  if (splitEnabled && !isApi) {
    if (hostKind === "admin" && matchesPrefixList(pathname, PUBLIC_HOST_PATH_PREFIXES)) {
      return buildCrossHostRedirect(req, getPublicHost(), pathname);
    }
    if (hostKind === "public" && matchesPrefixList(pathname, ADMIN_HOST_PATH_PREFIXES)) {
      return buildCrossHostRedirect(req, getAdminHost(), pathname);
    }
  }

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
    // Root handling depends on the host:
    //   • public host → marketing site at /landing
    //   • admin host  → staff login
    if (pathname === "/") {
      const target = req.nextUrl.clone();
      target.pathname = hostKind === "admin" ? "/login" : "/landing";
      if (hostKind === "admin") {
        target.searchParams.set("next", "/");
      }
      return NextResponse.redirect(target);
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
    (pathname === "/" && hostKind !== "public");

  if (needsGuest && audience !== "guest") {
    if (isApi) {
      return NextResponse.json(
        { error: "هذه الصفحة مخصصة لحسابات الضيوف فقط." },
        { status: 403 },
      );
    }
    // Staff hitting /account → admin dashboard on the admin host;
    // anonymous users (shouldn't happen here, token exists) → signin.
    if (audience === "staff" && splitEnabled) {
      return buildCrossHostRedirect(req, getAdminHost(), "/");
    }
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
    // Guest trying to reach an admin page → their own /account on public host.
    if (audience === "guest" && splitEnabled) {
      return buildCrossHostRedirect(req, getPublicHost(), "/account");
    }
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = audience === "guest" ? "/account" : "/login";
    if (audience !== "guest") {
      redirectUrl.searchParams.set("next", pathname + req.nextUrl.search);
    } else {
      redirectUrl.search = "";
    }
    return NextResponse.redirect(redirectUrl);
  }

  // ─── 2. Authenticated but on the wrong host ─────────────────────────────
  //
  // Staff session browsing the public host root → admin dashboard.
  // Guest session browsing the admin host root → /account on public host.
  if (splitEnabled && pathname === "/") {
    if (hostKind === "public" && audience === "staff") {
      return buildCrossHostRedirect(req, getAdminHost(), "/");
    }
    if (hostKind === "admin" && audience === "guest") {
      return buildCrossHostRedirect(req, getPublicHost(), "/account");
    }
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
