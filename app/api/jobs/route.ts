import { NextResponse } from 'next/server';
import { getJobs } from '../../../lib/airtable';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await getJobs();
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('Error in /api/jobs:', err);
    const message = err instanceof Error ? err.message : 'Failed to fetch jobs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
