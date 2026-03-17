// This file configures the initialization of Sentry on the client.
// The config added here is used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';
import { getSentryDsn, getSentryInitOptions } from './lib/monitoring-config';

if (getSentryDsn()) {
  Sentry.init(getSentryInitOptions('client'));
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
