import { NextResponse } from 'next/server';
import { submitApplication } from '../../../lib/airtable';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const result = await submitApplication(payload);
    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (err) {
    console.error('Error in /api/applications:', err);
    const message = err instanceof Error ? err.message : 'Failed to submit application';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
