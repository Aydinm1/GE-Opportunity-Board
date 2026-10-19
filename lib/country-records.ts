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

export async function loadCountryRecords({ cache = true }: { cache?: boolean } = {}): Promise<CountryRecord[]> {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_COUNTRIES_TABLE || COUNTRY_DIRECTORY_TABLE;
  if (!token || !baseId) throw new Error('Missing Airtable country directory configuration');
  const records: CountryRecord[] = [];
  const seen = new Set<string>();
  let offset: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: '100' });
    query.append('fields[]', COUNTRY_DIRECTORY_NAME_FIELD);
    query.append('fields[]', COUNTRY_DIRECTORY_JURISDICTION_FIELD);
    if (offset) query.set('offset', offset);
    let response: Response;
    try {
      response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        ...(cache ? { cache: 'force-cache' as const, next: { revalidate: 300, tags: ['country-directory'] } } : { cache: 'no-store' as const }),
      });
    } catch {
      throw new Error('Airtable country directory request failed');
    }
    if (!response.ok) throw new Error(`Airtable country directory request failed (${response.status})`);
    let page: { records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string };
    try { page = await response.json(); } catch { throw new Error('Invalid Airtable country directory response'); }
    if (!Array.isArray(page.records)) throw new Error('Invalid Airtable country directory records');
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
    offset = page.offset;
    if (offset) {
      if (typeof offset !== 'string' || seen.has(offset)) throw new Error('Invalid Airtable country directory pagination');
      seen.add(offset);
    }
  } while (offset);
  return records;
}

export async function resolveCountryRecord(name: string): Promise<CountryResolution> {
  return matchCountryRecord(name, await loadCountryRecords());
}
