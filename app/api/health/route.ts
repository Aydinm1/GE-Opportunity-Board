import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Reachability only. Deliberately does not call Airtable or disclose config.
export function GET() {
  return NextResponse.json({ ok: true, service: 'opportunity-board' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
