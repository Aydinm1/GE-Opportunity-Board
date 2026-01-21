export const DURATION_BUCKETS: { value: string; label: string }[] = [
  { value: '0–3', label: '0–3 months' },
  { value: '3–6', label: '3–6 months' },
  { value: '6–9', label: '6–9 months' },
  { value: '9–12', label: '9–12 months' },
  { value: '12+', label: '12+ months' },
  { value: 'TBD', label: 'TBD' },
];

export const TIME_COMMITMENT_BUCKETS = [
  '1-10 hours',
  '10-20 hours',
  '20-30 hours',
  '30-40 hours',
  '40+ hours',
];

export function splitBullets(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-•\d.)\s]+/, '').trim())
    .filter(Boolean);
}

export function parseDurationMonths(v: number | string | undefined): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/(\d+(\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function bucketFromMonths(months: number | null): string {
  if (!months) return 'TBD';
  if (months <= 3) return '0–3';
  if (months <= 6) return '3–6';
  if (months <= 9) return '6–9';
  if (months <= 12) return '9–12';
  return '12+';
}

export function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string') as string[];
  if (typeof v === 'string')
    return v
      .split(/\r?\n|,/g)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

export function asOptionalTrimmedString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}
