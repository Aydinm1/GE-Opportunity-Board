const REDACTED_VALUE = '[redacted]';
const REDACTED_KEY_PATTERNS = [
  /attachment/i,
  /attachments/i,
  /authorization/i,
  /base64/i,
  /cookie/i,
  /^cv$/i,
  /email/i,
  /full.?name/i,
  /idempotency/i,
  /jamati/i,
  /linkedin/i,
  /payload/i,
  /person/i,
  /phone/i,
  /profession/i,
  /resume/i,
  /token/i,
  /^why$/i,
  /qualified/i,
];

function shouldRedactKey(key: string) {
  return REDACTED_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function getSentryDsn() {
  return process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '';
}

export function getMonitoringEnvironment() {
  return process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

export function sanitizeMonitoringValue(value: unknown, key = ''): unknown {
  if (key && shouldRedactKey(key)) {
    return REDACTED_VALUE;
  }

  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMonitoringValue(item, key));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: sanitizeMonitoringValue(value.cause, 'cause'),
    };
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[entryKey] = sanitizeMonitoringValue(entryValue, entryKey);
    }
    return sanitized;
  }

  return String(value);
}

export function sanitizeSentryEvent(event: any) {
  const sanitized = { ...event };

  if (sanitized.user) {
    sanitized.user = {};
  }

  if (sanitized.request) {
    const request = { ...sanitized.request };
    delete request.data;
    delete request.cookies;
    if (request.headers) {
      request.headers = sanitizeMonitoringValue(request.headers, 'headers');
    }
    sanitized.request = request;
  }

  if (sanitized.extra) {
    sanitized.extra = sanitizeMonitoringValue(sanitized.extra, 'extra');
  }

  if (sanitized.contexts) {
    sanitized.contexts = sanitizeMonitoringValue(sanitized.contexts, 'contexts');
  }

  if (sanitized.tags) {
    sanitized.tags = sanitizeMonitoringValue(sanitized.tags, 'tags');
  }

  return sanitized;
}

export function getSentryInitOptions(runtime: 'client' | 'server' | 'edge') {
  return {
    dsn: getSentryDsn(),
    enabled: Boolean(getSentryDsn()),
    environment: getMonitoringEnvironment(),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: sanitizeSentryEvent,
    initialScope: {
      tags: {
        runtime,
      },
    },
  };
}
