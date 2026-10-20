import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const row = (id: string, name = id) => ({ id, fields: { Name: name } });
const expired = () => json({ error: { type: 'LIST_RECORDS_ITERATOR_NOT_AVAILABLE', message: 'private upstream detail' } }, 422);
let load: typeof import('../lib/country-records').loadCountryRecords;
let now: number;
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('AIRTABLE_TOKEN', 'test-token'); vi.stubEnv('AIRTABLE_BASE_ID', 'appTest'); vi.stubEnv('AIRTABLE_COUNTRIES_TABLE', 'Countries');
  now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  ({ loadCountryRecords: load } = await import('../lib/country-records'));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('completed country-directory cache', () => {
  it('reuses only a complete list and never caches Airtable page responses', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ records: [row('recA')], offset: 'cursor' })).mockResolvedValueOnce(json({ records: [row('recB')] }));
    vi.stubGlobal('fetch', fetch);
    const first = await load();
    expect(await load()).toEqual(first); expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of fetch.mock.calls) { expect(options.cache).toBe('no-store'); expect(options).not.toHaveProperty('next'); }
    first[0].name = 'caller mutation';
    expect((await load())[0].name).toBe('recA');
  });

  it('refreshes an aged list from page one without reusing a cached expired cursor', async () => {
    // Simulate a framework HTTP cache retaining page one after its cursor expires.
    // A correct loader opts out of that cache and obtains a new cursor on refresh.
    const fetch = vi.fn(async (input: string, init: RequestInit) => {
      const offset = new URL(input).searchParams.get('offset');
      const aged = now > 300_000;
      if (!offset) {
        const stale = aged && init.cache === 'force-cache';
        return json({ records: [row(aged && !stale ? 'recFresh' : 'recOld')], offset: aged && !stale ? 'new-cursor' : 'old-cursor' });
      }
      if (offset === 'old-cursor' && aged) return expired();
      return json({ records: [row(offset === 'new-cursor' ? 'recFreshLast' : 'recOldLast')] });
    });
    vi.stubGlobal('fetch', fetch);
    expect((await load()).map(row => row.id)).toEqual(['recOld', 'recOldLast']);
    now += 300_001;
    expect((await load()).map(row => row.id)).toEqual(['recFresh', 'recFreshLast']);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(new URL(fetch.mock.calls[2][0]).searchParams.has('offset')).toBe(false);
  });

  it('restarts once on an invalidated cursor and discards all records from the abandoned traversal', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ records: [row('recAbandoned')], offset: 'expired' })).mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json({ records: [row('recFresh')], offset: 'fresh' })).mockResolvedValueOnce(json({ records: [row('recLast')] }));
    vi.stubGlobal('fetch', fetch);
    expect((await load()).map(row => row.id)).toEqual(['recFresh', 'recLast']);
    expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get('offset'))).toEqual([null, 'expired', null, 'fresh']);
    expect((await load()).map(row => row.id)).toEqual(['recFresh', 'recLast']); expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('bounds cursor recovery and never caches a failed or partial traversal', async () => {
    const fetch = vi.fn(async (input: string) => new URL(input).searchParams.has('offset') ? expired() : json({ records: [row('recPartial')], offset: 'expired' }));
    vi.stubGlobal('fetch', fetch);
    await expect(load()).rejects.toThrow('LIST_RECORDS_ITERATOR_NOT_AVAILABLE'); expect(fetch).toHaveBeenCalledTimes(4);
    fetch.mockResolvedValueOnce(json({ records: [row('recRecovered')] }));
    expect((await load()).map(row => row.id)).toEqual(['recRecovered']);
    expect(new URL(fetch.mock.calls[4][0]).searchParams.has('offset')).toBe(false);
  });

  it('does not restart for an unrelated 422 or expose its response message', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ records: [], offset: 'next' })).mockResolvedValueOnce(json({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'private upstream detail' } }, 422));
    vi.stubGlobal('fetch', fetch);
    const error = await load().catch(error => error);
    expect(error.message).toContain('UNKNOWN_FIELD_NAME'); expect(JSON.stringify({ message: error.message, cause: error.cause })).not.toContain('private upstream detail');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails a refresh rather than serving an expired snapshot, then allows a fresh retry', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ records: [row('recOld')] }))
      .mockResolvedValueOnce(json({ records: [row('recPartial')], offset: 'next' })).mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ records: [row('recRecovered')] }));
    vi.stubGlobal('fetch', fetch); await load(); now += 300_001;
    await expect(load()).rejects.toThrow('(503');
    expect((await load()).map(row => row.id)).toEqual(['recRecovered']);
  });

  it('shares an in-flight full traversal between concurrent submissions', async () => {
    let release!: (value: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; })).mockResolvedValueOnce(json({ records: [row('recLast')] }));
    vi.stubGlobal('fetch', fetch);
    const first = load(); const second = load(); expect(fetch).toHaveBeenCalledTimes(1);
    release(json({ records: [row('recFirst')], offset: 'next' }));
    const results = await Promise.all([first, second]);
    expect(results[0]).toEqual(results[1]); expect(results[0]).toHaveLength(2); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shares each configuration refresh when A, B and A overlap, including after B completes', async () => {
    const releases: Array<{ config: string; finish: () => void }> = [];
    const fetch = vi.fn((_input: string, init: RequestInit) => {
      const config = (init.headers as Record<string, string>).Authorization;
      return new Promise<Response>(resolve => {
        releases.push({ config, finish: () => resolve(json({ records: [row(config === 'Bearer test-token' ? 'recA' : 'recB')] })) });
      });
    });
    vi.stubGlobal('fetch', fetch);
    const firstA = load();
    vi.stubEnv('AIRTABLE_TOKEN', 'config-b'); const firstB = load();
    vi.stubEnv('AIRTABLE_TOKEN', 'test-token'); const secondA = load();
    releases.filter(release => release.config === 'Bearer config-b').forEach(release => release.finish());
    expect((await firstB)[0].id).toBe('recB');
    const thirdA = load();
    releases.filter(release => release.config === 'Bearer test-token').forEach(release => release.finish());
    const results = await Promise.all([firstA, secondA, thirdA]);
    expect(results.map(records => records[0].id)).toEqual(['recA', 'recA', 'recA']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('bypasses the snapshot for live schema checks without replacing it', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ records: [row('recCached')] })).mockResolvedValueOnce(json({ records: [row('recLive')] }));
    vi.stubGlobal('fetch', fetch);
    await load(); expect((await load({ cache: false }))[0].id).toBe('recLive');
    expect((await load())[0].id).toBe('recCached'); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_COUNTRIES_TABLE'])('isolates snapshots when %s changes', async variable => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ records: [row('recOriginal')] })).mockResolvedValueOnce(json({ records: [row('recOther')] }));
    vi.stubGlobal('fetch', fetch); await load(); vi.stubEnv(variable, 'other-config');
    expect((await load())[0].id).toBe('recOther'); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
