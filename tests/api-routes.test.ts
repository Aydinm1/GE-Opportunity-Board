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
  });

  it('returns 500 when Airtable env is missing', async () => {
    delete process.env.AIRTABLE_TOKEN;
    delete process.env.AIRTABLE_BASE_ID;
    delete process.env.AIRTABLE_GEROLES_TABLE;

    const res = await getJobs();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Missing Airtable env vars');
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
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }))
      .mockResolvedValueOnce(jsonResponse({ attachment: { id: 'att1', url: 'https://cdn.test/file.pdf' } }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ id: 'recApp1', fields: {} }] }));
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': nextIp('198.51.101'),
      },
      body: JSON.stringify({
        person: {
          fullName: 'Jane Doe',
          emailAddress: 'JANE@EXAMPLE.COM',
          phoneNumber: '+1 555 0100',
          age: '25-34',
          gender: 'Female',
          countryOfOrigin: 'Canada',
          countryOfLiving: 'United States',
          education: 'Bachelor degree in project management.',
          profession: 'Programme manager.',
          jamatiExperience: 'Led local initiatives.',
        },
        jobId: 'recJob123',
        extras: {
          [WHY_FIELD]: 'I am well qualified and ready to contribute.',
        },
        attachments: {
          cvResume: {
            filename: 'resume.pdf',
            contentType: 'application/pdf',
            base64: Buffer.from('test resume bytes').toString('base64'),
          },
        },
      }),
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
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(decodeURIComponent(firstUrl)).toContain('jane@example.com');
  });

  it('returns 400 for invalid JSON payload', async () => {
    const req = new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: { 'x-forwarded-for': nextIp('198.51.102') },
      body: '{',
    });

    const res = await postApplication(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid JSON payload.' });
  });

  it('enforces rate limiting after 8 requests per minute', async () => {
    const ip = nextIp('198.51.103');
    let res: Response | null = null;

    for (let i = 0; i < 9; i += 1) {
      res = await postApplication(
        new Request('http://localhost/api/applications', {
          method: 'POST',
          headers: { 'x-forwarded-for': ip },
          body: '{',
        })
      );
    }

    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('retry-after')).not.toBeNull();
    const body = await res!.json();
    expect(body).toEqual({ error: 'Too many requests. Please try again shortly.' });
  });
});
