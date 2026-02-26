import { submitApplication } from '../../../lib/airtable';
import { jsonError, jsonOk } from '../../../lib/api-response';
import { applyRateLimit } from '../../../lib/rate-limit';
import { AppError } from '../../../lib/errors';
import { validateApplicationPayload, validateIdempotencyKey } from '../../../lib/validation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const limit = applyRateLimit(req, {
    scope: 'api:applications',
    limit: 8,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return jsonError(new AppError('Too many requests. Please try again shortly.', { status: 429 }), {
      context: '/api/applications',
      fallbackMessage: 'Rate limit exceeded',
      status: 429,
      headers: limit.headers,
    });
  }

  try {
    let rawPayload: unknown;
    try {
      rawPayload = await req.json();
    } catch {
      throw new AppError('Invalid JSON payload.', { status: 400 });
    }
    const payload = validateApplicationPayload(rawPayload);
    const bodyIdempotencyKey =
      rawPayload &&
      typeof rawPayload === 'object' &&
      !Array.isArray(rawPayload) &&
      (rawPayload as { meta?: { idempotencyKey?: unknown } }).meta &&
      typeof (rawPayload as { meta?: { idempotencyKey?: unknown } }).meta?.idempotencyKey === 'string'
        ? (rawPayload as { meta?: { idempotencyKey?: string } }).meta?.idempotencyKey
        : null;
    const headerIdempotencyKey = req.headers.get('x-idempotency-key');
    const idempotencyKey = validateIdempotencyKey(headerIdempotencyKey || bodyIdempotencyKey || null);
    const result = await submitApplication({
      ...payload,
      idempotencyKey,
    });
    return jsonOk({ ok: true, result }, 200, limit.headers);
  } catch (err) {
    return jsonError(err, {
      context: '/api/applications',
      fallbackMessage: 'Failed to submit application',
      headers: limit.headers,
    });
  }
}
