import { describe, expect, it, vi } from 'vitest';
import { BOARD_OVERVIEW, DASHBOARD_TAG } from '../integrations/posthog/board-overview.mjs';
import { provisionBoardOverview } from '../scripts/posthog-dashboard.mjs';
import { ANALYTICS_EVENTS } from '../lib/analytics-config';

describe('Board overview dashboard setup', () => {
  it('uses only approved events and one-hour same-role funnels', () => {
    expect(BOARD_OVERVIEW.insights).toHaveLength(10);
    const names = new Set(BOARD_OVERVIEW.insights.map(insight => insight.name));
    expect(names.size).toBe(10);
    for (const insight of BOARD_OVERVIEW.insights) {
      const query = insight.query.source;
      for (const series of query.series) expect(ANALYTICS_EVENTS).toContain(series.event);
      if (query.kind === 'FunnelsQuery') {
        expect(query.funnelsFilter).toMatchObject({ funnelWindowInterval: 1, funnelWindowIntervalUnit: 'hour', funnelAggregateByHogQL: "concat(distinct_id, ':', toString(properties.role_id))" });
      }
    }
  });
  it('creates a dashboard and its ten insights, then safely resumes without duplicates', async () => {
    let exists = false;
    const tiles: unknown[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/dashboards/?limit=100')) return Response.json({ results: exists ? [{ id: 7, name: 'Board overview', tags: [DASHBOARD_TAG] }] : [], next: null });
      if (url.endsWith('/dashboards/') && init.method === 'POST') { exists = true; return Response.json({ id: 7 }); }
      if (url.endsWith('/dashboards/7/')) return Response.json({ tiles });
      if (url.endsWith('/insights/') && init.method === 'POST') {
        const insight = JSON.parse(String(init.body));
        expect(insight.dashboards).toEqual([7]);
        tiles.push({ insight });
        return Response.json({ id: tiles.length });
      }
      throw new Error('Unexpected mock request');
    });
    const config = { host: 'https://us.posthog.com', projectId: '123', token: 'private-local-test-key', fetchImpl: fetch };
    expect(await provisionBoardOverview(config)).toEqual({ url: 'https://us.posthog.com/project/123/dashboard/7', created: 10 });
    expect(await provisionBoardOverview(config)).toEqual({ url: 'https://us.posthog.com/project/123/dashboard/7', created: 0 });
    expect(tiles).toHaveLength(10);
  });
  it('rejects untrusted destinations and public tracking keys before making a request', async () => {
    const fetch = vi.fn();
    const config = { host: 'https://us.posthog.com', projectId: '123', token: 'private-local-test-key', fetchImpl: fetch };
    await expect(provisionBoardOverview({ ...config, host: 'https://untrusted.invalid' })).rejects.toThrow('app host');
    await expect(provisionBoardOverview({ ...config, token: 'phc_public' })).rejects.toThrow('management API key');
    await expect(provisionBoardOverview({ ...config, projectId: '../other' })).rejects.toThrow('numeric');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not follow pagination to another host or expose response bodies on failures', async () => {
    const config = { host: 'https://us.posthog.com', projectId: '123', token: 'private-local-test-key' };
    await expect(provisionBoardOverview({ ...config, fetchImpl: vi.fn().mockResolvedValue(Response.json({ results: [], next: 'https://untrusted.invalid/' })) })).rejects.toThrow('destination');
    await expect(provisionBoardOverview({ ...config, fetchImpl: vi.fn().mockResolvedValue(new Response('PRIVATE_SENTINEL', { status: 403 })) })).rejects.toThrow('HTTP 403');
  });
});
