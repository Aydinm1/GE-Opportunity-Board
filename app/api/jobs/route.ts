import { getJobs } from '../../../lib/airtable';
import { jsonError, jsonOk } from '../../../lib/api-response';
import { JOBS_LOAD_ERROR_MESSAGE } from '../../../lib/jobs-load';

export const runtime = 'nodejs';
export const revalidate = 300;

const JOBS_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

export async function GET() {
  try {
    const data = await getJobs();
    return jsonOk(data, 200, {
      'Cache-Control': JOBS_CACHE_CONTROL,
    });
  } catch (err) {
    return jsonError(err, {
      context: '/api/jobs',
      fallbackMessage: JOBS_LOAD_ERROR_MESSAGE,
    });
  }
}
