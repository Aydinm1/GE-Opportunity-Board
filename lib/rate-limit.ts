const buckets = new Map<string, { count: number; resetAt: number }>();

const MAX_BUCKETS = 10_000;

function pruneExpired(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  return 'unknown';
}

export function applyRateLimit(
  req: Request,
  {
    scope,
    limit,
    windowMs,
  }: {
    scope: string;
    limit: number;
    windowMs: number;
  }
) {
  const now = Date.now();
  pruneExpired(now);
  const ip = getClientIp(req);
  const bucketKey = `${scope}:${ip}`;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(bucketKey, next);
    return {
      ok: true,
      headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(Math.max(limit - 1, 0)),
        'X-RateLimit-Reset': String(Math.ceil(next.resetAt / 1000)),
      } as Record<string, string>,
    };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);
    return {
      ok: false,
      headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(existing.resetAt / 1000)),
        'Retry-After': String(retryAfterSeconds),
      } as Record<string, string>,
    };
  }

  existing.count += 1;
  buckets.set(bucketKey, existing);
  return {
    ok: true,
    headers: {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': String(Math.max(limit - existing.count, 0)),
      'X-RateLimit-Reset': String(Math.ceil(existing.resetAt / 1000)),
    } as Record<string, string>,
  };
}
