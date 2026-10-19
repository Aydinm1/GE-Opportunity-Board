import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
  setLevel: vi.fn(),
  setTag: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: sentryMock.captureException,
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  init: vi.fn(),
  withScope: (callback: (scope: {
    setContext: typeof sentryMock.setContext;
    setLevel: typeof sentryMock.setLevel;
    setTag: typeof sentryMock.setTag;
  }) => void) =>
    callback({
      setContext: sentryMock.setContext,
      setLevel: sentryMock.setLevel,
      setTag: sentryMock.setTag,
    }),
}));

import { captureClientException, captureServerException } from '../lib/monitoring';
import { sanitizeMonitoringMessage, sanitizeMonitoringValue, sanitizeSentryEvent } from '../lib/monitoring-config';

describe('monitoring', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    sentryMock.captureException.mockClear();
    sentryMock.setContext.mockClear();
    sentryMock.setLevel.mockClear();
    sentryMock.setTag.mockClear();
  });

  it('captures server exceptions with safe tags and metadata', () => {
    captureServerException(new Error('boom'), {
      context: '/api/applications',
      status: 500,
      person: { fullName: 'Jane Doe', emailAddress: 'jane@example.com' },
    });

    expect(sentryMock.setTag).toHaveBeenCalledWith('surface', 'server');
    expect(sentryMock.setTag).toHaveBeenCalledWith('context', '/api/applications');
    expect(sentryMock.setTag).toHaveBeenCalledWith('http_status', '500');
    expect(sentryMock.setContext).toHaveBeenCalledWith('monitoring', {
      context: '/api/applications',
      person: '[redacted]',
      status: 500,
    });
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
  });

  it('captures client network failures with diagnostic metadata', () => {
    captureClientException(new TypeError('Failed to fetch'), {
      endpoint: '/api/applications',
      operation: 'submit_application',
      status: undefined,
      navigatorOnline: false,
      visibilityState: 'hidden',
      pageHideCount: 1,
      visibilityChangeCount: 2,
      uploadBytes: 1024,
      uploadMimeType: 'application/pdf',
      uploadExtension: '.pdf',
      pagePath: '/',
      pageSearch: '?job=rec123&view=apply',
    });

    expect(sentryMock.setTag).toHaveBeenCalledWith('surface', 'client');
    expect(sentryMock.setTag).toHaveBeenCalledWith('endpoint', '/api/applications');
    expect(sentryMock.setTag).toHaveBeenCalledWith('operation', 'submit_application');
    expect(sentryMock.setContext).toHaveBeenCalledWith('monitoring', {
      endpoint: '/api/applications',
      navigatorOnline: false,
      operation: 'submit_application',
      pageHideCount: 1,
      pagePath: '/',
      pageSearch: '?job=rec123&view=apply',
      status: undefined,
      uploadBytes: 1024,
      uploadExtension: '.pdf',
      uploadMimeType: 'application/pdf',
      visibilityChangeCount: 2,
      visibilityState: 'hidden',
    });
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
  });

  it('redacts sensitive payload data before sending to Sentry', () => {
    expect(
      sanitizeMonitoringValue({
        attachment: { filename: 'resume.pdf', base64: 'abc123' },
        emailAddress: 'jane@example.com',
        jobId: 'rec123',
      })
    ).toEqual({
      attachment: '[redacted]',
      emailAddress: '[redacted]',
      jobId: 'rec123',
    });

    expect(
      sanitizeSentryEvent({
        user: { email: 'jane@example.com' },
        request: {
          data: { attachments: { cvResume: 'abc123' } },
          cookies: 'session=123',
          headers: { authorization: 'Bearer secret', 'x-request-id': 'req_123' },
        },
      })
    ).toEqual({
      request: {
        headers: { authorization: '[redacted]', 'x-request-id': 'req_123' },
      },
      user: {},
    });
  });
});


describe('diagnostic message privacy', () => {
  it.each([
    'Rejected "PRIVATE_PERSON"',
    "Rejected 'PRIVATE_PERSON'",
    'Rejected "PRIVATE_PERSON \\"quoted\\""',
    'Contact PRIVATE_PERSON@example.invalid',
    'Bearer PRIVATE_PERSON',
    'Request https://files.example/PRIVATE_PERSON.pdf?token=secret',
  ])('redacts applicant values in %s', message => {
    expect(sanitizeMonitoringMessage(message)).not.toContain('PRIVATE_PERSON');
  });

  it('bounds messages while preserving ordinary diagnostic text and contractions', () => {
    expect(sanitizeMonitoringMessage("We couldn't save your answer.")).toBe("We couldn't save your answer.");
    expect(sanitizeMonitoringMessage('x'.repeat(5000))).toHaveLength(2000);
  });

  it('sanitizes exception values, breadcrumbs, log entries, and request queries without mutating the event', () => {
    const message = 'Rejected "PRIVATE_PERSON"';
    const frame = { filename: 'https://board.example/_next/chunks/app.js', lineno: 10 };
    const event = {
      message,
      logentry: { formatted: message, params: ['"PRIVATE_PERSON"'] },
      exception: { values: [{ value: message, stacktrace: { frames: [frame] }, mechanism: { data: { details: message } } }] },
      breadcrumbs: [{ message, data: { response: message, authorization: 'Bearer PRIVATE_PERSON' } }],
      request: { url: 'https://board.example/api/applications?email=PRIVATE_PERSON@example.invalid', query_string: 'name=PRIVATE_PERSON' },
      extra: { cause: new Error(message) },
    };
    const safe = sanitizeSentryEvent(event);
    expect(JSON.stringify(safe)).not.toContain('PRIVATE_PERSON');
    expect(safe.exception.values[0].stacktrace.frames[0]).toEqual(frame);
    expect(safe.request.url).toBe('https://board.example/api/applications');
    expect(safe.request).not.toHaveProperty('query_string');
    expect(event.message).toContain('PRIVATE_PERSON');
  });

  it('sanitizes exception messages and causes before handing them to the SDK, preserving source frames', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/1';
    sentryMock.captureException.mockClear();
    const error = new Error('Rejected "PRIVATE_PERSON"');
    error.stack = 'Error: Rejected "PRIVATE_PERSON"\n    at submit (https://board.example/_next/chunks/app.js:10:2)';
    error.cause = { details: 'Rejected "PRIVATE_PERSON"' };
    captureServerException(error);
    const captured = sentryMock.captureException.mock.calls[0][0] as Error;
    expect(captured.message).not.toContain('PRIVATE_PERSON');
    expect(captured.stack).not.toContain('PRIVATE_PERSON');
    expect(JSON.stringify(captured.cause)).not.toContain('PRIVATE_PERSON');
    expect(captured.stack).toContain('https://board.example/_next/chunks/app.js:10:2');
  });
});
