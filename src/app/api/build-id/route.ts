import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

/**
 * Returns the Next.js build id of the running server. The client polls this
 * endpoint and force-reloads when the id changes — so every new deploy pushes
 * an immediate refresh to every open tab, instead of devices running yesterday's
 * bundle forever.
 *
 * Public by design (no PII, no auth required): it only exposes a random hash
 * that the build process writes to `.next/BUILD_ID`.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

let cached: string | null = null;

function readBuildId(): string {
  if (cached) return cached;

  const candidates = [
    path.join(process.cwd(), ".next", "BUILD_ID"),
    path.join(process.cwd(), "..", ".next", "BUILD_ID"),
  ];

  for (const p of candidates) {
    try {
      const value = fs.readFileSync(p, "utf8").trim();
      if (value) {
        cached = value;
        return value;
      }
    } catch {
      // try next candidate
    }
  }

  cached = process.env.BUILD_ID || "dev";
  return cached;
}

export async function GET() {
  return NextResponse.json(
    { buildId: readBuildId() },
    {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0",
      },
    },
  );
}
