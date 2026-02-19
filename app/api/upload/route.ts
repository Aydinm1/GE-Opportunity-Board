import { NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { jsonError, jsonOk } from '../../../lib/api-response';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { dataUrl, filename } = body || {};
    if (!dataUrl || !filename) {
      return NextResponse.json({ error: 'Missing file data' }, { status: 400 });
    }

    const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 });
    }

    const [, mimeType, base64] = match;
    const buffer = Buffer.from(base64, 'base64');

    const uploadDir = path.resolve(process.cwd(), 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const safeName = `${Date.now()}-${String(filename).replace(/[^\w.\-]+/g, '_')}`;
    const filePath = path.join(uploadDir, safeName);
    await fs.promises.writeFile(filePath, buffer);

    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const baseUrl = process.env.AIRTABLE_APPLICATIONS_TABLE || (host ? `${protocol}://${host}` : '');
    const url = `${baseUrl.replace(/\/$/, '')}/uploads/${safeName}`;

    return jsonOk({ url, filename: safeName, mimeType });
  } catch (error) {
    return jsonError(error, {
      context: '/api/upload',
      fallbackMessage: 'Upload failed',
    });
  }
}
