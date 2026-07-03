// Lightweight in-memory rate limiter. Best-effort only: state is per-serverless-
// instance and resets on cold start, so it caps casual/anonymous abuse of the
// expensive AI steps (U1) without external infra. For hard guarantees across
// instances, back this with Upstash/Redis — see the security follow-up.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now > existing.resetAt) {
    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > MAX_KEYS) {
      for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

/**
 * Guard for the photo-upload / analyze entry step (the funnel's front door).
 * Layers three caps so bots can't flood it — including signed-in bots, which
 * previously had no limit:
 *   - per-IP flood cap (40/hr) for everyone → stops many-accounts-one-IP bots
 *   - anonymous: 12/hr per IP (nudged to sign in)
 *   - signed-in: 20/hr per user
 * Admins are exempt from the IP cap and get a high per-user cap for testing.
 */
export function uploadRateLimit(opts: {
  key: string;
  ip: string;
  userId?: string | null;
  isAdmin?: boolean;
}): RateLimitResult {
  const { key, ip, userId, isAdmin } = opts;
  const HOUR = 60 * 60 * 1000;

  if (isAdmin && userId) {
    return rateLimit(`${key}:user:${userId}`, 200, HOUR);
  }

  const ipCap = rateLimit(`${key}:ip:${ip}`, 40, HOUR);
  if (!ipCap.ok) return ipCap;

  if (!userId) {
    return rateLimit(`${key}:anon:${ip}`, 12, HOUR);
  }
  return rateLimit(`${key}:user:${userId}`, 20, HOUR);
}

/** Best-effort client IP from common proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
