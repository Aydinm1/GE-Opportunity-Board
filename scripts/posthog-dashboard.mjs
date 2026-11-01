import { pathToFileURL } from 'node:url';
import { BOARD_OVERVIEW, DASHBOARD_TAG } from '../integrations/posthog/board-overview.mjs';

export async function provisionBoardOverview({ host, projectId, token, fetchImpl = fetch }) {
  if (!['https://us.posthog.com', 'https://eu.posthog.com'].includes(host)) throw new Error('Use the US or EU PostHog app host, not the ingestion host.');
  if (!/^[1-9][0-9]*$/.test(String(projectId))) throw new Error('A numeric POSTHOG_PROJECT_ID is required.');
  if (!token || token.startsWith('phc_')) throw new Error('Dashboard setup requires a private management API key; the public project token cannot create dashboards.');
  const base = `${host}/api/projects/${projectId}/`;
  async function api(path, body) {
    const url = new URL(path, base);
    if (!url.href.startsWith(base)) throw new Error('Unexpected dashboard API destination.');
    const response = await fetchImpl(url.href, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`PostHog dashboard setup failed (HTTP ${response.status}).`);
    return response.json();
  }
  let path = 'dashboards/?limit=100';
  let dashboard;
  const pages = new Set();
  while (path) {
    if (pages.has(path) || pages.size >= 100) throw new Error('Unexpected dashboard pagination.');
    pages.add(path);
    const page = await api(path);
    dashboard = page.results.find(item => item.name === BOARD_OVERVIEW.name && item.tags?.includes(DASHBOARD_TAG) && !item.deleted);
    if (dashboard) break;
    path = page.next;
  }
  const { insights, ...definition } = BOARD_OVERVIEW;
  if (!dashboard) dashboard = await api('dashboards/', definition);
  if (!Number.isSafeInteger(dashboard.id) || dashboard.id <= 0) throw new Error('Invalid dashboard response.');
  const detail = await api(`dashboards/${dashboard.id}/`);
  const existing = new Set((detail.tiles || []).filter(tile => !tile.deleted && tile.insight?.tags?.includes(DASHBOARD_TAG)).map(tile => tile.insight.name));
  let created = 0;
  for (const item of insights) {
    if (existing.has(item.name)) continue;
    await api('insights/', { ...item, dashboards: [dashboard.id] });
    created++;
  }
  return { url: `${host}/project/${projectId}/dashboard/${dashboard.id}`, created };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--apply')) console.log(JSON.stringify(BOARD_OVERVIEW, null, 2));
  else {
    try {
      const result = await provisionBoardOverview({
        host: process.env.POSTHOG_APP_HOST || 'https://us.posthog.com',
        projectId: process.env.POSTHOG_PROJECT_ID,
        token: process.env.POSTHOG_PERSONAL_API_KEY,
      });
      console.log(`Board overview ready: ${result.url} (${result.created} insights created)`);
    } catch (error) {
      // Fixed messages only: never print credentials or raw upstream responses.
      console.error(error instanceof Error && /^(Use |A numeric |Dashboard setup |Unexpected |PostHog dashboard |Invalid dashboard )/.test(error.message) ? error.message : 'PostHog dashboard setup could not complete. Check connectivity and the local management configuration.');
      process.exitCode = 1;
    }
  }
}
