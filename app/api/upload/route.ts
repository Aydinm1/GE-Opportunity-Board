import * as fs from 'node:fs';
import * as path from 'node:path';
import { jsonError, jsonOk } from '../../../lib/api-response';
import { applyRateLimit } from '../../../lib/rate-limit';
import { AppError } from '../../../lib/errors';
import { validateLegacyUploadPayload } from '../../../lib/validation';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const limit = applyRateLimit(req, {
    scope: 'api:upload',
    limit: 5,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return jsonError(new AppError('Too many upload attempts. Please try again shortly.', { status: 429 }), {
      context: '/api/upload',
      fallbackMessage: 'Rate limit exceeded',
      status: 429,
      headers: limit.headers,
    });
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      throw new AppError('Invalid JSON payload.', { status: 400 });
    }
    const body = validateLegacyUploadPayload(rawBody);
    const { dataUrl, filename, mimeType, base64 } = body;
    const buffer = Buffer.from(base64, 'base64');

    const uploadDir = path.resolve(process.cwd(), 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const safeName = `${Date.now()}-${String(filename).replace(/[^\w.\-]+/g, '_')}`;
    const filePath = path.join(uploadDir, safeName);
    await fs.promises.writeFile(filePath, buffer);

    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const configuredBaseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      '';
    const baseUrl = configuredBaseUrl || (host ? `${protocol}://${host}` : '');
    const url = `${baseUrl.replace(/\/$/, '')}/uploads/${safeName}`;

    return jsonOk({ url, filename: safeName, mimeType }, 200, limit.headers);
  } catch (error) {
    return jsonError(error, {
      context: '/api/upload',
      fallbackMessage: 'Upload failed',
      headers: limit.headers,
    });
  }
}
