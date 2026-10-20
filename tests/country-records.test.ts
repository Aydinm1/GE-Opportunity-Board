import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTRY_OPTIONS } from '../lib/application-select-options';
import { loadCountryRecords, matchCountryRecord } from '../lib/country-records';
import { POST } from '../app/api/applications/route';
import { captureServerException } from '../lib/monitoring';

vi.mock('../lib/monitoring', () => ({ captureServerException: vi.fn() }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const row = (id: string, name: string, jurisdiction?: string) => ({ id, fields: { Name: name, Jurisdiction: jurisdiction } });
const malformedDirectoryRows = [
  { label: 'missing fields', record: { id: 'recBad' } },
  ...[null, [], 'invalid', 42, true].map(fields => ({ label: `fields ${JSON.stringify(fields)}`, record: { id: 'recBad', fields } })),
  { label: 'null record', record: null },
];
let ip = 0;
let config = 0;
beforeEach(() => {
  vi.stubEnv('AIRTABLE_TOKEN', `test-token-${++config}`); vi.stubEnv('AIRTABLE_BASE_ID', 'appTest');
  vi.stubEnv('AIRTABLE_GEROLES_TABLE', 'Roles');
  vi.stubEnv('AIRTABLE_COUNTRIES_TABLE', 'Country / Jurisdiction Table');
  vi.stubEnv('AIRTABLE_PEOPLE_TABLE', 'People'); vi.stubEnv('AIRTABLE_APPLICATIONS_TABLE', 'Applications');
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(captureServerException).mockClear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const records = COUNTRY_OPTIONS.map((name, index) => ({ id: `recCountry${index}`, name: name.toUpperCase() }));
describe('country directory matching', () => {
  it.each(COUNTRY_OPTIONS)('maps supported country %s to its existing record ID', name => {
    expect(matchCountryRecord(` ${name} `, records)).toEqual({ kind: 'resolved', id: `recCountry${COUNTRY_OPTIONS.indexOf(name)}` });
  });
  it('prefers the uniquely assigned jurisdiction rather than a same-case unassigned duplicate', () => {
    expect(matchCountryRecord('Canada', [{ id: 'recOld', name: 'Canada' }, { id: 'recAssigned', name: 'CANADA ', jurisdiction: 'Canada' }])).toEqual({ kind: 'resolved', id: 'recAssigned' });
  });
  it.each([
    [{ id: 'recA', name: 'Canada' }, { id: 'recB', name: 'CANADA' }],
    [{ id: 'recA', name: 'Canada', jurisdiction: 'Canada' }, { id: 'recB', name: 'CANADA', jurisdiction: 'Canada' }],
    [{ id: 'recA', name: 'Canada', jurisdiction: 'A' }, { id: 'recB', name: 'CANADA', jurisdiction: 'B' }],
  ].map(rows => ({ rows })))('never guesses between unresolved duplicate records', ({ rows }) => { expect(matchCountryRecord('Canada', rows)).toEqual({ kind: 'ambiguous' }); });
  it('does not fuzzy-match another country or create a missing one', () => {
    expect(matchCountryRecord('Unknown', records)).toEqual({ kind: 'missing' });
    expect(matchCountryRecord('Korea South', [{ id: 'recNorth', name: 'Korea North' }])).toEqual({ kind: 'missing' });
  });
});

describe('country directory reads', () => {
  it('follows every page, requests both fields, and leaves temporary cursors uncached', async () => {
    const mock = vi.fn().mockResolvedValueOnce(json({ records: [row('recA', 'A')], offset: 'page+2' })).mockResolvedValueOnce(json({ records: [row('recB', 'B', 'Jurisdiction')] }));
    vi.stubGlobal('fetch', mock);
    expect(await loadCountryRecords()).toEqual([{ id: 'recA', name: 'A', jurisdiction: undefined }, { id: 'recB', name: 'B', jurisdiction: 'Jurisdiction' }]);
    expect(new URL(mock.mock.calls[1][0]).searchParams.get('offset')).toBe('page+2');
    for (const [url, options] of mock.mock.calls) {
      expect(new URL(url).searchParams.getAll('fields[]')).toEqual(['Name', 'Jurisdiction']);
      expect(options.cache).toBe('no-store');
      expect(options).not.toHaveProperty('next');
    }
  });
  it('disables caching for live mapping checks', async () => {
    const mock = vi.fn().mockResolvedValue(json({ records: [] })); vi.stubGlobal('fetch', mock);
    await loadCountryRecords({ cache: false }); expect(mock.mock.calls[0][1].cache).toBe('no-store');
  });
  it('does not let an unrelated blank country row block submissions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ records: [row('recBlank', ''), row('recWhitespace', '  '), { id: 'recEmpty', fields: {} }, row('recValid', 'Canada')] })));
    expect(await loadCountryRecords()).toEqual([{ id: 'recValid', name: 'Canada', jurisdiction: undefined }]);
  });
  it.each(malformedDirectoryRows)('rejects malformed directory rows ($label)', async ({ record }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ records: [row('recValid', 'Canada'), record] })));
    await expect(loadCountryRecords()).rejects.toThrow('Invalid Airtable country directory record');
  });
  it('does not return a partial directory after a later-page failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ records: [row('recA', 'A')], offset: 'next' })).mockResolvedValueOnce(json({}, 503)));
    await expect(loadCountryRecords()).rejects.toThrow('(503;');
  });
  it('rejects repeated cursors', async () => {
    const mock = vi.fn().mockImplementation(async () => json({ records: [], offset: 'same' })); vi.stubGlobal('fetch', mock);
    await expect(loadCountryRecords()).rejects.toThrow('pagination'); expect(mock).toHaveBeenCalledTimes(2);
  });
});

