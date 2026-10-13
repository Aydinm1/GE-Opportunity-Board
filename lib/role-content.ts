import { splitBullets } from './utils';

// These are instructions for role authors, not applicant qualifications.
export function normalizeQualificationItems(selected: string[], custom?: string | null): string[] {
  const seen = new Set<string>();
  return [...selected, ...splitBullets(custom)].flatMap((value) => {
    const item = value.trim();
    if (/^other\s*(?:\(\s*please\s+specify(?:\s+below)?\s*\))?\.?$/i.test(item)) return [];
    const cleaned = item.replace(/\s*\.?\s*Specify (?:below|in Question \d+)\.?\s*$/i, '').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) return [];
    seen.add(key);
    return [cleaned];
  });
}

export function getRoleLocation(locationBase?: string | null, workType?: string | null) {
  const location = locationBase?.trim() || null;
  const mode = workType?.trim() || null;
  return {
    value: location || mode,
    helper: location && mode && location.toLowerCase() !== mode.toLowerCase() ? mode : null,
  };
}
