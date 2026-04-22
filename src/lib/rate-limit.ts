import "server-only";

/**
 * Minimal sliding-window rate limiter — good enough for a single-node
 * deployment (the only deployment we run today). For a multi-node setup
 * swap the in-memory `Map` for Redis without changing callers.
 *
 *   const check = await rateLimit({ key: `otp:${phone}`, limit: 3, windowMs: 10 * 60_000 });
 *   if (!check.ok) return NextResponse.json({ error, retryAfter: check.retryAfter }, { status: 429 });
 *
 * Every call records a hit. `check.ok === false` means the caller is past
 * the limit within the window and should back off.
 */

interface Hit {
  ts: number;
}

interface Bucket {
  hits: Hit[];
}

const buckets = new Map<string, Bucket>();

// Lightweight sweeper so long-running processes don't leak memory: drop
// any bucket that hasn't been touched in 2× the largest window we track.
const MAX_BUCKET_AGE_MS = 60 * 60 * 1000;
let lastGc = 0;

function gc(now: number) {
  if (now - lastGc < 5 * 60 * 1000) return;
  lastGc = now;
  for (const [key, bucket] of buckets.entries()) {
    const latest = bucket.hits[bucket.hits.length - 1]?.ts ?? 0;
    if (now - latest > MAX_BUCKET_AGE_MS) buckets.delete(key);
  }
}

export interface RateLimitArgs {
  /** Stable identifier — combine the resource and client fingerprint, e.g. `otp:start:962781099910`. */
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds to wait before the caller's next attempt is allowed. Always ≥ 0. */
  retryAfter: number;
}

export function rateLimit(args: RateLimitArgs): RateLimitResult {
  const now = Date.now();
  gc(now);

  const bucket = buckets.get(args.key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((h) => now - h.ts < args.windowMs);

  if (bucket.hits.length >= args.limit) {
    const oldest = bucket.hits[0].ts;
    const retryAfter = Math.max(
      0,
      Math.ceil((args.windowMs - (now - oldest)) / 1000),
    );
    buckets.set(args.key, bucket);
    return { ok: false, remaining: 0, retryAfter };
  }

  bucket.hits.push({ ts: now });
  buckets.set(args.key, bucket);
  return {
    ok: true,
    remaining: Math.max(0, args.limit - bucket.hits.length),
    retryAfter: 0,
  };
}

/** Returns the first usable client IP from standard proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
