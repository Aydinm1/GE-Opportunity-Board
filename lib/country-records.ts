import { createHash } from 'node:crypto';

export const COUNTRY_DIRECTORY_TABLE = 'Country / Jurisdiction Table';
export const COUNTRY_DIRECTORY_NAME_FIELD = 'Name';
export const COUNTRY_DIRECTORY_JURISDICTION_FIELD = 'Jurisdiction';
export const CURRENT_COUNTRY_FIELD = 'Country of Living (Current Location)';
export type CountryRecord = { id: string; name: string; jurisdiction?: string };
export type CountryResolution = { kind: 'resolved'; id: string } | { kind: 'missing' | 'ambiguous' };

export function normalizeCountryName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function matchCountryRecord(name: string, records: readonly CountryRecord[]): CountryResolution {
  const normalized = normalizeCountryName(name);
  const matches = records.filter(record => normalizeCountryName(record.name) === normalized);
  if (matches.length === 1) return { kind: 'resolved', id: matches[0].id };
  if (matches.length === 0) return { kind: 'missing' };
  // Existing duplicates include unassigned rows. Use an assigned row only when
  // it is unique; never pick an arbitrary duplicate or create directory records.
  const assigned = matches.filter(record => record.jurisdiction?.trim());
  return assigned.length === 1 ? { kind: 'resolved', id: assigned[0].id } : { kind: 'ambiguous' };
}

const DIRECTORY_CACHE_TTL_MS = 5 * 60 * 1000;
let snapshot: { key: string; records: CountryRecord[]; expiresAt: number } | undefined;
const pending = new Map<string, Promise<CountryRecord[]>>();

export async function loadCountryRecords({ cache = true }: { cache?: boolean } = {}): Promise<CountryRecord[]> {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_COUNTRIES_TABLE || COUNTRY_DIRECTORY_TABLE;
  if (!token || !baseId) throw new Error('Missing Airtable country directory configuration');
  if (!cache) return readCountryRecords(token, baseId, table);

  // Cache a completed directory, never the page responses containing temporary cursors.
  // Keep one snapshot per process; a cold start simply reads a fresh directory.
  const key = createHash('sha256').update(JSON.stringify([token, baseId, table])).digest('hex');
  const copy = (records: CountryRecord[]) => records.map(record => ({ ...record }));
  if (snapshot?.key === key && snapshot.expiresAt > Date.now()) return copy(snapshot.records);
  const inFlight = pending.get(key);
  if (inFlight) return copy(await inFlight);
  const request = readCountryRecords(token, baseId, table).then(records => {
    snapshot = { key, records, expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS };
    return records;
  }).finally(() => {
    pending.delete(key);
  });
  pending.set(key, request);
  return copy(await request);
}

async function readCountryRecords(token: string, baseId: string, table: string): Promise<CountryRecord[]> {
  const records: CountryRecord[] = [];
  const seen = new Set<string>();
  let offset: string | undefined;
  let cursorRestarts = 0;
  while (true) {
    const query = new URLSearchParams({ pageSize: '100' });
    query.append('fields[]', COUNTRY_DIRECTORY_NAME_FIELD);
    query.append('fields[]', COUNTRY_DIRECTORY_JURISDICTION_FIELD);
    if (offset) query.set('offset', offset);
    let response: Response;
    try {
      response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    } catch {
      throw new Error('Airtable country directory request failed');
    }
    if (!response.ok) {
      let airtableErrorType = 'UNKNOWN_ERROR';
      try {
        const type = (await response.json())?.error?.type;
        if (typeof type === 'string' && /^[A-Z_]{1,80}$/.test(type)) airtableErrorType = type;
      } catch { /* Never include private upstream response text. */ }
      if (offset && response.status === 422 && airtableErrorType === 'LIST_RECORDS_ITERATOR_NOT_AVAILABLE' && cursorRestarts === 0) {
        cursorRestarts++;
        records.length = 0;
        seen.clear();
        offset = undefined;
        continue;
      }
      const error = new Error(`Airtable country directory request failed (${response.status}; ${airtableErrorType})`);
      error.cause = { operation: 'country_directory_read', status: response.status, airtableErrorType };
      throw error;
    }
    let page: { records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string };
    try { page = await response.json(); } catch { throw new Error('Invalid Airtable country directory response'); }
    if (!page || !Array.isArray(page.records)) throw new Error('Invalid Airtable country directory records');
    for (const record of page.records) {
      if (!record || typeof record !== 'object' || Array.isArray(record) || !record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)) {
        throw new Error('Invalid Airtable country directory record');
      }
      const name = record.fields[COUNTRY_DIRECTORY_NAME_FIELD];
      const jurisdiction = record.fields?.[COUNTRY_DIRECTORY_JURISDICTION_FIELD];
      if (!/^rec[A-Za-z0-9]+$/.test(record.id)) throw new Error('Invalid Airtable country directory record');
      if (name === undefined || (typeof name === 'string' && !name.trim())) continue;
      if (typeof name !== 'string') throw new Error('Invalid Airtable country directory record');
      if (jurisdiction !== undefined && typeof jurisdiction !== 'string') throw new Error('Invalid Airtable country jurisdiction');
      records.push({ id: record.id, name, jurisdiction: typeof jurisdiction === 'string' ? jurisdiction : undefined });
    }
    if (page.offset === undefined) return records;
    if (typeof page.offset !== 'string' || !page.offset || seen.has(page.offset)) throw new Error('Invalid Airtable country directory pagination');
    offset = page.offset;
    seen.add(offset);
  }
}

export async function resolveCountryRecord(name: string): Promise<CountryResolution> {
  return matchCountryRecord(name, await loadCountryRecords());
}
