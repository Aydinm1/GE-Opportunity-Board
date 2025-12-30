import { submitApplication } from '../route.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const result = await submitApplication(req.body);
    res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error('Error in /api/applications:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to submit application' });
  }
}
