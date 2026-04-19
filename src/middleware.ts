import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Top-level gate: ensures every non-public route has a session.
 * Fine-grained permission checks run in each Route Handler / page via
 * `requirePermission()` and `<Can>`.
 */

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/build-id",
  "/_next",
  "/favicon",
  "/public",
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
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_FILES.has(pathname)) return true;
  // Any brand-identity or public file served from /public with a file extension.
  // We only allow GETs of .png/.jpg/.jpeg/.svg/.webp/.ico/.txt/.xml/.json at the root.
  if (/^\/[^/]+\.(png|jpe?g|svg|webp|ico|txt|xml|json)$/.test(pathname)) {
    return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "غير مصرّح — يجب تسجيل الدخول أولاً" },
        { status: 401 },
      );
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
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
