import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureServerException } from '../lib/monitoring';

vi.mock('../lib/monitoring', () => ({ captureServerException: vi.fn() }));
const originalEnv = { ...process.env };
const WHY = 'Why are you interested in or qualified for this job?';
const EMAIL = 'applicant@example.invalid';
const PRIVATE = 'PRIVATE_APPLICANT_SENTINEL';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
type RecordData = { id: string; fields: Record<string, unknown> };

beforeEach(() => {
  vi.resetModules();
  vi.mocked(captureServerException).mockClear();
  process.env.AIRTABLE_TOKEN = 'test-token';
  process.env.AIRTABLE_BASE_ID = 'appTest';
  process.env.AIRTABLE_PEOPLE_TABLE = 'People';
  process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

function form(overrides: Record<string, string> = {}, file?: File) {
  const data = new FormData();
  const fields = {
    fullName: 'Synthetic applicant', emailAddress: EMAIL, phoneNumber: '+1 555 0100',
    age: '18-24', gender: 'female', countryOfOrigin: 'United States', countryOfLiving: 'United States',
    education: 'Synthetic education', profession: 'Synthetic profession', jamatiExperience: 'Synthetic experience',
    jobId: 'recRole', whyText: 'Synthetic application answer', formStartedAt: '1', submittedAt: '2500',
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set('cvResume', file ?? new File(['%PDF-1.4\nSynthetic resume'], 'synthetic.pdf', { type: 'application/pdf' }));
  return data;
}
async function submit(key = 'submission-key', overrides: Record<string, string> = {}, file?: File) {
  const { POST } = await import('../app/api/applications/route');
  return POST(new Request('http://localhost/api/applications', {
    method: 'POST', headers: { 'x-idempotency-key': key, 'x-forwarded-for': '203.0.113.10' }, body: form(overrides, file),
  }));
}
function existing(fields: Record<string, unknown> = {}): RecordData {
  return { id: 'recApplication', fields: { People: ['recPerson'], 'GE Roles': ['recRole'], [WHY]: 'Synthetic application answer', 'Idempotency Key': 'submission-key', ...fields } };
}

// Stateful fake Airtable: retries observe the records written by earlier requests.
// This verifies the complete create/upload/resume sequence, rather than only mocked return values.
function airtable() {
  const people = new Map<string, RecordData>([[EMAIL, { id: 'recPerson', fields: {} }]]);
  const applications = new Map<string, RecordData>();
  const state = { uploadReply: 'record' as 'record' | 'fieldIds' | 'attachment' | 'id' | 'unrelated' | 'empty' | 'wrongRecord', uploadFailures: 0, rejectField: '', failAt: '', people, applications, creates: 0, uploads: 0, patches: 0 };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const endpoint = url.hostname === 'content.airtable.com' ? 'upload' : url.pathname.endsWith('/People') ? 'people' : 'applications';
    if (state.failAt === `${endpoint}:${method}`) return json({ error: { type: 'INVALID_VALUE_FOR_COLUMN', message: `Rejected applicant value "${PRIVATE}"` } }, 422);
    if (endpoint === 'people' && method === 'GET') {
      const email = url.searchParams.get('filterByFormula')?.match(/'([^']+)'/)?.[1];
      return json({ records: people.has(email ?? '') ? [people.get(email!)] : [] });
    }
    if (endpoint === 'people' && method === 'POST') {
      const fields = JSON.parse(String(init?.body)).records[0].fields;
      const record = { id: `recPerson${people.size + 1}`, fields };
      people.set(fields['Email Address'].toLowerCase(), record);
      return json({ records: [record] });
    }
    if (endpoint === 'applications' && method === 'GET') {
      const recordId = url.pathname.split('/')[4];
      if (recordId) {
        if (state.failAt === 'verification:GET') return json({ error: { type: 'NOT_AUTHORIZED', message: `Cannot read "${PRIVATE}"` } }, 403);
        const record = [...applications.values()].find(record => record.id === recordId);
        return record ? json(record) : json({ error: { type: 'NOT_FOUND' } }, 404);
      }
      const key = url.searchParams.get('filterByFormula')?.match(/'([^']+)'/)?.[1];
      return json({ records: applications.has(key ?? '') ? [applications.get(key!)] : [] });
    }
    if (endpoint === 'applications' && method === 'POST') {
      state.creates++;
      const fields = JSON.parse(String(init?.body)).records[0].fields;
      if (state.rejectField && state.rejectField in fields) return json({ error: { type: 'UNKNOWN_FIELD_NAME', message: `Unknown field name: "${state.rejectField}"` } }, 422);
      const record = { id: `recApplication${state.creates}`, fields };
      applications.set(fields['Idempotency Key'], record);
      return json({ records: [record] });
    }
    if (endpoint === 'upload') {
      state.uploads++;
      if (state.uploadFailures-- > 0) return json({ error: { type: 'INVALID_VALUE_FOR_COLUMN', message: `Cannot save "${PRIVATE}"` } }, 422);
      const record = [...applications.values()].find(record => record.id === url.pathname.split('/')[3]);
      if (!record) throw new Error('Unknown upload target');
      if (state.uploadReply !== 'unrelated') record.fields['CV / Resume'] = [{ id: 'attResume', url: 'https://files.example/resume.pdf', filename: 'synthetic.pdf' }];
      if (state.uploadReply === 'wrongRecord') return json({ id: 'recOther', fields: { 'CV / Resume': record.fields['CV / Resume'] } });
      if (state.uploadReply === 'fieldIds') return json({ id: record.id, fields: { fldCvResponse: record.fields['CV / Resume'] } });
      if (state.uploadReply === 'attachment') return json({ attachment: { id: 'attResume', url: 'https://files.example/resume.pdf' } });
      if (state.uploadReply === 'id') return json({ id: 'attResume' });
      if (state.uploadReply === 'unrelated') return json({ id: record.id, fields: { Other: [{ id: 'attOther' }] } });
      if (state.uploadReply === 'empty') return json({ id: record.id, fields: { 'CV / Resume': [] } });
      return json({ id: record.id, fields: { 'CV / Resume': record.fields['CV / Resume'] } });
    }
    if (endpoint === 'applications' && method === 'PATCH') {
      state.patches++;
      const updated = JSON.parse(String(init?.body)).records[0];
      const record = [...applications.values()].find(record => record.id === updated.id)!;
      Object.assign(record.fields, updated.fields);
      return json({ records: [record] });
    }
    throw new Error('Unexpected Airtable request');
  });
  vi.stubGlobal('fetch', fetchMock);
  return { state, fetchMock };
}

