import { describe, expect, it, vi } from 'vitest';
import { JOBS_ENDPOINT, JOBS_LOAD_ERROR_MESSAGE, JOBS_RETRY_DELAY_MS, loadJobs } from '../lib/jobs-load';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

describe('loadJobs', () => {
  it('returns jobs on the first successful request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ jobs: [{ id: 'rec1', roleTitle: 'Role' }] }));

    const jobs = await loadJobs(fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(JOBS_ENDPOINT);
    expect(jobs).toEqual([{ id: 'rec1', roleTitle: 'Role' }]);
  });

  it('retries once for network TypeErrors and then succeeds', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(jsonResponse({ jobs: [{ id: 'rec2', roleTitle: 'Recovered Role' }] }));

    const jobs = await loadJobs(fetchMock, wait);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(JOBS_RETRY_DELAY_MS);
    expect(jobs).toEqual([{ id: 'rec2', roleTitle: 'Recovered Role' }]);
  });

  it('throws a friendly final error after both network attempts fail', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockRejectedValueOnce(new TypeError('Load failed'));

    await expect(loadJobs(fetchMock, wait)).rejects.toMatchObject({
      message: 'Load failed',
      userMessage: JOBS_LOAD_ERROR_MESSAGE,
      endpoint: JOBS_ENDPOINT,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('parses JSON error bodies from failed HTTP responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'Custom jobs API error' }, { status: 500 })
    );

    await expect(loadJobs(fetchMock)).rejects.toMatchObject({
      message: 'Custom jobs API error',
      userMessage: 'Custom jobs API error',
      status: 500,
      endpoint: JOBS_ENDPOINT,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the friendly fallback when an HTTP error body is empty or invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('', { status: 500, headers: { 'content-type': 'text/plain' } })
    );

    await expect(loadJobs(fetchMock)).rejects.toMatchObject({
      message: JOBS_LOAD_ERROR_MESSAGE,
      userMessage: JOBS_LOAD_ERROR_MESSAGE,
      status: 500,
      endpoint: JOBS_ENDPOINT,
    });
  });
});
