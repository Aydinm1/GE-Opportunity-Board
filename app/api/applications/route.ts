import { submitApplication } from '../../../lib/airtable';
import { jsonError, jsonOk } from '../../../lib/api-response';
import { applyRateLimit } from '../../../lib/rate-limit';
import { AppError } from '../../../lib/errors';
import { validateApplicationPayload } from '../../../lib/validation';

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
    const result = await submitApplication(payload);
    return jsonOk({ ok: true, result }, 200, limit.headers);
  } catch (err) {
    return jsonError(err, {
      context: '/api/applications',
      fallbackMessage: 'Failed to submit application',
      headers: limit.headers,
    });
  }
}
