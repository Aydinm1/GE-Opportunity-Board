import { createRequestId, safeEdgeRequestId, safeRequestId } from './request-diagnostics';
import { parseErrorResponseMessage } from './utils';

export const APPLICATION_CONNECTION_MESSAGE = 'We couldn’t confirm your application was received. Please try again shortly.';
const PROBE_TIMEOUT_MS = 3000;
type FetchLike = typeof fetch;
type ProbeResult = { outcome: 'reachable' | 'http_error' | 'unexpected_response' | 'network_error' | 'timeout'; status?: number; elapsedMs: number };

export type ApplicationRequestDiagnostics = {
  requestId: string;
  phase: 'awaiting_response' | 'reading_response' | 'http_response' | 'invalid_response';
  responseReceived: boolean;
  serverRequestId?: string;
  edgeRequestId?: string;
  status?: number;
  responseContentType?: 'json' | 'html' | 'other';
  requestElapsedMs: number;
  probeOutcome?: ProbeResult['outcome'];
  probeStatus?: number;
  probeElapsedMs?: number;
};

export type ApplicationRequestError = Error & {
  endpoint?: string;
  status?: number;
  userMessage?: string;
  diagnostics?: ApplicationRequestDiagnostics;
};

// A separate, read-only request. A successful probe does not prove the POST
// arrived, and a failed probe does not identify a particular network provider.
async function probeReachability(fetchImpl: FetchLike): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<ProbeResult> => {
        const response = await fetchImpl('/api/health', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return { outcome: 'http_error', status: response.status, elapsedMs: Date.now() - started };
        const body = await response.json().catch(() => null);
        return { outcome: body?.ok === true && body?.service === 'opportunity-board' ? 'reachable' : 'unexpected_response', status: response.status, elapsedMs: Date.now() - started };
      })(),
      new Promise<ProbeResult>(resolve => {
        timeout = setTimeout(() => {
          resolve({ outcome: 'timeout', elapsedMs: Date.now() - started });
          controller.abort();
        }, PROBE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return { outcome: 'network_error', elapsedMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendApplicationRequest(
  body: FormData,
  submissionKey: string,
  requestId = createRequestId(),
  fetchImpl: FetchLike = fetch,
) {
  const started = Date.now();
  const diagnostics: ApplicationRequestDiagnostics = {
    requestId, phase: 'awaiting_response', responseReceived: false, requestElapsedMs: 0,
  };
  try {
    const response = await fetchImpl('/api/applications', {
      method: 'POST', headers: { 'x-idempotency-key': submissionKey, 'x-request-id': requestId }, body,
    });
    diagnostics.responseReceived = true;
    diagnostics.status = response.status;
    diagnostics.serverRequestId = safeRequestId(response.headers.get('x-request-id')) || undefined;
    diagnostics.edgeRequestId = safeEdgeRequestId(response.headers.get('cf-ray')) || undefined;
const contentType = response.headers.get('content-type') || '';
    const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
    diagnostics.responseContentType = mediaType === 'application/json' ? 'json' : mediaType === 'text/html' ? 'html' : 'other';
    diagnostics.phase = 'reading_response';
    if (!response.ok) {
      const text = await response.text();
      diagnostics.phase = diagnostics.responseContentType === 'json' ? 'http_response' : 'invalid_response';
      const error: ApplicationRequestError = new Error(diagnostics.responseContentType === 'json'
        ? parseErrorResponseMessage(text, 'Failed to submit application') : 'Unexpected application response');
      error.status = response.status;
      throw error;
    }
    // A proxy challenge/login page must not be mistaken for a saved application.
    const result = await response.json().catch(error => {
      if (error instanceof TypeError) throw error;
      return null;
    });
    if (!result || result.ok !== true) {
      diagnostics.phase = 'invalid_response';
      throw new Error('Unexpected application response');
    }
  } catch (cause) {
    const error: ApplicationRequestError = cause instanceof Error ? cause : new Error('Application request failed');
    diagnostics.requestElapsedMs = Date.now() - started;
    if (error instanceof TypeError) {
      const probe = await probeReachability(fetchImpl);
      diagnostics.probeOutcome = probe.outcome;
      diagnostics.probeStatus = probe.status;
      diagnostics.probeElapsedMs = probe.elapsedMs;
    }
    if (diagnostics.status && diagnostics.status >= 400) error.status = diagnostics.status;
    error.endpoint = '/api/applications';
    error.diagnostics = diagnostics;
    if (error instanceof TypeError || diagnostics.phase === 'invalid_response' || (error.status ?? 0) >= 500) error.userMessage = APPLICATION_CONNECTION_MESSAGE;
    throw error;
  }
}
