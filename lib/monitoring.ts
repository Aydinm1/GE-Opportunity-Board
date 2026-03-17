import * as Sentry from '@sentry/nextjs';
import { getSentryDsn, sanitizeMonitoringValue } from './monitoring-config';

type MonitoringMeta = Record<string, unknown> & {
  endpoint?: string;
  context?: string;
  operation?: string;
  status?: number;
};

function isMonitoringEnabled() {
  return Boolean(getSentryDsn());
}

function toError(err: unknown) {
  if (err instanceof Error) return err;
  if (typeof err === 'string') return new Error(err);
  return new Error('Unknown error');
}

function applyScope(scope: any, surface: 'client' | 'server' | 'render', meta: MonitoringMeta) {
  scope.setLevel('error');
  scope.setTag('surface', surface);
  if (meta.context) scope.setTag('context', String(meta.context));
  if (meta.endpoint) scope.setTag('endpoint', String(meta.endpoint));
  if (meta.operation) scope.setTag('operation', String(meta.operation));
  if (typeof meta.status === 'number') scope.setTag('http_status', String(meta.status));

  const sanitizedMeta = sanitizeMonitoringValue(meta, 'meta');
  if (sanitizedMeta && typeof sanitizedMeta === 'object' && !Array.isArray(sanitizedMeta)) {
    scope.setContext('monitoring', sanitizedMeta as Record<string, unknown>);
  }
}

function captureWithSurface(surface: 'client' | 'server' | 'render', err: unknown, meta: MonitoringMeta = {}) {
  if (!isMonitoringEnabled()) return;

  Sentry.withScope((scope) => {
    applyScope(scope, surface, meta);
    Sentry.captureException(toError(err));
  });
}

export function captureServerException(err: unknown, meta: MonitoringMeta = {}) {
  captureWithSurface('server', err, meta);
}

export function captureClientException(err: unknown, meta: MonitoringMeta = {}) {
  captureWithSurface('client', err, meta);
}

export function captureRenderException(err: unknown, meta: MonitoringMeta = {}) {
  captureWithSurface('render', err, meta);
}
