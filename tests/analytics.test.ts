import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureResult } from 'posthog-js/dist/module.no-external';
import { ANALYTICS_EVENTS, getAnalyticsConfig, getPostHogOptions, sanitizeAnalyticsEvent } from '../lib/analytics-config';

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock('posthog-js/dist/module.no-external', () => ({ default: sdk }));
const settings = { enabled: 'true', token: 'phc_synthetic', host: 'https://us.i.posthog.com', environment: 'production', hostname: 'ge-opp-board.the.ismaili' };
const role = { id: 'recSyntheticRole', roleTitle: 'Public role' };

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  sdk.init.mockReset(); sdk.capture.mockReset();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_ENABLED', 'true');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_synthetic');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', settings.host);
  const window = { location: { hostname: settings.hostname }, matchMedia: () => ({ matches: false }), parent: null as unknown };
  window.parent = window;
  vi.stubGlobal('window', window);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('production configuration', () => {
  it.each([
    { enabled: undefined }, { enabled: 'false' }, { environment: 'development' },
    { hostname: 'localhost' }, { hostname: 'preview.vercel.app' },
    { token: '' }, { token: 'phx_private_personal_key' }, { host: undefined }, { host: 'https://untrusted.invalid' },
  ])('fails closed for %j', override => {
    expect(getAnalyticsConfig({ ...settings, ...override })).toBeNull();
  });
  it('accepts the configured US or EU ingestion region', () => {
    expect(getAnalyticsConfig(settings)).toEqual({ token: settings.token, host: settings.host });
    expect(getAnalyticsConfig({ ...settings, host: 'https://eu.i.posthog.com' })).toBeTruthy();
  });
  it('disables all automatic collection, storage identity and remote extensions', () => {
    expect(getPostHogOptions(settings.host)).toMatchObject({
      cookieless_mode: 'always', person_profiles: 'never', autocapture: false,
      capture_pageview: false, capture_pageleave: false, capture_exceptions: false,
      capture_performance: false, capture_heatmaps: false, capture_dead_clicks: false,
      disable_session_recording: true, disable_surveys: true, disable_web_experiments: true,
      disable_external_dependency_loading: true, advanced_disable_feature_flags: true, advanced_disable_decide: true,
    });
  });
});

describe('final payload privacy filter', () => {
  it.each(['$autocapture', '$snapshot', '$exception', '$identify', 'unknown'])('drops unapproved event %s', event => {
    expect(sanitizeAnalyticsEvent({ event, properties: {} } as CaptureResult)).toBeNull();
  });
  it.each(ANALYTICS_EVENTS)('allows only safe properties for %s', event => {
    const safe = sanitizeAnalyticsEvent({
      event, uuid: 'event-uuid', timestamp: new Date('2026-11-01T12:00:00Z'),
      $set: { email: 'PRIVATE_SENTINEL' },
      properties: {
        token: 'phc_synthetic', distinct_id: 'PRIVATE_SENTINEL', $session_id: 'PRIVATE_SENTINEL',
        is_embedded: true, viewport: 'mobile', role_id: role.id, role_title: role.roleTitle,
        tor_source: 'upload', email: 'PRIVATE_SENTINEL', whyText: 'PRIVATE_SENTINEL',
        cvResume: 'PRIVATE_SENTINEL', filename: 'PRIVATE_SENTINEL.pdf', idempotencyKey: 'PRIVATE_SENTINEL',
        $set_once: { name: 'PRIVATE_SENTINEL' }, $browser: 'Chrome',
        $current_url: 'https://ge-opp-board.the.ismaili/?email=PRIVATE_SENTINEL#PRIVATE_SENTINEL',
        $referrer: 'https://the.ismaili/globalencounters/opportunities?email=PRIVATE_SENTINEL#PRIVATE_SENTINEL',
        $initial_referrer: 'PRIVATE_SENTINEL', utm_campaign: 'PRIVATE_SENTINEL',
      },
    } as unknown as CaptureResult);
    expect(safe).toMatchObject({ event, uuid: 'event-uuid', properties: {
      distinct_id: '$posthog_cookieless', $cookieless_mode: true, $process_person_profile: false,
      $current_url: 'https://ge-opp-board.the.ismaili/', $referrer: 'https://the.ismaili',
      $referring_domain: 'the.ismaili', is_embedded: true, viewport: 'mobile', $browser: 'Chrome',
    } });
    expect(JSON.stringify(safe)).not.toContain('PRIVATE_SENTINEL');
    if (event === '$pageview') expect(safe.properties).not.toHaveProperty('role_id');
    if (event !== 'tor_clicked') expect(safe.properties).not.toHaveProperty('tor_source');
  });
  it('rejects invalid role IDs and non-HTTP referrers', () => {
    expect(sanitizeAnalyticsEvent({ uuid: 'test', event: 'role_viewed', properties: { role_id: 'private@example.invalid' } })).toBeNull();
    const safe = sanitizeAnalyticsEvent({ uuid: 'test', event: '$pageview', properties: { $current_url: 'not a URL', $referrer: 'javascript:private()' } });
    expect(safe.properties).not.toHaveProperty('$referrer');
    expect(safe.properties).not.toHaveProperty('$current_url');
  });
});

