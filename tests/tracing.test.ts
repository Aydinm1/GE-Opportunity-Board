import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ startSpan: vi.fn(), setStatus: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ startSpan: sdk.startSpan }));
import { traceApplicationStep, getApplicationFailureStep } from '../lib/application-tracing';
import { getSentryInitOptions, getTracingSampleRate, sanitizeSentryEvent } from '../lib/monitoring-config';

beforeEach(() => {
  vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', ''); vi.stubEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '');
  sdk.startSpan.mockImplementation((_options, work) => work({ setStatus: sdk.setStatus })); sdk.setStatus.mockClear();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('tracing configuration', () => {
  it.each(['client', 'server', 'edge'] as const)('enables tracing and privacy hooks for %s', runtime => {
    const config = getSentryInitOptions(runtime);
    expect(config.tracesSampleRate).toBe(1);
    expect(config.beforeSendSpan).toBeTypeOf('function'); expect(config.beforeSendTransaction).toBeTypeOf('function');
    expect(config.dataCollection).toMatchObject({ userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false });
    if (runtime !== 'client') expect(config.tracePropagationTargets).toEqual([]);
  });
  it('limits browser trace propagation to same-origin API paths', () => {
    const targets = getSentryInitOptions('client').tracePropagationTargets;
    expect(targets.some(target => target.test('/api/applications'))).toBe(true);
    expect(targets.some(target => target.test('https://api.airtable.com/v0/base'))).toBe(false);
    expect(targets.some(target => target.test('https://untrusted.example/api/applications'))).toBe(false);
  });
  it('supports server/edge overrides without exposing them to the client', () => {
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '0.2'); vi.stubEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.1');
    expect(getTracingSampleRate('client')).toBe(0.1); expect(getTracingSampleRate('server')).toBe(0.2); expect(getTracingSampleRate('edge')).toBe(0.2);
  });
  it.each(['-1', '1.1', 'NaN', 'Infinity', 'not-a-number'])('disables tracing for invalid configured rate %s', value => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', value); expect(getTracingSampleRate('client')).toBe(0);
  });
  it('uses the public rate on the server when the private override is blank', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0.1'); expect(getTracingSampleRate('server')).toBe(0.1); expect(getTracingSampleRate('edge')).toBe(0.1);
  });
  it('allows zero sampling', () => { vi.stubEnv('NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', '0'); expect(getTracingSampleRate('client')).toBe(0); });
});

describe('trace privacy', () => {
  it('scrubs encoded query filters in spans, transaction contexts and breadcrumbs without losing trace IDs or timing', () => {
    const privateQuery = 'filterByFormula=email%3D%27PRIVATE_SENTINEL%40example.invalid%27';
    const span = { span_id: 'span1', trace_id: 'trace1', start_timestamp: 1, timestamp: 2, status: 'internal_error', description: `GET /v0/base/People?${privateQuery}`, data: { 'http.query': privateQuery, 'http.target': `/People?${privateQuery}`, 'url.full': `https://api.airtable.com/v0/base?${privateQuery}`, 'http.status_code': 422, 'application.step': 'country_lookup' } };
    const event = { transaction: `POST /api/applications?${privateQuery}`, spans: [span], contexts: { trace: { data: span.data } }, breadcrumbs: [{ data: { 'http.query': privateQuery } }], request: { data: { cvResume: 'PRIVATE_SENTINEL' }, query_string: privateQuery } };
    const config = getSentryInitOptions('server');
    const safe = config.beforeSendTransaction(event);
    expect(JSON.stringify(safe)).not.toContain('PRIVATE_SENTINEL');
    expect(safe.spans[0]).toMatchObject({ span_id: 'span1', trace_id: 'trace1', start_timestamp: 1, timestamp: 2, status: 'internal_error', data: { 'http.status_code': 422, 'application.step': 'country_lookup' } });
    expect(safe.transaction).toBe('POST /api/applications');
    expect(JSON.stringify(config.beforeSendSpan(span))).not.toContain('PRIVATE_SENTINEL');
    expect(JSON.stringify(sanitizeSentryEvent(event))).not.toContain('PRIVATE_SENTINEL');
    expect(span.description).toContain('PRIVATE_SENTINEL');
  });
});

describe('application trace steps', () => {
  it('returns the work result and uses only a fixed operation label', async () => {
    expect(await traceApplicationStep('person_lookup', async () => 'result')).toBe('result');
    expect(sdk.startSpan).toHaveBeenLastCalledWith({ name: 'application.person_lookup', op: 'application.step', attributes: { 'application.step': 'person_lookup' } }, expect.any(Function));
  });
  it('preserves the original error and innermost failed step through nested operations', async () => {
    const error = new Error('Failed country lookup');
    await expect(traceApplicationStep('person_create', () => traceApplicationStep('country_lookup', async () => { throw error; }))).rejects.toBe(error);
    expect(getApplicationFailureStep(error)).toBe('country_lookup'); expect(sdk.setStatus).toHaveBeenCalledWith({ code: 2, message: 'internal_error' });
    expect(getApplicationFailureStep(new Error('other'))).toBeUndefined();
  });
});
