import { submitApplication } from '../../../lib/airtable';
import { jsonError, jsonOk } from '../../../lib/api-response';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const result = await submitApplication(payload);
    return jsonOk({ ok: true, result });
  } catch (err) {
    return jsonError(err, {
      context: '/api/applications',
      fallbackMessage: 'Failed to submit application',
    });
  }
}