describe('event delivery and document-scoped deduplication', () => {
  it('initializes once and deduplicates views/starts/confirmations without sending retry keys', async () => {
    const analytics = await import('../lib/analytics');
    analytics.trackBoardPageview(); analytics.trackBoardPageview();
    analytics.trackRoleViewed(role); analytics.trackRoleViewed(role);
    analytics.trackApplicationStarted(role); analytics.trackApplicationStarted(role);
    analytics.trackSubmissionConfirmed(role, 'PRIVATE_RETRY_KEY'); analytics.trackSubmissionConfirmed(role, 'PRIVATE_RETRY_KEY');
    analytics.trackTorClicked(role, 'upload'); analytics.trackTorClicked(role, 'link');
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledTimes(6));
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.capture.mock.calls.map(call => call[0])).toEqual([...ANALYTICS_EVENTS, 'tor_clicked']);
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain('PRIVATE_RETRY_KEY');
    expect(sdk.capture).toHaveBeenCalledWith('role_viewed', { role_id: role.id, role_title: role.roleTitle, is_embedded: false, viewport: 'desktop' });
  });
  it('tracks each role and distinct successful submission separately', async () => {
    const analytics = await import('../lib/analytics');
    analytics.trackRoleViewed(role);
    analytics.trackRoleViewed({ ...role, id: 'recOtherRole' });
    analytics.trackSubmissionConfirmed(role, 'first'); analytics.trackSubmissionConfirmed(role, 'second');
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledTimes(4));
  });
  it('measures mobile/embedded context from the browser, not initial React defaults', async () => {
    Object.assign(window, { parent: {}, matchMedia: () => ({ matches: true }) });
    (await import('../lib/analytics')).trackBoardPageview();
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledWith('$pageview', { is_embedded: true, viewport: 'mobile' }));
  });
  it('does not initialize or capture on disabled/preview configurations', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_ENABLED', 'false');
    (await import('../lib/analytics')).trackBoardPageview();
    await Promise.resolve();
    expect(sdk.init).not.toHaveBeenCalled(); expect(sdk.capture).not.toHaveBeenCalled();
  });
  it('swallows initialization and capture failures', async () => {
    sdk.init.mockImplementationOnce(() => { throw new Error('blocked SDK'); });
    const analytics = await import('../lib/analytics');
    expect(() => analytics.trackBoardPageview()).not.toThrow();
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    expect(sdk.capture).not.toHaveBeenCalled();
    vi.resetModules(); sdk.init.mockReset(); sdk.capture.mockImplementationOnce(() => { throw new Error('blocked capture'); });
    expect(() => import('../lib/analytics').then(module => module.trackBoardPageview())).not.toThrow();
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledTimes(1));
  });
});
