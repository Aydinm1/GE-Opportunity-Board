import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/applications/route';
import { GET } from '../app/api/health/route';
import { getJobs, submitApplication } from '../lib/airtable';
import { applyRateLimit } from '../lib/rate-limit';
import { captureServerException } from '../lib/monitoring';
import { safeRequestId } from '../lib/request-diagnostics';

vi.mock('../lib/airtable', () => ({ getJobs: vi.fn(), submitApplication: vi.fn() }));
vi.mock('../lib/monitoring', () => ({ captureServerException: vi.fn() }));
vi.mock('../lib/rate-limit', () => ({ applyRateLimit: vi.fn() }));
vi.mock('../lib/validation', () => ({
  validateApplicationFormData: () => ({ jobId: 'recRole', fullName: 'PRIVATE_SENTINEL', whyText: 'PRIVATE_SENTINEL' }),
  validateIdempotencyKey: () => 'PRIVATE_KEY',
}));
const ID = '12345678-1234-4234-8234-123456789abc';
function request(id = ID, contentType?: string) {
  const body = new FormData(); body.set('whyText', 'PRIVATE_SENTINEL');
  return new Request('http://localhost/api/applications', {
    method: 'POST', body,
    headers: { 'x-request-id': id, 'cf-ray': 'aabbccddeeff0011-KHI', ...(contentType ? { 'content-type': contentType } : {}) },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getJobs).mockResolvedValue({ jobs: [{ id: 'recRole' }] } as Awaited<ReturnType<typeof getJobs>>);
  vi.mocked(submitApplication).mockResolvedValue({} as Awaited<ReturnType<typeof submitApplication>>);
  vi.mocked(applyRateLimit).mockReturnValue({ ok: true, headers: {} } as ReturnType<typeof applyRateLimit>);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('server application correlation', () => {
  it('echoes a valid ID on success and logs receipt/completion without applicant data', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe(ID);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true });
    expect(console.info).toHaveBeenCalledWith('Application request received', { requestId: ID, edgeRequestId: 'aabbccddeeff0011-KHI' });
    expect(console.info).toHaveBeenCalledWith('Application request completed', expect.objectContaining({ requestId: ID, status: 200, elapsedMs: expect.any(Number) }));
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('PRIVATE');
  });
  it('replaces arbitrary request IDs instead of logging untrusted text', async () => {
    const req = request('PRIVATE_SENTINEL'); req.headers.set('cf-ray', 'PRIVATE_SENTINEL');
    const response = await POST(req);
    expect(safeRequestId(response.headers.get('x-request-id'))).toBeTruthy();
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('PRIVATE');
  });
  it('correlates server exceptions with the failed step and completion response', async () => {
    vi.mocked(getJobs).mockRejectedValueOnce(new Error('Synthetic failure'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(response.headers.get('x-request-id')).toBe(ID);
    expect(captureServerException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ requestId: ID, edgeRequestId: 'aabbccddeeff0011-KHI', applicationStep: 'published_roles', status: 500 }));
  });
  it('returns a correlation ID for validation errors', async () => {
    const response = await POST(request(ID, 'text/plain'));
    expect(response.status).toBe(400);
    expect(response.headers.get('x-request-id')).toBe(ID);
    expect(submitApplication).not.toHaveBeenCalled();
  });
  it('returns a correlation ID for rate-limited attempts', async () => {
    vi.mocked(applyRateLimit).mockReturnValue({ ok: false, headers: { 'Retry-After': '60' } } as ReturnType<typeof applyRateLimit>);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('x-request-id')).toBe(ID);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(submitApplication).not.toHaveBeenCalled();
  });
  it('provides an uncached reachability response without calling Airtable', async () => {
    const response = GET();
    expect(await response.json()).toEqual({ ok: true, service: 'opportunity-board' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(getJobs).not.toHaveBeenCalled();
  });
});
