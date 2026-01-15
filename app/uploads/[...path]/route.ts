import * as fs from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.rtf': 'application/rtf',
};

export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } }
) {
  try {
    const uploadDir = path.resolve(process.cwd(), 'uploads');
    const requestedPath = params.path.join('/');
    const fullPath = path.resolve(uploadDir, requestedPath);

    if (!fullPath.startsWith(uploadDir + path.sep)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const data = await fs.promises.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
