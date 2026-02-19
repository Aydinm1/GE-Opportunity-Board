import { getJobs } from '../../../lib/airtable';
import { jsonError, jsonOk } from '../../../lib/api-response';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await getJobs();
    return jsonOk(data);
  } catch (err) {
    return jsonError(err, {
      context: '/api/jobs',
      fallbackMessage: 'Failed to fetch jobs',
    });
  }
}
