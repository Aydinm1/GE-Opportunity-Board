import { AppError } from '../../../lib/errors';
import { jsonError, jsonOk } from '../../../lib/api-response';

export const runtime = 'nodejs';

export async function POST() {
  if (process.env.NEXT_PUBLIC_ENABLE_SENTRY_SMOKE_TESTS !== 'true') {
    return jsonError(new AppError('Not found.', { status: 404 }), {
      context: '/api/sentry-test',
      fallbackMessage: 'Not found',
      status: 404,
    });
  }

  try {
    throw new Error('Sentry server smoke test');
  } catch (err) {
    return jsonError(err, {
      context: '/api/sentry-test',
      fallbackMessage: 'Sentry server smoke test triggered',
    });
  }
}

export async function GET() {
  if (process.env.NEXT_PUBLIC_ENABLE_SENTRY_SMOKE_TESTS !== 'true') {
    return jsonError(new AppError('Not found.', { status: 404 }), {
      context: '/api/sentry-test',
      fallbackMessage: 'Not found',
      status: 404,
    });
  }

  return jsonOk({
    ok: true,
    message: 'Use POST /api/sentry-test to trigger a gated server-side Sentry smoke test.',
  });
}
