import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy endpoint — kept for backward compatibility with already-installed
 * staff PWAs that reference `/staff-manifest.webmanifest`. New installs go
 * through `/manifest.webmanifest` which serves the correct manifest based
 * on the host header.
 */
export function GET(req: NextRequest) {
  const url = new URL("/manifest.webmanifest", req.url);
  return NextResponse.redirect(url, 308);
}