function request() {
  const form = new FormData();
  for (const [name, value] of Object.entries({ fullName: 'Test Applicant', emailAddress: 'person@example.test', phoneNumber: '+15550100', age: '25-34', gender: 'female', countryOfOrigin: 'Canada', countryOfLiving: 'Canada', education: 'Education', profession: 'Profession', jamatiExperience: 'Experience', whyText: 'Test answer', jobId: 'recRole' })) form.set(name, value);
  form.set('cvResume', new File(['Synthetic CV'], 'cv.txt', { type: 'text/plain' }));
  return new Request('http://localhost/api/applications', { method: 'POST', headers: { 'x-forwarded-for': `192.0.2.${++ip}` }, body: form });
}
function mockApplication(directoryRows: unknown[], options: { directoryStatus?: number; returning?: boolean; notesFail?: boolean; directoryPages?: Array<{ records?: unknown[]; offset?: string; error?: { type: string }; status?: number }> } = {}) {
  const writes: Array<{ path: string; body: any }> = []; const countryReads: string[] = [];
  const mock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/Roles') && !init.method) return json({ records: [{ id: 'recRole', fields: { 'Published?': true, 'Role Title': 'Test role' } }] });
    if (url.pathname.endsWith('Country%20%2F%20Jurisdiction%20Table')) {
      countryReads.push(input);
      if (options.directoryPages?.length) {
        const { status = 200, ...body } = options.directoryPages.shift()!;
        return json(body, status);
      }
      return json({ records: directoryRows }, options.directoryStatus ?? 200);
    }
    if (url.pathname.endsWith('/People') && !init.method) return json({ records: options.returning ? [{ id: 'recPerson', fields: { 'Notes RE: Candidate': 'Existing notes' } }] : [] });
    const body = JSON.parse(String(init.body)); writes.push({ path: url.pathname, body });
    if (url.pathname.endsWith('/People')) {
      if (options.notesFail && body.records[0].fields['Notes RE: Candidate']) return json({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "Notes RE: Candidate"' } }, 422);
      return json({ records: [{ id: 'recPerson', fields: body.records[0].fields }] });
    }
    if (url.pathname.endsWith('/Applications')) return json({ records: [{ id: 'recApplication', fields: body.records[0].fields }] });
    if (url.pathname.endsWith('/uploadAttachment')) return json({ attachment: { id: 'attCV', url: 'https://example.test/cv.txt' } });
    throw Error('Unexpected request');
  });
  vi.stubGlobal('fetch', mock); return { writes, countryReads };
}

