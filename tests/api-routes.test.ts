import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postApplication } from '../app/api/applications/route';
import { GET as getJobs } from '../app/api/jobs/route';
import { POST as postUpload } from '../app/api/upload/route';
import { GET as getUploadedFile } from '../app/uploads/[...path]/route';

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

describe('POST /api/upload', () => {
  it('accepts a valid file upload payload', async () => {
    const mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    const writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const req = new Request('http://localhost/api/upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: 'jobs.example.org',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': nextIp('198.51.104'),
      },
      body: JSON.stringify({
        filename: 'resume 2026.pdf',
        dataUrl: `data:application/pdf;base64,${Buffer.from('pdf-bytes').toString('base64')}`,
      }),
    });

    const res = await postUpload(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ratelimit-limit')).toBe('5');
    expect(res.headers.get('x-ratelimit-remaining')).toBe('4');

    const body = await res.json();
    expect(body).toEqual({
      url: 'https://jobs.example.org/uploads/1700000000000-resume_2026.pdf',
      filename: '1700000000000-resume_2026.pdf',
      mimeType: 'application/pdf',
    });

    expect(mkdirSpy).toHaveBeenCalledOnce();
    expect(writeFileSpy).toHaveBeenCalledOnce();
    const [writtenPath, buffer] = writeFileSpy.mock.calls[0];
    expect(path.basename(String(writtenPath))).toBe('1700000000000-resume_2026.pdf');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('returns 400 when dataUrl is malformed', async () => {
    const req = new Request('http://localhost/api/upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': nextIp('198.51.105'),
      },
      body: JSON.stringify({
        filename: 'resume.pdf',
        dataUrl: 'not-a-data-url',
      }),
    });

    const res = await postUpload(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid data URL.' });
  });

  it('enforces rate limiting after 5 upload attempts', async () => {
    const ip = nextIp('198.51.106');
    let res: Response | null = null;

    for (let i = 0; i < 6; i += 1) {
      res = await postUpload(
        new Request('http://localhost/api/upload', {
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
    expect(body).toEqual({ error: 'Too many upload attempts. Please try again shortly.' });
  });
});

describe('GET /uploads/[...path]', () => {
  it('serves files from uploads directory with content type', async () => {
    const readFileSpy = vi.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('hello'));
    const req = new Request('http://localhost/uploads/sample.txt');

    const res = await getUploadedFile(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await res.text()).toBe('hello');
    expect(readFileSpy).toHaveBeenCalledWith(path.resolve(process.cwd(), 'uploads', 'sample.txt'));
  });

  it('blocks path traversal attempts', async () => {
    const readFileSpy = vi.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('ignored'));
    const req = new Request('http://localhost/uploads/..%2Fsecret.txt');

    const res = await getUploadedFile(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Invalid path' });
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it('returns 404 when the requested file does not exist', async () => {
    vi.spyOn(fs.promises, 'readFile').mockRejectedValue(new Error('ENOENT'));
    const req = new Request('http://localhost/uploads/missing.pdf');

    const res = await getUploadedFile(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'File not found' });
  });
});
