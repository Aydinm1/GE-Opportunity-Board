import { afterEach, describe, expect, it, vi } from 'vitest';
import { APPLICATION_CONNECTION_MESSAGE, sendApplicationRequest, type ApplicationRequestError, type ApplicationRequestDiagnostics } from '../lib/application-request';
import { sanitizeSentryEvent } from '../lib/monitoring-config';

const ID = '12345678-1234-4234-8234-123456789abc';
const json = (value: unknown, status = 200, headers = {}) => Response.json(value, { status, headers });
const health = () => json({ ok: true, service: 'opportunity-board' });
const form = () => {
  const data = new FormData();
  data.set('emailAddress', 'PRIVATE_SENTINEL@example.invalid');
  data.set('whyText', 'PRIVATE_SENTINEL');
  data.set('cvResume', new File(['PRIVATE_SENTINEL'], 'PRIVATE_SENTINEL.pdf'));
  return data;
};
afterEach(() => vi.useRealTimers());
async function failure(work: Promise<void>) {
  try { await work; }
  catch (error) { return error as ApplicationRequestError & { diagnostics: ApplicationRequestDiagnostics }; }
  throw new Error('Expected the request to fail');
}

describe('application request diagnostics', () => {
  it('sends one POST with separate correlation and retry keys, and validates success', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true }));
    await sendApplicationRequest(form(), 'PRIVATE_RETRY_KEY', ID, fetch);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/applications', expect.objectContaining({
      method: 'POST', headers: { 'x-request-id': ID, 'x-idempotency-key': 'PRIVATE_RETRY_KEY' },
    }));
  });

  it('distinguishes a failed fetch from a reachable app without resubmitting or leaking form data', async () => {
    const cause = new TypeError('Failed to fetch');
    const fetch = vi.fn().mockRejectedValueOnce(cause).mockResolvedValueOnce(health());
    const error = await failure(sendApplicationRequest(form(), 'PRIVATE_RETRY_KEY', ID, fetch));
    expect(error).toBe(cause);
    expect(error.userMessage).toBe(APPLICATION_CONNECTION_MESSAGE);
    expect(error.diagnostics).toMatchObject({ requestId: ID, phase: 'awaiting_response', responseReceived: false, probeOutcome: 'reachable', probeStatus: 200 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]).toEqual(['/api/health', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) })]);
    const serialized = JSON.stringify(sanitizeSentryEvent({ contexts: { monitoring: error.diagnostics } }));
    expect(serialized).toContain(ID);
    expect(serialized).toContain('reachable');
    expect(serialized).not.toContain('PRIVATE');
  });

  it.each([
    ['network_error', () => Promise.reject(new TypeError('offline')), undefined],
    ['http_error', () => Promise.resolve(json({}, 503)), 503],
    ['unexpected_response', () => Promise.resolve(new Response('<html>challenge</html>')), 200],
  ] as const)('records a %s probe without changing the original failure', async (outcome, probe, status) => {
    const cause = new TypeError('Failed to fetch');
    const fetch = vi.fn().mockRejectedValueOnce(cause).mockImplementationOnce(probe);
    const error = await failure(sendApplicationRequest(form(), 'key', ID, fetch));
    expect(error).toBe(cause);
    expect(error.diagnostics).toMatchObject({ probeOutcome: outcome, probeStatus: status });
  });

  it('bounds an unresponsive reachability probe to three seconds and aborts it', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementationOnce(() => new Promise(() => {}));
    const result = failure(sendApplicationRequest(form(), 'key', ID, fetch));
    await vi.advanceTimersByTimeAsync(3000);
    const error = await result;
    expect(error.diagnostics).toMatchObject({ requestElapsedMs: 0, probeOutcome: 'timeout', probeElapsedMs: 3000 });
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
  });

  it('distinguishes a body-download failure after headers and retains server correlation', async () => {
    const response = json({}, 200, { 'x-request-id': ID, 'cf-ray': 'aabbccddeeff0011-KHI' });
    vi.spyOn(response, 'json').mockRejectedValue(new TypeError('Failed to fetch'));
    const fetch = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(health());
    const error = await failure(sendApplicationRequest(form(), 'key', ID, fetch));
    expect(error.diagnostics).toMatchObject({ phase: 'reading_response', responseReceived: true, status: 200, serverRequestId: ID, edgeRequestId: 'aabbccddeeff0011-KHI', probeOutcome: 'reachable' });
  });

  it.each([400, 429, 500])('records HTTP %i separately without a reachability probe', async status => {
    const fetch = vi.fn().mockResolvedValue(json({ error: 'Application rejected' }, status));
    const error = await failure(sendApplicationRequest(form(), 'key', ID, fetch));
    expect(error.status).toBe(status);
    expect(error.diagnostics).toMatchObject({ phase: 'http_response', responseReceived: true, status });
    expect(fetch).toHaveBeenCalledTimes(1);
    if (status >= 500) {
      expect(error.userMessage).toBe(APPLICATION_CONNECTION_MESSAGE);
      expect(error.userMessage).not.toContain('Application rejected');
    } else {
      // Keep actionable validation/rate-limit guidance, without showing diagnostics.
      expect(error.message).toBe('Application rejected');
    }
  });

  it.each([200, 403])('does not accept or log an HTML response with HTTP %i', async status => {
    const fetch = vi.fn().mockResolvedValue(new Response('<html>PRIVATE_SENTINEL challenge</html>', { status, headers: { 'Content-Type': 'text/html', 'x-request-id': 'PRIVATE_SENTINEL', 'cf-ray': 'PRIVATE_SENTINEL' } }));
    const error = await failure(sendApplicationRequest(form(), 'key', ID, fetch));
    expect(error.userMessage).toBe(APPLICATION_CONNECTION_MESSAGE);
    expect(error.diagnostics).toMatchObject({ phase: 'invalid_response', responseReceived: true, responseContentType: 'html', status });
    expect(JSON.stringify(error.diagnostics)).not.toContain('PRIVATE');
    expect(error.message).not.toContain('PRIVATE');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { ok: false }, null])('rejects an unconfirmed JSON success: %j', async body => {
    const error = await failure(sendApplicationRequest(form(), 'key', ID, vi.fn().mockResolvedValue(json(body))));
    expect(error.diagnostics.phase).toBe('invalid_response');
  });
});
