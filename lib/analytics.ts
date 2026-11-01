import type { Job } from './types';
import { getAnalyticsConfig, getPostHogOptions, type AnalyticsEvent, type AnalyticsProperties } from './analytics-config';

// All state is scoped to this document, never browser storage or a person profile.
const recorded = new Set<string>();
let client: Promise<typeof import('posthog-js/dist/module.no-external')['default']> | undefined;

function capture(event: AnalyticsEvent, role?: Pick<Job, 'id' | 'roleTitle'>, onceKey?: string, torSource?: 'link' | 'upload') {
  try {
    if (typeof window === 'undefined') return;
    const config = getAnalyticsConfig({
      enabled: process.env.NEXT_PUBLIC_POSTHOG_ENABLED,
      token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      environment: process.env.NODE_ENV,
      hostname: window.location.hostname,
    });
    if (!config || (onceKey && recorded.has(onceKey))) return;
    if (onceKey) recorded.add(onceKey);
    const properties: AnalyticsProperties = {
      is_embedded: window.parent !== window,
      viewport: window.matchMedia('(max-width: 1023px)').matches ? 'mobile' : 'desktop',
      ...(role ? { role_id: role.id, role_title: role.roleTitle } : {}),
      ...(torSource ? { tor_source: torSource } : {}),
    };
    if (!client) {
      client = import('posthog-js/dist/module.no-external').then(({ default: sdk }) => {
        sdk.init(config.token, getPostHogOptions(config.host));
        return sdk;
      });
    }
    // Neither loading nor delivery participates in the user flow. Attach the
    // catch immediately so blocked imports/requests never reject into React.
    void client.then(sdk => sdk.capture(event, properties)).catch(() => {});
  } catch { /* Analytics must never interfere with the board. */ }
}

export const trackBoardPageview = () => capture('$pageview', undefined, '$pageview');
export const trackRoleViewed = (role: Pick<Job, 'id' | 'roleTitle'>) => capture('role_viewed', role, `role:${role.id}`);
export const trackApplicationStarted = (role: Pick<Job, 'id' | 'roleTitle'>) => capture('application_started', role, `started:${role.id}`);
// The existing private retry key is used only for in-memory deduplication.
export const trackSubmissionConfirmed = (role: Pick<Job, 'id' | 'roleTitle'>, retryKey: string) => capture('application_submission_confirmed', role, `confirmed:${role.id}:${retryKey}`);
export const trackTorClicked = (role: Pick<Job, 'id' | 'roleTitle'>, source: 'link' | 'upload') => capture('tor_clicked', role, undefined, source);
