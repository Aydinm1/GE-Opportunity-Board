import { annotateApplicationRequest, traceApplicationStep } from '../../../lib/application-tracing';
import { getJobs, submitApplication } from '../../../lib/airtable';
import { jsonError, jsonOk } from '../../../lib/api-response';
import { applyRateLimit } from '../../../lib/rate-limit';
import { AppError } from '../../../lib/errors';
import { validateApplicationFormData, validateIdempotencyKey } from '../../../lib/validation';
import { createRequestId, safeEdgeRequestId, safeRequestId } from '../../../lib/request-diagnostics';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const requestId = safeRequestId(req.headers.get('x-request-id')) || createRequestId();
  const edgeRequestId = safeEdgeRequestId(req.headers.get('cf-ray')) || undefined;
  const started = Date.now();
  const diagnostics = { requestId, edgeRequestId };
  annotateApplicationRequest(requestId, edgeRequestId);
  console.info('Application request received', diagnostics);
  const response = await handleApplication(req, diagnostics);
  response.headers.set('x-request-id', requestId);
  response.headers.set('Cache-Control', 'no-store');
  console.info('Application request completed', { ...diagnostics, status: response.status, elapsedMs: Date.now() - started });
  return response;
}

async function handleApplication(req: Request, diagnostics: { requestId: string; edgeRequestId?: string }) {
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
      diagnostics,
    });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw new AppError('Expected multipart/form-data.', { status: 400 });
    }

    const formData = await traceApplicationStep('parse_form', async () => {
      try { return await req.formData(); }
      catch { throw new AppError('Invalid form payload.', { status: 400 }); }
    });
    const payload = await traceApplicationStep('validate', () => validateApplicationFormData(formData));
    const bodyIdempotencyKey = formData.get('idempotencyKey');
    const headerIdempotencyKey = req.headers.get('x-idempotency-key');
    const idempotencyKey = validateIdempotencyKey(
      headerIdempotencyKey || (typeof bodyIdempotencyKey === 'string' ? bodyIdempotencyKey : null)
    );
    const { jobs } = await traceApplicationStep('published_roles', () => getJobs());
    if (!jobs.some((job) => job.id === payload.jobId)) {
      throw new AppError('This role is no longer available. Please choose a current role.', { status: 400 });
    }
    await submitApplication({
      ...payload,
      idempotencyKey,
    });
    return jsonOk({ ok: true }, 200, limit.headers);
  } catch (err) {
    return jsonError(err, {
      context: '/api/applications',
      fallbackMessage: 'Failed to submit application',
      headers: limit.headers,
      diagnostics,
    });
  }
}
