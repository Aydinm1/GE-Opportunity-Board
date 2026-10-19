import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postApplication } from '../app/api/applications/route';
import { GET as getJobs } from '../app/api/jobs/route';
import { COUNTRY_OPTIONS, PERSON_AGE_OPTIONS, PERSON_GENDER_OPTIONS } from '../lib/application-select-options';
import { captureServerException } from '../lib/monitoring';
import { submitApplication } from '../lib/airtable';
import { validateApplicationFormData } from '../lib/validation';
import { AIRTABLE_SCHEMA_CONTRACT } from '../lib/airtable-schema-contract';

vi.mock('../lib/monitoring', () => ({ captureServerException: vi.fn() }));

const WHY_FIELD = 'Why are you interested in or qualified for this job?';
const ORIGINAL_ENV = { ...process.env };
let ipCounter = 10;

function nextIp(prefix = '198.51.100') {
  ipCounter += 1;
  return `${prefix}.${ipCounter}`;
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

const AIRTABLE_SELECT_OPTION_ERROR =
  'We couldn\'t submit your application because one of your selected answers could not be saved. Your answers are still on this page. Please try again later, and let the Global Encounters team know if this keeps happening.';

function refusedSelectOptionResponse(option: string) {
  return jsonResponse(
    {
      error: {
        type: 'INVALID_MULTIPLE_CHOICE_OPTIONS',
        message: `Insufficient permissions to create new select option ""${option}""`,
      },
    },
    { status: 422 }
  );
}

function validApplicationFields() {
  return {
    fullName: 'Jane Doe',
    emailAddress: 'JANE@EXAMPLE.COM',
    phoneNumber: '+1 555 0100',
    linkedIn: '',
    age: '25-34',
    gender: 'Female',
    countryOfOrigin: 'Canada',
    countryOfLiving: 'United States',
    education: 'Bachelor degree in project management.',
    profession: 'Programme manager.',
    jamatiExperience: 'Led local initiatives.',
    jobId: 'recJob123',
    whyText: 'I am well qualified and ready to contribute.',
    website: '',
    formStartedAt: '1',
    submittedAt: '2500',
  };
}

function validResumeFile(size?: number) {
  const bytes = typeof size === 'number' ? Buffer.alloc(size, 0) : Buffer.from('test resume bytes');
  return new File([bytes], 'resume.pdf', { type: 'application/pdf' });
}

function buildApplicationFormData({
  fieldOverrides = {},
  file = validResumeFile(),
}: {
  fieldOverrides?: Record<string, string>;
  file?: File | null;
} = {}) {
  const formData = new FormData();
  const fields = { ...validApplicationFields(), ...fieldOverrides };
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  if (file) {
    formData.append('cvResume', file);
  }
  return formData;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreEnv();
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('GET /api/jobs', () => {
  it('returns normalized jobs from Airtable', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_GEROLES_TABLE = 'GE Roles';

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        records: [
          {
            id: 'recJob123',
            fields: {
              'Published?': true,
              'Role Title': 'Programme Lead',
              'Key Responsibilities': '- Lead planning\n- Coordinate teams',
              'Duration (Months)': '6',
              'Languages Required': 'English, French',
            },
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await getJobs();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    const body = await res.json();

    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({
      id: 'recJob123',
      roleTitle: 'Programme Lead',
      durationMonths: 6,
      durationCategory: '3–6',
      keyResponsibilities: ['Lead planning', 'Coordinate teams'],
      languagesRequired: ['English, French'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const airtableUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(`${airtableUrl.origin}${airtableUrl.pathname}`).toBe('https://api.airtable.com/v0/appTestBase/GE%20Roles');
    expect(airtableUrl.searchParams.get('pageSize')).toBe('100');
    expect(airtableUrl.searchParams.get('filterByFormula')).toBe('{Published?}=1');
    expect(airtableUrl.searchParams.getAll('fields[]')).toEqual([
      'Role Title',
      'Programme / Functional Area',
      'Team/Vertical',
      'Displayed Status',
      'Published?',
      'Location / Base',
      'Work Type',
      'Role Type',
      'Start Date',
      'Duration (Months)',
      'Duration Categories',
      'Displayed Purpose of the Role',
      'Key Responsibilities',
      '10. Required Qualifications',
      'Other Required Qualifications',
      'Preferred Qualifications',
      'Displayed Estimated Time Commitment',
      'Languages Required',
      'TOR',
      'TOR Upload',
      'Point form of essential skills, education & experience',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      String(fetchMock.mock.calls[0][0]),
      expect.objectContaining({
        cache: 'force-cache',
        next: { revalidate: 300, tags: ['jobs'] },
        headers: { Authorization: 'Bearer test-token' },
      })
    );
  });

  it('relies on Airtable-level filtering for published jobs', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_GEROLES_TABLE = 'GE Roles';

    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        records: [
          {
            id: 'recPublished',
            fields: {
              'Role Title': 'Published Role',
            },
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await getJobs();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].id).toBe('recPublished');
    expect(body.jobs[0].roleTitle).toBe('Published Role');
  });

  it('returns 500 when Airtable env is missing', async () => {
    delete process.env.AIRTABLE_TOKEN;
    delete process.env.AIRTABLE_BASE_ID;
    delete process.env.AIRTABLE_GEROLES_TABLE;

    const res = await getJobs();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'We couldn\'t load opportunities right now. Please try again.' });
    expect(console.error).toHaveBeenCalled();
  });

  it('retries without missing optional Airtable fields', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_GEROLES_TABLE = 'GE Roles';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              type: 'UNKNOWN_FIELD_NAME',
              message: 'Unknown field name: "Point form of essential skills, education & experience"',
            },
          },
          { status: 422 }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          records: [
            {
              id: 'recJob123',
              fields: {
                'Role Title': 'Programme Lead',
                'Published?': true,
              },
            },
          ],
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await getJobs();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({
      id: 'recJob123',
      roleTitle: 'Programme Lead',
      additionalQualifications: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(
      'Airtable jobs query skipped missing optional field',
      { fieldName: 'Point form of essential skills, education & experience' }
    );
    expect(console.warn).toHaveBeenCalledWith(
      'Airtable jobs response loaded without optional fields',
      { fieldNames: ['Point form of essential skills, education & experience'] }
    );

    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(firstUrl.searchParams.getAll('fields[]')).toContain('Point form of essential skills, education & experience');
    expect(secondUrl.searchParams.getAll('fields[]')).not.toContain('Point form of essential skills, education & experience');
  });
});

describe('Airtable query contract coverage', () => {
  it('maps every requested role field into the schema contract', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_GEROLES_TABLE = 'GE Roles';
    const mock = vi.fn().mockResolvedValue(jsonResponse({ records: [] }));
    vi.stubGlobal('fetch', mock);
    expect((await getJobs()).status).toBe(200);
    const requested = new URL(String(mock.mock.calls[0][0])).searchParams.getAll('fields[]');
    expect(new Set(requested)).toEqual(new Set(AIRTABLE_SCHEMA_CONTRACT.jobs.fields.map(field => field.name)));
  });
});

describe('POST /api/applications', () => {
  it('submits an application and returns rate-limit headers', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recPerson1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ attachment: { id: 'att1', url: 'https://cdn.test/file.pdf' } }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }));
    vi.stubGlobal('fetch', fetchMock);

    const resumeBase64 = Buffer.from('test resume bytes').toString('base64');
    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.101'),
        'x-idempotency-key': 'idem-key-1',
      },
      body: buildApplicationFormData(),
    });

    const res = await postApplication(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ratelimit-limit')).toBe('8');
    expect(res.headers.get('x-ratelimit-remaining')).toBe('7');

    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      result: {
        personRecordId: 'recPerson1',
        applicationRecord: { id: 'recApp1' },
      },
    });
    const calledUrls = fetchMock.mock.calls.map((call) => decodeURIComponent(String(call[0])));
    expect(calledUrls.some((url) => url.includes('jane@example.com'))).toBe(true);
    expect(calledUrls.some((url) => url.includes('idem-key-1'))).toBe(true);
    const uploadRequest = fetchMock.mock.calls[3]?.[1] as RequestInit | undefined;
    expect(uploadRequest).toBeDefined();
    expect(JSON.parse(String(uploadRequest?.body))).toMatchObject({
      contentType: 'application/pdf',
      file: resumeBase64,
      filename: 'resume.pdf',
    });
  });

  it('returns cached success for repeated requests with same idempotency key', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recPerson1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ attachment: { id: 'att1', url: 'https://cdn.test/file.pdf' } }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }));
    vi.stubGlobal('fetch', fetchMock);

    const key = 'idem-cache-key-1';
    const reqA = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.104'),
        'x-idempotency-key': key,
      },
      body: buildApplicationFormData(),
    });
    const reqB = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.105'),
        'x-idempotency-key': key,
      },
      body: buildApplicationFormData(),
    });

    const firstRes = await postApplication(reqA);
    const callsAfterFirst = fetchMock.mock.calls.length;
    const secondRes = await postApplication(reqB);

    expect(firstRes.status).toBe(200);
    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(secondRes.status).toBe(200);
    const firstBody = await firstRes.json();
    const secondBody = await secondRes.json();
    expect(firstBody.result.applicationRecord.id).toBe('recApp1');
    expect(secondBody.result.applicationRecord.id).toBe('recApp1');
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('dedupes concurrent requests with the same idempotency key', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    let resolveCreate: ((value: Response) => void) | null = null;
    const createPromise = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recPerson1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockImplementationOnce(() => createPromise)
      .mockResolvedValueOnce(jsonResponse({ attachment: { id: 'att1', url: 'https://cdn.test/file.pdf' } }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }));
    vi.stubGlobal('fetch', fetchMock);

    const key = 'idem-concurrent-key-1';
    const reqA = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.106'),
        'x-idempotency-key': key,
      },
      body: buildApplicationFormData(),
    });
    const reqB = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.107'),
        'x-idempotency-key': key,
      },
      body: buildApplicationFormData(),
    });

    const firstPromise = postApplication(reqA);
    const secondPromise = postApplication(reqB);
    expect(resolveCreate).not.toBeNull();
    resolveCreate!(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }));

    const [firstRes, secondRes] = await Promise.all([firstPromise, secondPromise]);

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    const firstBody = await firstRes.json();
    const secondBody = await secondRes.json();
    expect(firstBody.result.applicationRecord.id).toBe('recApp1');
    expect(secondBody.result.applicationRecord.id).toBe('recApp1');
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  });

  it('returns 400 for non-multipart payloads', async () => {
    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': nextIp('198.51.102'),
      },
      body: '{}',
    });

    const res = await postApplication(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Expected multipart/form-data.' });
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns 400 for invalid idempotency key format', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.108'),
        'x-idempotency-key': 'bad key with spaces',
      },
      body: buildApplicationFormData(),
    });

    const res = await postApplication(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Idempotency key format is invalid.' });
    expect(console.warn).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a friendly 400 when a submitted select option is unsupported', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.109'),
      },
      body: buildApplicationFormData({
        fieldOverrides: { age: '35 to 44' },
      }),
    });

    const res = await postApplication(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: 'We couldn\'t submit your application because one of the selected options is temporarily unavailable. Please refresh the page and try again.',
      code: 'INVALID_SELECT_OPTION',
    });
    expect(console.warn).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a friendly 400 when Airtable rejects a select option during person creation', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              type: 'INVALID_MULTIPLE_CHOICE_OPTIONS',
              message: 'Insufficient permissions to create new select option "Non-binary"',
            },
          },
          { status: 422 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.111'),
      },
      body: buildApplicationFormData(),
    });

    const res = await postApplication(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: AIRTABLE_SELECT_OPTION_ERROR,
      code: 'INVALID_SELECT_OPTION',
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it('retries person creation without linked-record country fields when Airtable requires record IDs', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              type: 'INVALID_VALUE_FOR_COLUMN',
              message: 'Value is not an array of record IDs.',
            },
          },
          { status: 422 }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recPerson1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ attachment: { id: 'att1', url: 'https://cdn.test/file.pdf' } }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }));
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.112'),
      },
      body: buildApplicationFormData(),
    });

    const res = await postApplication(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.personRecordId).toBe('recPerson1');

    const firstCreateBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    const retryCreateBody = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(firstCreateBody.records[0].fields).toMatchObject({
      'Country of Living (Current Location)': 'United States',
    });
    expect(retryCreateBody.records[0].fields).not.toHaveProperty('Country of Living (Current Location)');
    expect(retryCreateBody.records[0].fields).not.toHaveProperty('Jurisdiction');
  });

  it('creates the person without a select field whose option Airtable refuses', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(refusedSelectOptionResponse('Female'))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recPerson1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ attachment: { id: 'att1', url: 'https://cdn.test/file.pdf' } }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await postApplication(new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: { 'x-forwarded-for': nextIp('198.51.113') },
      body: buildApplicationFormData(),
    }));

    expect(res.status).toBe(200);
    const retryCreateBody = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(retryCreateBody.records[0].fields).not.toHaveProperty('Gender');
    expect(retryCreateBody.records[0].fields).toMatchObject({
      'Full Name': 'Jane Doe',
      'Country of Living (Current Location)': 'United States',
    });
    expect(console.warn).toHaveBeenCalledWith(
      'Airtable refused People select options; person created without them',
      expect.objectContaining({ omissions: [{ field: 'Gender', airtableErrorType: 'INVALID_MULTIPLE_CHOICE_OPTIONS', status: 422 }] })
    );
  });

  it('stops retrying person creation after repeated refused select options', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(jsonResponse({ records: [] }))
      .mockResolvedValueOnce(refusedSelectOptionResponse('Female'))
      .mockResolvedValueOnce(refusedSelectOptionResponse('United States'))
      .mockResolvedValueOnce(refusedSelectOptionResponse('Canada'))
      .mockResolvedValueOnce(refusedSelectOptionResponse('25-34'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await postApplication(new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: { 'x-forwarded-for': nextIp('198.51.114') },
      body: buildApplicationFormData(),
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: AIRTABLE_SELECT_OPTION_ERROR, code: 'INVALID_SELECT_OPTION' });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(console.warn).toHaveBeenCalledWith(
      'API request rejected',
      expect.objectContaining({
        details: expect.objectContaining({
          cause: { operation: 'Airtable create person failed', airtableErrorType: 'INVALID_MULTIPLE_CHOICE_OPTIONS', status: 422 },
        }),
      })
    );
  });

  it('returns a friendly 400 when Airtable rejects a select option during application creation', async () => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recPerson1', fields: {} }] }))
      .mockResolvedValueOnce(refusedSelectOptionResponse('1a - Applicant'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await postApplication(new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: { 'x-forwarded-for': nextIp('198.51.115') },
      body: buildApplicationFormData(),
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: AIRTABLE_SELECT_OPTION_ERROR, code: 'INVALID_SELECT_OPTION' });
  });

  it('returns 400 when the resume file is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'x-forwarded-for': nextIp('198.51.110'),
      },
      body: buildApplicationFormData({ file: null }),
    });

    const res = await postApplication(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'CV / Resume attachment is required.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces rate limiting after 8 requests per minute', async () => {
    const ip = nextIp('198.51.103');
    let res: Response | null = null;

    for (let i = 0; i < 9; i += 1) {
      res = await postApplication(
        new Request('http://localhost/api/applications', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': ip,
          },
          body: '{}',
        })
      );
    }

    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('retry-after')).not.toBeNull();
    const body = await res!.json();
    expect(body).toEqual({ error: 'Too many requests. Please try again shortly.' });
    expect(console.warn).toHaveBeenCalled();
  });
});


