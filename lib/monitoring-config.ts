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

// Keep fixed diagnostic text; strip values that upstream errors may quote or embed.
export function sanitizeMonitoringMessage(message: string) {
  return message
    .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, REDACTED_VALUE)
    .replace(/(^|[\s=:([{])'[^'\\]*(?:\\.[^'\\]*)*'(?=$|[\s.,;:!?)\]}])/g, (_match, prefix) => `${prefix}${REDACTED_VALUE}`)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED_VALUE)
    .replace(/Bearer\s+[^\s,;]+/gi, `Bearer ${REDACTED_VALUE}`)
    .replace(/https?:\/\/[^\s<>]+/gi, '[redacted URL]')
    .slice(0, 2000);
}

export function sanitizeMonitoringValue(value: unknown, key = ''): unknown {
  if (key && shouldRedactKey(key)) {
    return REDACTED_VALUE;
  }

  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeMonitoringMessage(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMonitoringValue(item, key));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeMonitoringMessage(value.message),
      stack: value.stack ? sanitizeMonitoringMessage(value.stack) : undefined,
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
  if (typeof sanitized.message === 'string') sanitized.message = sanitizeMonitoringMessage(sanitized.message);
  if (sanitized.logentry) sanitized.logentry = sanitizeMonitoringValue(sanitized.logentry, 'logentry');
  if (Array.isArray(sanitized.exception?.values)) {
    sanitized.exception = {
      ...sanitized.exception,
      values: sanitized.exception.values.map((exception: any) => ({
        ...exception,
        ...(typeof exception.value === 'string' ? { value: sanitizeMonitoringMessage(exception.value) } : {}),
        ...(exception.mechanism ? { mechanism: sanitizeMonitoringValue(exception.mechanism, 'mechanism') } : {}),
      })),
    };
  }
  if (Array.isArray(sanitized.breadcrumbs)) {
    sanitized.breadcrumbs = sanitized.breadcrumbs.map((breadcrumb: any) => ({
      ...breadcrumb,
      ...(typeof breadcrumb.message === 'string' ? { message: sanitizeMonitoringMessage(breadcrumb.message) } : {}),
      ...(breadcrumb.data ? { data: sanitizeMonitoringValue(breadcrumb.data, 'data') } : {}),
    }));
  }

  if (sanitized.user) {
    sanitized.user = {};
  }

  if (sanitized.request) {
    const request = { ...sanitized.request };
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    if (typeof request.url === 'string') {
      try {
        const url = new URL(request.url);
        request.url = `${url.origin}${url.pathname}`;
      } catch {
        request.url = '[redacted URL]';
      }
    }
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
