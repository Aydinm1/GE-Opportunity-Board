import { getJobs } from '../route.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const data = await getJobs();
    res.status(200).json(data);
  } catch (err) {
    console.error('Error in /api/jobs:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch jobs' });
  }
}
