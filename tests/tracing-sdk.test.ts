import { expect, it } from 'vitest';
import * as Sentry from '@sentry/nextjs';
import { getSentryInitOptions } from '../lib/monitoring-config';

it('exports a sampled transaction and correlated error without private query values through the actual SDK', async () => {
  const envelopes: any[] = [];
  Sentry.init({
    ...getSentryInitOptions('server'), dsn: 'https://public@example.ingest.sentry.io/1', enabled: true, tracesSampleRate: 1,
    defaultIntegrations: false, integrations: [],
    transport: () => ({ send: async envelope => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }),
  });
  try {
    await Sentry.startSpan({ name: 'application.submit', op: 'application.step', forceTransaction: true }, async () => {
      await Sentry.startSpan({ name: 'application.country_lookup', op: 'application.step', attributes: { 'application.step': 'country_lookup', 'http.query': 'email=PRIVATE_SENTINEL%40example.invalid', 'http.status_code': 422 } }, async () => {
        Sentry.captureException(new Error('Synthetic tracing check'), { extra: { 'http.query': 'PRIVATE_SENTINEL' } });
      });
    });
    await Sentry.flush(3000);
    const items = envelopes.flatMap(envelope => envelope[1]);
    const transaction = items.find(([header]) => header.type === 'transaction')?.[1];
    const error = items.find(([header]) => header.type === 'event')?.[1];
    expect(transaction).toBeDefined(); expect(error).toBeDefined();
    expect(transaction.contexts.trace.trace_id).toBe(error.contexts.trace.trace_id);
    expect(transaction.spans).toContainEqual(expect.objectContaining({ description: 'application.country_lookup', data: expect.objectContaining({ 'http.status_code': 422 }) }));
    expect(JSON.stringify(envelopes)).not.toContain('PRIVATE_SENTINEL');
  } finally { await Sentry.close(1000); }
}, 10000);
