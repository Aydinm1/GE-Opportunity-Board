import { getTorAttachment } from '../../../../../../lib/airtable';
import { jsonError } from '../../../../../../lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; attachmentId: string }> }
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const { jobId, attachmentId } = await params;
    const attachment = await getTorAttachment(jobId, attachmentId);
    const destination = new URL(attachment.url);
    // Only fetch Airtable's attachment CDN; never proxy arbitrary record URLs
    // or follow redirects to a different host. Do not forward the Airtable token.
    if (destination.protocol !== 'https:' || !(destination.hostname === 'airtableusercontent.com' ||
        destination.hostname.endsWith('.airtableusercontent.com') || destination.hostname === 'dl.airtable.com')) {
      throw new Error('TOR attachment destination is not an Airtable CDN URL');
    }
    const file = await fetch(destination.href, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!file.ok || !file.body) throw new Error(`TOR download failed (${file.status})`);
    const filename = (attachment.filename || 'TOR').replace(/[\x00-\x1f\x7f/\\]/g, '_');
    const asciiFilename = filename.replace(/[^\x20-\x7e]|[";]/g, '_');
    const encodedFilename = encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(file.body, {
      headers: {
        ...headers,
        'Content-Type': file.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return jsonError(error, {
      context: '/api/jobs/[jobId]/tor/[attachmentId]',
      fallbackMessage: 'We could not download this TOR document. Please return to the role and try again.',
      headers,
    });
  }
}
