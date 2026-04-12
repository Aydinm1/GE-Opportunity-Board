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
import { sanitizeMonitoringValue, sanitizeSentryEvent } from '../lib/monitoring-config';

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