// Exercise values through the real request validator AND Airtable payload mapping.
// Live metadata checks independently establish that these values exist in Airtable.
describe('application option and fallback regressions', () => {
  beforeEach(() => {
    process.env.AIRTABLE_TOKEN = 'test-token';
    process.env.AIRTABLE_BASE_ID = 'appTestBase';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';
    vi.mocked(captureServerException).mockClear();
  });

  function mockSubmission(personResponses: Response[], returning = false) {
    const queue = returning
      ? [jsonResponse({ records: [{ id: 'recPerson', fields: {} }] })]
      : [jsonResponse({ records: [] }), jsonResponse({ records: [] }), ...personResponses];
    queue.push(
      jsonResponse({ records: [{ id: 'recApplication', fields: {} }] }),
      jsonResponse({ attachment: { id: 'attResume', url: 'https://cdn.test/resume.pdf' } }),
      jsonResponse({ records: [{ id: 'recApplication', fields: {} }] })
    );
    const mock = vi.fn(async () => {
      const response = queue.shift();
      if (!response) throw new Error('Unexpected Airtable request');
      return response;
    });
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  function submit(fieldOverrides: Record<string, string> = {}) {
    return postApplication(new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: { 'x-forwarded-for': nextIp('203.0.113') },
      body: buildApplicationFormData({ fieldOverrides }),
    }));
  }

  const cases = [
    ...PERSON_AGE_OPTIONS.map(value => ['age', 'Age', value]),
    ...PERSON_GENDER_OPTIONS.map(value => ['gender', 'Gender', value]),
    ...COUNTRY_OPTIONS.map(value => ['countryOfOrigin', 'Country of Birth', value]),
    ...COUNTRY_OPTIONS.map(value => ['countryOfLiving', 'Country of Living (Current Location)', value]),
  ];
  it.each(cases)('saves %s=%s (%s) without changing its value', async (input, field, value) => {
    const mock = mockSubmission([jsonResponse({ records: [{ id: 'recPerson', fields: {} }] })]);
    expect((await submit({ [input]: value })).status, JSON.stringify(vi.mocked(console.error).mock.calls)).toBe(200);
    const calls = mock.mock.calls as unknown as Array<[string, RequestInit]>;
    const person = JSON.parse(String(calls[2][1].body)).records[0].fields;
    expect(person[field]).toBe(value);
    for (const name of Object.keys(person)) {
      expect(AIRTABLE_SCHEMA_CONTRACT.people.fields.some(field => field.name === name), `Unmapped People field: ${name}`).toBe(true);
    }
    expect(person['Candidate Status']).toBe('1a - Applicant');
    const application = JSON.parse(String(calls[3][1].body)).records[0].fields;
    for (const name of Object.keys(application)) {
      expect(AIRTABLE_SCHEMA_CONTRACT.applications.fields.some(field => field.name === name), `Unmapped Applications field: ${name}`).toBe(true);
    }
    expect(application).toMatchObject({ Status: '1a - Applicant', Source: 'Opportunity Board', [WHY_FIELD]: validApplicationFields().whyText, People: ['recPerson'], 'GE Roles': ['recJob123'] });
    expect(JSON.parse(String(calls[4][1].body))).toMatchObject({ filename: 'resume.pdf' });
  });

  it.each([false, true])('accepts the reported Female/US combination (returning=%s)', async returning => {
    const mock = mockSubmission([jsonResponse({ records: [{ id: 'recPerson', fields: {} }] })], returning);
    expect((await submit({ age: '18-24', countryOfOrigin: 'United States', countryOfLiving: 'United States' })).status).toBe(200);
    const calls = mock.mock.calls as unknown as Array<[string, RequestInit]>;
    const creates = calls.filter(([url, init]) => url.endsWith('/People') && init?.method === 'POST');
    expect(creates).toHaveLength(returning ? 0 : 1);
    if (!returning) expect(JSON.parse(String(creates[0][1].body)).records[0].fields).toMatchObject({ Age: '18-24', Gender: 'Female', 'Country of Birth': 'United States', 'Country of Living (Current Location)': 'United States' });
  });

  it.each(['Female', 'Canada', 'United States'])('omits only the unambiguous permitted field for %s', async value => {
    const mock = mockSubmission([refusedSelectOptionResponse(value), jsonResponse({ records: [{ id: 'recPerson', fields: {} }] })]);
    expect((await submit()).status).toBe(200);
    const calls = mock.mock.calls as unknown as Array<[string, RequestInit]>;
    const original = JSON.parse(String(calls[2][1].body)).records[0].fields;
    const retried = JSON.parse(String(calls[3][1].body)).records[0].fields;
    const field = { Female: 'Gender', Canada: 'Country of Birth', 'United States': 'Country of Living (Current Location)' }[value]!;
    delete original[field];
    expect(retried).toEqual(original);
    expect(captureServerException).toHaveBeenCalled();
    const diagnostics = JSON.stringify([vi.mocked(console.warn).mock.calls, vi.mocked(captureServerException).mock.calls]);
    for (const privateValue of [value, 'Jane Doe', 'JANE@EXAMPLE.COM', 'Insufficient permissions']) expect(diagnostics).not.toContain(privateValue);
    expect(diagnostics).toContain(field);
  });

  it.each([
    ['25-34', {}],
    ['1a - Applicant', {}],
    ['United States', { countryOfOrigin: 'United States' }],
    ['Prefer not to share', { age: 'Prefer not to share', gender: 'Prefer not to share' }],
    ['unknown-option', {}],
  ] as Array<[string, Record<string, string>]>)('does not guess or remove protected fields for %s', async (value, fields) => {
    const mock = mockSubmission([refusedSelectOptionResponse(value)]);
    expect((await submit(fields)).status).toBe(400);
    expect(mock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('Insufficient permissions');
  });

  it('stops after three retries even when a fourth optional field could be removed', async () => {
    const mock = mockSubmission([
      refusedSelectOptionResponse('Female'),
      refusedSelectOptionResponse('Canada'),
      refusedSelectOptionResponse('United States'),
      refusedSelectOptionResponse('Test Jurisdiction'),
    ]);
    const payload = await validateApplicationFormData(buildApplicationFormData());
    payload.person.jurisdiction = 'Test Jurisdiction';
    await expect(submitApplication(payload)).rejects.toMatchObject({ status: 400, code: 'INVALID_SELECT_OPTION' });
    expect(mock).toHaveBeenCalledTimes(6); // two lookups, initial create, three retries
  });

  it('does not repeatedly retry an already omitted field', async () => {
    const mock = mockSubmission([refusedSelectOptionResponse('Female'), refusedSelectOptionResponse('Female')]);
    expect((await submit()).status).toBe(400);
    expect(mock).toHaveBeenCalledTimes(4);
  });

  it('does not interpret arbitrary errors mentioning a country field as permission to discard it', async () => {
    const mock = mockSubmission([jsonResponse({ error: { type: 'SERVER_ERROR', message: 'Country of Living (Current Location): private applicant value' } }, { status: 500 })]);
    expect((await submit()).status).toBe(500);
    expect(mock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private applicant value');
  });

  it('handles malformed Airtable error bodies without retrying or logging their contents', async () => {
    const mock = mockSubmission([new Response('private response body', { status: 502 })]);
    expect((await submit()).status).toBe(500);
    expect(mock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private response body');
  });
});
