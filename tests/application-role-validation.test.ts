import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/applications/route';
import { GET } from '../app/api/jobs/route';

vi.mock('../lib/monitoring', () => ({ captureServerException: vi.fn() }));
let requestCount = 0;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const job = (id: string) => ({ id, fields: { 'Published?': true, 'Role Title': 'Test role' } });

function request(jobId = 'recJob101', file = new File(['%PDF-1.7 test'], 'cv.pdf', { type: 'application/pdf' })) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    fullName: 'Test Applicant', emailAddress: 'test@example.com', phoneNumber: '+15550100',
    age: '25-34', gender: 'female', countryOfOrigin: 'Canada', countryOfLiving: 'Canada',
    education: 'Education', profession: 'Profession', jamatiExperience: 'Experience', whyText: 'Test answer', jobId,
  })) form.set(key, value);
  form.set('cvResume', file);
  return new Request('http://localhost/api/applications', { method: 'POST', body: form, headers: { 'x-forwarded-for': `192.0.2.${++requestCount}` } });
}

beforeEach(() => {
  vi.stubEnv('AIRTABLE_TOKEN', 'test-token');
  vi.stubEnv('AIRTABLE_BASE_ID', 'appTest');
  vi.stubEnv('AIRTABLE_GEROLES_TABLE', 'Roles');
  vi.stubEnv('AIRTABLE_JOBS_VIEW', 'Published View');
  vi.stubEnv('AIRTABLE_PEOPLE_TABLE', 'People');
  vi.stubEnv('AIRTABLE_APPLICATIONS_TABLE', 'Applications');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function pages() {
  return [json({ records: Array.from({ length: 100 }, (_, i) => job(`recJob${i + 1}`)), offset: 'next/page+token' }), json({ records: [job('recJob101')] })];
}

describe('complete published role lookup', () => {
  it('follows offsets and preserves filters, view, fields and cache on every page', async () => {
    const responses = pages();
    const fetch = vi.fn(async (..._args: unknown[]) => responses.shift()!);
    vi.stubGlobal('fetch', fetch);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).jobs).toHaveLength(101);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [input, init] of fetch.mock.calls as unknown as [string, RequestInit & { next: unknown }][]) {
      const url = new URL(input);
      expect(url.searchParams.get('filterByFormula')).toBe('{Published?}=1');
      expect(url.searchParams.get('view')).toBe('Published View');
      expect(url.searchParams.getAll('fields[]')).toContain('TOR Upload');
      expect(init.cache).toBe('force-cache');
      expect(init.next).toEqual({ revalidate: 300, tags: ['jobs'] });
    }
    expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get('offset')).toBe('next/page+token');
  });

  it('restarts pagination if an optional field is missing on a later page', async () => {
    const responses = [
      json({ records: [job('recFirst')], offset: 'second' }),
      json({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "TOR Upload"' } }, 422),
      json({ records: [job('recFirst')], offset: 'second' }),
      json({ records: [job('recLast')] }),
    ];
    const fetch = vi.fn(async (..._args: unknown[]) => responses.shift()!);
    vi.stubGlobal('fetch', fetch);
    const response = await GET();
    expect((await response.json()).jobs.map((j: { id: string }) => j.id)).toEqual(['recFirst', 'recLast']);
    expect(new URL(String(fetch.mock.calls[2][0])).searchParams.has('offset')).toBe(false);
    expect(new URL(String(fetch.mock.calls[3][0])).searchParams.getAll('fields[]')).not.toContain('TOR Upload');
  });

  it('fails rather than returning a partial list when a later page fails', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(pages()[0]).mockResolvedValueOnce(json({ error: 'unavailable' }, 503));
    vi.stubGlobal('fetch', fetch);
    expect((await GET()).status).toBe(500);
  });

  it('stops a repeated pagination cursor', async () => {
    const fetch = vi.fn(async () => json({ records: [], offset: 'repeated' }));
    vi.stubGlobal('fetch', fetch);
    expect((await GET()).status).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['recUnpublished', 'recExcludedByView'])('rejects %s before any writes', async id => {
    const fetch = vi.fn(async () => json({ records: [job('recPublished')] }));
    vi.stubGlobal('fetch', fetch);
    expect((await POST(request(id))).status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('accepts a published role on page two and uploads the application CV', async () => {
    const responses = [...pages(), json({ records: [{ id: 'recPerson', fields: {} }] }),
      json({ records: [{ id: 'recApplication', fields: {} }] }),
      json({ attachment: { id: 'attCV', url: 'https://example.com/cv.pdf' } })];
    const fetch = vi.fn(async (..._args: unknown[]) => responses.shift()!);
    vi.stubGlobal('fetch', fetch);
    expect((await POST(request())).status).toBe(200);
    const creates = fetch.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST');
    expect(JSON.parse(String((creates[0][1] as RequestInit).body)).records[0].fields['GE Roles']).toEqual(['recJob101']);
    expect(responses).toHaveLength(0);
  });

  it('fails a role lookup outage before creating records', async () => {
    const fetch = vi.fn(async () => json({ error: 'unavailable' }, 503));
    vi.stubGlobal('fetch', fetch);
    expect((await POST(request())).status).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed ID before any Airtable calls', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await POST(request('not-a-record'))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects mismatched CV contents before any Airtable calls', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await POST(request('recJob101', new File(['bad'], 'cv.pdf', { type: 'application/pdf' })))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