describe('application recovery and privacy', () => {
  it('returns only the minimal success response', async () => {
    airtable();
    expect(await (await submit()).json()).toEqual({ ok: true });
  });

  it('resumes a failed upload on the same application rather than accepting a missing CV', async () => {
    const { state } = airtable();
    state.uploadFailures = 1;
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    expect((await submit()).status).toBe(200);
    expect(state.creates).toBe(1);
    expect(state.uploads).toBe(2);
    expect(state.applications.get('submission-key')?.fields['CV / Resume']).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'attResume' })]));
    expect(state.patches).toBe(0);
  });

  it('resumes across a cold module restart without creating another application', async () => {
    const { state } = airtable();
    state.uploadFailures = 1;
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    vi.resetModules();
    expect((await submit()).status).toBe(200);
    expect(state.creates).toBe(1);
    expect(state.uploads).toBe(2);
  });

  it('returns an error again when the resumed upload also fails', async () => {
    const { state } = airtable();
    state.uploadFailures = 2;
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    expect(state.creates).toBe(1);
    expect(state.uploads).toBe(2);
  });

  it('does not upload again when a matching persisted application already has a CV', async () => {
    const { state } = airtable();
    state.applications.set('submission-key', existing({ 'CV / Resume': [{ id: 'attExisting' }] }));
    expect((await submit()).status).toBe(200);
    expect(state.uploads).toBe(0);
    expect(state.creates).toBe(0);
  });

  it.each([
    { People: ['recOtherPerson'] },
    { 'GE Roles': ['recOtherRole'] },
    { People: [] },
    { 'GE Roles': [] },
  ])('rejects an incompatible persisted idempotency match: %j', async fields => {
    const { state } = airtable();
    state.applications.set('submission-key', existing(fields));
    expect((await submit()).status).toBe(409);
    expect(state.uploads).toBe(0);
    expect(state.creates).toBe(0);
  });

  it.each([{ emailAddress: 'other@example.invalid' }, { jobId: 'recOtherRole' }])('checks identity and role before a completed cache hit: %j', async overrides => {
    const { state, fetchMock } = airtable();
    expect((await submit()).status).toBe(200);
    const calls = fetchMock.mock.calls.length;
    expect((await submit('submission-key', overrides)).status).toBe(409);
    expect(state.creates).toBe(1);
    expect(fetchMock.mock.calls).toHaveLength(calls);
  });

  it('creates a new person and application normally', async () => {
    const { state } = airtable();
    state.people.clear();
    expect((await submit()).status).toBe(200);
    expect(state.people.size).toBe(1);
    expect(state.creates).toBe(1);
    expect(state.uploads).toBe(1);
  });

  it("rejects another person's persisted key before creating a People record", async () => {
    const { state } = airtable();
    state.people.clear();
    state.applications.set('submission-key', existing());
    expect((await submit()).status).toBe(409);
    expect(state.people.size).toBe(0);
    expect(state.creates).toBe(0);
    expect(state.uploads).toBe(0);
  });

  it.each([
    { [WHY]: 'A different saved answer' },
    { [WHY]: undefined },
  ])('does not silently accept a persisted missing or different answer: %j', async fields => {
    const { state } = airtable();
    state.applications.set('submission-key', existing(fields));
    expect((await submit()).status).toBe(409);
    expect(state.uploads).toBe(0);
  });

  it('accepts equivalent stored line endings when resuming', async () => {
    const { state } = airtable();
    state.applications.set('submission-key', existing({ [WHY]: 'First line\r\nSecond line' }));
    expect((await submit('submission-key', { whyText: 'First line\nSecond line' })).status).toBe(200);
  });

  it('rejects a changed answer rather than reusing cached success', async () => {
    airtable();
    expect((await submit()).status).toBe(200);
    expect((await submit('submission-key', { whyText: 'Changed answer' })).status).toBe(409);
  });

  it('rejects changed CV bytes even when the filename is unchanged', async () => {
    airtable();
    expect((await submit()).status).toBe(200);
    const changed = new File(['%PDF-1.4\nChanged bytes'], 'synthetic.pdf', { type: 'application/pdf' });
    expect((await submit('submission-key', {}, changed)).status).toBe(409);
  });

  it.each([{ emailAddress: 'other@example.invalid' }, { jobId: 'recOtherRole' }, { whyText: 'Changed answer' }])('checks in-flight requests before sharing their result: %j', async overrides => {
    const { fetchMock } = airtable();
    const originalFetch = fetchMock.getMockImplementation()!;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/Applications') && init?.method === 'POST') {
        entered();
        await gate;
      }
      return originalFetch(input, init);
    });
    const first = submit();
    await started;
    let second: Response;
    try { second = await submit('submission-key', overrides); } finally { release(); }
    expect((await first).status).toBe(200);
    expect(second!.status).toBe(409);
  });

  it.each(['record', 'fieldIds', 'attachment', 'id'] as const)('accepts the supported %s attachment response', async shape => {
    const { state } = airtable();
    state.uploadReply = shape;
    expect((await submit()).status).toBe(200);
    expect(state.patches).toBe(0);
  });

  it('does not infer a saved CV from an unrelated attachment field', async () => {
    const { state } = airtable();
    state.uploadReply = 'unrelated';
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    expect(state.creates).toBe(1);
    expect(state.uploads).toBe(2);
  });

  it('uses a fresh target-field read to verify an empty upload response', async () => {
    const { state, fetchMock } = airtable();
    state.uploadReply = 'empty';
    expect((await submit()).status).toBe(200);
    const reads = fetchMock.mock.calls.filter(([url]) => String(url).includes('/Applications/recApplication'));
    expect(reads).toHaveLength(1);
    expect(reads[0][1]?.cache).toBe('no-store');
  });

  it('rejects an upload response associated with a different record', async () => {
    const { state } = airtable();
    state.uploadReply = 'wrongRecord';
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
  });

  it('does not cache success if field-ID response verification fails', async () => {
    const { state } = airtable();
    state.uploadReply = 'fieldIds';
    state.failAt = 'verification:GET';
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    // The uploaded CV appears on the next fresh application lookup. It must not be uploaded twice.
    expect((await submit()).status).toBe(200);
    expect(state.creates).toBe(1);
    expect(state.uploads).toBe(1);
  });

  it('recovers when the upload committed but its HTTP response was lost', async () => {
    const { state, fetchMock } = airtable();
    const originalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const response = await originalFetch(input, init);
      if (String(input).startsWith('https://content.airtable.com')) throw new TypeError(`Network error "${PRIVATE}"`);
      return response;
    });
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    expect((await submit()).status).toBe(200);
    expect(state.creates).toBe(1);
    expect(state.uploads).toBe(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(PRIVATE);
  });

  it('only uses the legacy email lookup when the normalized field is actually missing', async () => {
    const { state, fetchMock } = airtable();
    fetchMock.mockResolvedValueOnce(json({ error: { type: 'INVALID_FILTER_BY_FORMULA', message: 'Unknown field names: normalized email' } }, 422));
    expect((await submit()).status).toBe(200);
    expect(state.people.size).toBe(1);
  });

  it('does not turn an Airtable lookup failure into a fallback or a new person', async () => {
    const { state, fetchMock } = airtable();
    state.failAt = 'people:GET';
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.creates).toBe(0);
  });

  it('does not log private response snippets from JSON parsing failures', async () => {
    const { fetchMock } = airtable();
    fetchMock.mockResolvedValueOnce(new Response(`not-json-${PRIVATE}`));
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    const logged = JSON.stringify([vi.mocked(console.error).mock.calls, vi.mocked(captureServerException).mock.calls], (_key, value) => value instanceof Error ? { message: value.message, cause: value.cause, stack: value.stack } : value);
    expect(logged).not.toContain(PRIVATE);
  });

  it.each([WHY, 'Status', 'Source', 'People', 'GE Roles', 'Idempotency Key'])('never retries without a required application field: %s', async field => {
    const { state } = airtable();
    state.rejectField = field;
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    expect(state.creates).toBe(1);
    expect(state.applications.size).toBe(0);
  });

  it.each(['people:GET', 'applications:GET', 'applications:POST', 'upload:POST'])('never logs raw Airtable error values from %s', async endpoint => {
    const { state } = airtable();
    state.failAt = endpoint;
    expect((await submit()).status).toBeGreaterThanOrEqual(400);
    const logged = JSON.stringify([vi.mocked(console.warn).mock.calls, vi.mocked(console.error).mock.calls, vi.mocked(captureServerException).mock.calls], (_key, value) => value instanceof Error ? { message: value.message, cause: value.cause, stack: value.stack } : value);
    expect(logged).not.toContain(PRIVATE);
  });
});