describe('country record mapping through the application API', () => {
  it('sends a record-ID array on the first People POST and lets Jurisdiction derive', async () => {
    const { writes } = mockApplication([row('recUnassigned', 'Canada'), row('recAssigned', 'CANADA', 'Canada')]);
    const response = await POST(request()); expect(response.status).toBe(200);
    const people = writes.filter(write => write.path.endsWith('/People')); expect(people).toHaveLength(1);
    expect(people[0].body.records[0].fields['Country of Living (Current Location)']).toEqual(['recAssigned']);
    expect(people[0].body.records[0].fields).not.toHaveProperty('Jurisdiction');
    expect(people[0].body.records[0].fields).not.toHaveProperty('Notes RE: Candidate');
    expect(writes.filter(write => write.path.endsWith('/Applications'))).toHaveLength(1); // application create; the upload endpoint saves the CV without a redundant PATCH
    expect(captureServerException).not.toHaveBeenCalled();
  });
  it.each([
    { rows: [], reason: 'COUNTRY_RECORD_MISSING' },
    { rows: [row('recA', 'Canada'), row('recB', 'CANADA')], reason: 'COUNTRY_RECORD_AMBIGUOUS' },
  ])('preserves unresolved answers atomically and reports flat safe diagnostics ($reason)', async ({ rows, reason }) => {
    const { writes } = mockApplication(rows); expect((await POST(request())).status).toBe(200);
    const fields = writes.find(write => write.path.endsWith('/People'))!.body.records[0].fields;
    expect(fields).not.toHaveProperty('Country of Living (Current Location)');
    expect(fields['Notes RE: Candidate']).toContain('[Opportunity Board: DATA REVIEW REQUIRED]');
    expect(fields['Notes RE: Candidate']).toContain('Country of Living (Current Location): Canada');
    const meta = vi.mocked(captureServerException).mock.calls[0][1]!;
    expect(meta.operation).toBe('create_person_review_fallback');
    expect(meta.omittedFields).toEqual(['Country of Living (Current Location)']); expect(meta.airtableErrorTypes).toEqual([reason]);
    expect(JSON.stringify(meta)).not.toContain('Canada'); expect(JSON.stringify(meta)).not.toContain('person@example.test');
  });
  it('fails before any writes if the directory cannot be read', async () => {
    const { writes } = mockApplication([], { directoryStatus: 403 }); expect((await POST(request())).status).toBe(500); expect(writes).toHaveLength(0);
    expect(captureServerException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ applicationStep: 'country_lookup' }));
  });
  it.each(malformedDirectoryRows)('fails before any writes for a malformed directory row ($label)', async ({ record }) => {
    const { writes } = mockApplication([row('recValid', 'Canada'), record]);
    expect((await POST(request())).status).toBe(500);
    expect(writes).toHaveLength(0);
    expect(captureServerException).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ operation: 'create_person_review_fallback' }));
  });
  it('recovers an invalidated cursor before creating the correctly linked person and application', async () => {
    const { writes, countryReads } = mockApplication([], { directoryPages: [
      { records: [row('recAbandoned', 'Canada')], offset: 'expired' },
      { error: { type: 'LIST_RECORDS_ITERATOR_NOT_AVAILABLE' }, status: 422 },
      { records: [row('recFresh', 'CANADA', 'Canada')] },
    ] });
    expect((await POST(request())).status).toBe(200);
    expect(countryReads.map(url => new URL(url).searchParams.get('offset'))).toEqual([null, 'expired', null]);
    const people = writes.filter(write => write.path.endsWith('/People'));
    expect(people).toHaveLength(1);
    expect(people[0].body.records[0].fields['Country of Living (Current Location)']).toEqual(['recFresh']);
    expect(people[0].body.records[0].fields).not.toHaveProperty('Notes RE: Candidate');
    expect(writes.filter(write => write.path.endsWith('/Applications'))).toHaveLength(1);
    expect(writes.filter(write => write.path.endsWith('/uploadAttachment'))).toHaveLength(1);
    expect(captureServerException).not.toHaveBeenCalled();
  });
  it('makes no writes when both cursor traversals fail', async () => {
    const { writes, countryReads } = mockApplication([], { directoryPages: [
      { records: [row('recAbandoned', 'Canada')], offset: 'expired' },
      { error: { type: 'LIST_RECORDS_ITERATOR_NOT_AVAILABLE' }, status: 422 },
      { records: [row('recStillIncomplete', 'Canada')], offset: 'expiredAgain' },
      { error: { type: 'LIST_RECORDS_ITERATOR_NOT_AVAILABLE' }, status: 422 },
    ] });
    expect((await POST(request())).status).toBe(500);
    expect(countryReads).toHaveLength(4); expect(writes).toHaveLength(0);
    expect(captureServerException).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ operation: 'create_person_review_fallback' }));
  });
  it('does not accept a fallback if its review note cannot be saved', async () => {
    const { writes } = mockApplication([], { notesFail: true }); expect((await POST(request())).status).toBe(500);
    expect(writes.filter(write => write.path.endsWith('/Applications'))).toHaveLength(0);
  });
  it('does not rewrite returning profiles or read the directory for them', async () => {
    const { writes, countryReads } = mockApplication([], { returning: true }); expect((await POST(request())).status).toBe(200);
    expect(countryReads).toHaveLength(0); expect(writes.filter(write => write.path.endsWith('/People'))).toHaveLength(0);
  });
});
