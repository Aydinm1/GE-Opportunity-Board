// Query shapes follow PostHog's public query schema and Insights API.
// This file is setup data, never imported by the browser application.
export const DASHBOARD_TAG = 'ge-opportunity-board-analytics-v1';
const node = (event, math = 'total') => ({ kind: 'EventsNode', event, name: event, math });
const insight = (name, description, source) => ({
  name, description, tags: [DASHBOARD_TAG], query: { kind: 'InsightVizNode', source },
});
const trends = (event, math = 'total', breakdown) => ({
  kind: 'TrendsQuery', dateRange: { date_from: '-7d' }, interval: 'day', series: [node(event, math)],
  trendsFilter: { display: breakdown ? 'ActionsBarValue' : 'ActionsLineGraph', showLegend: true },
  ...(breakdown ? { breakdownFilter: { breakdowns: [{ property: breakdown, type: 'event' }] } } : {}),
});
const funnel = events => ({
  kind: 'FunnelsQuery', dateRange: { date_from: '-7d' }, series: events.map(event => node(event)),
  funnelsFilter: {
    funnelWindowInterval: 1, funnelWindowIntervalUnit: 'hour', funnelOrderType: 'ordered', funnelVizType: 'steps',
    // Aggregate visitor/role pairs so one role's view cannot convert another role.
    funnelAggregateByHogQL: "concat(distinct_id, ':', toString(properties.role_id))",
  },
});

export const BOARD_OVERVIEW = {
  name: 'Board overview', tags: [DASHBOARD_TAG],
  description: 'Cookieless visitor estimates; not exact people across days/devices. Counts exclude blocked analytics. Confirmations are responses received by the browser; Airtable is authoritative for saved applications. Funnels count visitor/role pairs within one hour and may split across daily identity changes. Geography and IP-based bot enrichment are unavailable.',
  insights: [
    insight('Daily estimated visitors', 'Daily unique cookieless visitors. Do not sum these as unique people across days.', trends('$pageview', 'dau')),
    insight('Board pageviews', 'One pageview per document load, independent of role navigation.', trends('$pageview')),
    insight('Visitors by viewport', 'Daily visitor estimates split by mobile/desktop layout.', trends('$pageview', 'dau', 'viewport')),
    insight('Embedded versus standalone', 'Daily visitor estimates split by embedding context; totals across groups may overlap.', trends('$pageview', 'dau', 'is_embedded')),
    insight('Most-viewed roles', 'First visible exposure per role per board document. Public titles only.', trends('role_viewed', 'total', 'role_title')),
    insight('TOR clicks by role', 'Accepted link/download actions, not completed downloads.', trends('tor_clicked', 'total', 'role_title')),
    insight('Application starts by role', 'First applicant edit or file selection per role per document; reopening does not count again.', trends('application_started', 'total', 'role_title')),
    insight('Submission confirmations by role', 'Browser-observed {ok:true} confirmations, deduplicated per submission in memory.', trends('application_submission_confirmed', 'total', 'role_title')),
    insight('Role view to application confirmation', 'Same-role visitor/role pairs; ordered steps within one hour. Direct-to-application links may skip the view step.', funnel(['role_viewed', 'application_started', 'application_submission_confirmed'])),
    insight('Application start to confirmation', 'Includes direct-to-application links; ordered same-role visitor/role pairs within one hour.', funnel(['application_started', 'application_submission_confirmed'])),
  ],
};
