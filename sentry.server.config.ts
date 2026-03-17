import * as Sentry from '@sentry/nextjs';
import { getSentryDsn, getSentryInitOptions } from './lib/monitoring-config';

if (getSentryDsn()) {
  Sentry.init(getSentryInitOptions('server'));
}
