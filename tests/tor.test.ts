import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getJobs } from '../app/api/jobs/route';
import { GET as getTor } from '../app/api/jobs/[jobId]/tor/[attachmentId]/route';
import { getTorLinks } from '../lib/tor';

const originalEnv = { ...process.env };
const upload = { id: 'attOne', filename: 'Role TOR.pdf', url: 'https://files.example/old.pdf' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const role = (fields: Record<string, unknown>) => ({ id: 'recRole', fields: { 'Published?': true, ...fields } });
const request = () => getTor(new Request('http://localhost/api/jobs/recRole/tor/attOne?url=https://evil.example'), {
  params: Promise.resolve({ jobId: 'recRole', attachmentId: 'attOne' }),
});

beforeEach(() => {
  process.env.AIRTABLE_TOKEN = 'test-token';
  process.env.AIRTABLE_BASE_ID = 'appTest';
  process.env.AIRTABLE_GEROLES_TABLE = 'GE Roles';
  process.env.AIRTABLE_JOBS_VIEW = 'Public roles';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

describe('TOR job mapping and selection', () => {
  it.each([
    ['upload only', { 'TOR Upload': [upload] }, ['Role TOR.pdf']],
    ['link only', { TOR: ' https://example.org/tor ' }, ['View TOR']],
    ['both populated', { TOR: 'https://example.org/tor', 'TOR Upload': [upload] }, ['Role TOR.pdf']],
    ['multiple uploads', { 'TOR Upload': [upload, { ...upload, id: 'attTwo', filename: '' }] }, ['Role TOR.pdf', 'View TOR']],
    ['empty fields', { TOR: '', 'TOR Upload': [] }, []],
    ['missing fields', {}, []],
    ['unsafe link', { TOR: 'javascript:alert(1)' }, []],
    ['malformed link', { TOR: 'not a URL' }, []],
    ['unsafe uploads fall back to link', { TOR: 'https://example.org/tor', 'TOR Upload': [{ ...upload, url: 'data:text/html,evil' }, null] }, ['View TOR']],
  ])('%s', async (_name, fields, labels) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ records: [role(fields)] })));
    const response = await getJobs();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(getTorLinks(body.jobs[0]).map((link) => link.label)).toEqual(labels);
    expect(JSON.stringify(body)).not.toContain('https://files.example/old.pdf');
    if (body.jobs[0].torDocuments.length) {
      expect(body.jobs[0].torDocuments[0].href).toBe('/api/jobs/recRole/tor/attOne');
    }
  });

  it('retries without either missing optional TOR field', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "TOR"' } }, 422))
      .mockResolvedValueOnce(json({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "TOR Upload"' } }, 422))
      .mockResolvedValueOnce(json({ records: [role({})] }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await getJobs();
    expect(response.status).toBe(200);
    const url = new URL(fetchMock.mock.calls[2][0]);
    expect(url.searchParams.getAll('fields[]')).not.toContain('TOR');
    expect(url.searchParams.getAll('fields[]')).not.toContain('TOR Upload');
  });
});

describe('fresh TOR attachment redirect', () => {
  it('fetches a fresh URL on every click with publication/view filtering and no caching', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ records: [role({ 'TOR Upload': [{ ...upload, url: 'https://files.example/fresh1.pdf' }] })] }))
      .mockResolvedValueOnce(json({ records: [role({ 'TOR Upload': [{ ...upload, url: 'https://files.example/fresh2.pdf' }] })] }));
    vi.stubGlobal('fetch', fetchMock);
    for (let index = 1; index <= 2; index++) {
      const response = await request();
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`https://files.example/fresh${index}.pdf`);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('filterByFormula')).toBe("AND({Published?}=1,RECORD_ID()='recRole')");
    expect(url.searchParams.get('view')).toBe('Public roles');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', headers: { Authorization: 'Bearer test-token' } });
  });

  it.each([
    ['removed attachment', [role({ 'TOR Upload': [] })]],
    ['excluded or removed role', []],
    ['unpublished role', [role({ 'Published?': false, 'TOR Upload': [upload] })]],
    ['unsafe attachment URL', [role({ 'TOR Upload': [{ ...upload, url: 'javascript:alert(1)' }] })]],
    ['wrong role returned', [{ ...role({ 'TOR Upload': [upload] }), id: 'recOther' }]],
  ])('rejects %s', async (_name, records) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ records })));
    const response = await request();
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).error).toContain('no longer available');
  });

  it('rejects invalid identifiers before calling Airtable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await getTor(new Request('http://localhost'), { params: Promise.resolve({ jobId: "rec'bad", attachmentId: 'attOne' }) });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an unavailable document when the upload field was removed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "TOR Upload"' } }, 422)));
    const response = await request();
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
  });

  it('returns a friendly error without leaking Airtable details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream details', { status: 503 })));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'We could not open this TOR document. Please return to the role and try again.' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
