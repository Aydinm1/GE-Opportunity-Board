import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postApplication } from '../app/api/applications/route';
import { GET as getJobs } from '../app/api/jobs/route';

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
      languagesRequired: ['English', 'French'],
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
      'Additional Skill Notes',
      'Displayed Estimated Time Commitment',
      'Languages Required',
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
