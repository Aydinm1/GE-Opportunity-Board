import { getTorAttachmentUrl } from '../../../../../../lib/airtable';
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
    const destination = await getTorAttachmentUrl(jobId, attachmentId);
    return new Response(null, { status: 302, headers: { ...headers, Location: destination } });
  } catch (error) {
    return jsonError(error, {
      context: '/api/jobs/[jobId]/tor/[attachmentId]',
      fallbackMessage: 'We could not open this TOR document. Please return to the role and try again.',
      headers,
    });
  }
}
