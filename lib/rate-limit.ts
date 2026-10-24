// Per-IP token buckets for the unauthenticated, expensive endpoints.
//
// This is in-process memory, so on serverless it only limits within one warm
// instance. It is a backstop, not the boundary: production should also have a
// Vercel Firewall rate-limit rule on /api/analyze, /api/generate, /api/themes
// and /api/interview.

interface Bucket {
  tokens: number;
  at: number;
}

export interface RateLimit {
  /** Requests allowed in a burst. */
  capacity: number;
  /** Window over which `capacity` refills, in ms. */
  windowMs: number;
}

export const LIMITS = {
  analyze: { capacity: 6, windowMs: 10 * 60_000 },
  generate: { capacity: 4, windowMs: 10 * 60_000 },
  themes: { capacity: 10, windowMs: 10 * 60_000 },
  interview: { capacity: 40, windowMs: 10 * 60_000 },
} satisfies Record<string, RateLimit>;

const MAX_KEYS = 10_000;

const store = globalThis as typeof globalThis & {
  __deslopRateLimit?: Map<string, Bucket>;
};

function buckets() {
  store.__deslopRateLimit ??= new Map();
  return store.__deslopRateLimit;
}

export function clientIp(request: Request): string {
  const h = request.headers;
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    h.get("x-real-ip")?.trim() ||
    forwarded ||
    h.get("x-vercel-forwarded-for")?.trim() ||
    "unknown"
  );
}

/** Takes one token; returns seconds to wait when the bucket is empty. */
export function take(
  name: keyof typeof LIMITS,
  key: string,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfter: number } {
  const limit = LIMITS[name];
  const map = buckets();
  const id = `${name}:${key}`;
  const refillPerMs = limit.capacity / limit.windowMs;
  const prev = map.get(id);
  const tokens = prev
    ? Math.min(limit.capacity, prev.tokens + (now - prev.at) * refillPerMs)
    : limit.capacity;

  if (tokens < 1) {
    map.set(id, { tokens, at: now });
    return {
      ok: false,
      retryAfter: Math.ceil((1 - tokens) / refillPerMs / 1000),
    };
  }
  if (!prev && map.size >= MAX_KEYS) {
    // Drop the oldest entry; Map iterates in insertion order.
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.delete(id);
  map.set(id, { tokens: tokens - 1, at: now });
  return { ok: true };
}

/** Returns a 429 Response when the caller is over the limit, else null. */
export function rateLimited(
  request: Request,
  name: keyof typeof LIMITS,
): Response | null {
  const result = take(name, clientIp(request));
  if (result.ok) return null;
  return Response.json(
    { error: "Too many requests. Give it a minute and try again." },
    {
      status: 429,
      headers: {
        "retry-after": String(result.retryAfter),
        "cache-control": "no-store",
      },
    },
  );
}
