import type { CaptureResult, PostHogConfig } from 'posthog-js/dist/module.no-external';

export const ANALYTICS_EVENTS = ['$pageview', 'role_viewed', 'application_started', 'application_submission_confirmed', 'tor_clicked'] as const;
export type AnalyticsEvent = typeof ANALYTICS_EVENTS[number];
export type AnalyticsProperties = {
  is_embedded: boolean;
  viewport: 'mobile' | 'desktop';
  role_id?: string;
  role_title?: string;
  tor_source?: 'link' | 'upload';
};

export function getAnalyticsConfig(settings: {
  enabled?: string; token?: string; host?: string; environment?: string; hostname?: string;
}) {
  if (settings.enabled !== 'true' || settings.environment !== 'production' || settings.hostname !== 'ge-opp-board.the.ismaili') return null;
  if (!settings.token || !/^phc_[a-zA-Z0-9_-]+$/.test(settings.token)) return null;
  if (settings.host !== 'https://us.i.posthog.com' && settings.host !== 'https://eu.i.posthog.com') return null;
  return { token: settings.token, host: settings.host };
}

function safeUrl(value: unknown, originOnly = false) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return originOnly ? url.origin : `${url.origin}${url.pathname}`;
  } catch { return ''; }
}

// This is also the final SDK before_send filter, after automatic enrichment.
// Keep the cookieless ingestion fields; reject all other unknown properties.
export function sanitizeAnalyticsEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event || !(ANALYTICS_EVENTS as readonly string[]).includes(event.event)) return null;
  const input = event.properties || {};
  const properties: Record<string, unknown> = {
    distinct_id: '$posthog_cookieless',
    $cookieless_mode: true,
    $process_person_profile: false,
  };
  for (const key of ['token', '$lib', '$lib_version', '$config_defaults', '$browser', '$browser_version', '$os', '$os_version', '$device_type']) {
    if (typeof input[key] === 'string' || typeof input[key] === 'number') properties[key] = input[key];
  }
  if (typeof input.is_embedded === 'boolean') properties.is_embedded = input.is_embedded;
  if (input.viewport === 'mobile' || input.viewport === 'desktop') properties.viewport = input.viewport;
  if (event.event !== '$pageview') {
    if (typeof input.role_id !== 'string' || !/^rec[a-zA-Z0-9]{1,30}$/.test(input.role_id)) return null;
    properties.role_id = input.role_id;
    if (typeof input.role_title === 'string') properties.role_title = input.role_title.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
  }
  if (event.event === 'tor_clicked' && (input.tor_source === 'link' || input.tor_source === 'upload')) properties.tor_source = input.tor_source;
  const current = safeUrl(input.$current_url);
  if (current) {
    const url = new URL(current);
    properties.$current_url = current;
    properties.$host = url.host;
    properties.$pathname = url.pathname;
  }
  const referrer = safeUrl(input.$referrer, true);
  if (referrer) {
    properties.$referrer = referrer;
    properties.$referring_domain = new URL(referrer).hostname;
  }
  // Do not retain SDK-added top-level enrichment or user fields either.
  return { event: event.event, properties, timestamp: event.timestamp, uuid: event.uuid } as CaptureResult;
}

export function getPostHogOptions(host: string): Partial<PostHogConfig> {
  return {
    api_host: host,
    defaults: '2026-08-30',
    cookieless_mode: 'always',
    person_profiles: 'never',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    capture_performance: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_feature_flags: true,
    advanced_disable_decide: true,
    save_referrer: false,
    store_google: false,
    enable_recording_console_log: false,
    before_send: sanitizeAnalyticsEvent,
  };
}
