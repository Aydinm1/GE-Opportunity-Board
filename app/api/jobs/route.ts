import { getJobs } from '../../../lib/airtable';
import { jsonError, jsonOk } from '../../../lib/api-response';
import { JOBS_LOAD_ERROR_MESSAGE } from '../../../lib/jobs-load';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await getJobs();
    return jsonOk(data);
  } catch (err) {
    return jsonError(err, {
      context: '/api/jobs',
      fallbackMessage: JOBS_LOAD_ERROR_MESSAGE,
    });
  }
}
