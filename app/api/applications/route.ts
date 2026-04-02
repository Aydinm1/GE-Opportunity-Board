import { submitApplication } from '../../../lib/airtable';
import { jsonError, jsonOk } from '../../../lib/api-response';
import { applyRateLimit } from '../../../lib/rate-limit';
import { AppError } from '../../../lib/errors';
import { validateApplicationFormData, validateIdempotencyKey } from '../../../lib/validation';

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
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw new AppError('Expected multipart/form-data.', { status: 400 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      throw new AppError('Invalid form payload.', { status: 400 });
    }
    const payload = await validateApplicationFormData(formData);
    const bodyIdempotencyKey = formData.get('idempotencyKey');
    const headerIdempotencyKey = req.headers.get('x-idempotency-key');
    const idempotencyKey = validateIdempotencyKey(
      headerIdempotencyKey || (typeof bodyIdempotencyKey === 'string' ? bodyIdempotencyKey : null)
    );
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
