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

export function formatStartDate(dateStr?: string) {
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})/);
  if (!m) return dateStr;
  const [, year, month] = m;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const idx = parseInt(month, 10) - 1;
  if (idx < 0 || idx > 11) return year;
  return `${monthNames[idx]} ${year}`;
}

export function statusVariant(status?: string | null) {
  const s = status || 'Actively Hiring';
  switch (s) {
    case 'Actively Hiring':
      return {
        details: 'inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-sky-100 dark:bg-sky-900/30 text-primary dark:text-sky-300 border border-sky-200 dark:border-sky-800/50',
        card: 'bg-sky-100 dark:bg-sky-900/40 text-[#00558C] dark:text-sky-300 border-sky-200 dark:border-sky-800',
      };
    case 'Interviewing':
      return {
        details: 'inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200',
        card: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200',
      };
    case 'Screening Applicants':
      return {
        details: 'inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 border border-indigo-200',
        card: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 border-indigo-200',
      };
    case 'Filled':
    case 'Closed':
      return {
        details: 'inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
        card: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700',
      };
    default:
      return {
        details: 'inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-sky-100 dark:bg-sky-900/30 text-primary dark:text-sky-300 border border-sky-200 dark:border-sky-800/50',
        card: 'bg-sky-100 dark:bg-sky-900/40 text-[#00558C] dark:text-sky-300 border-sky-200 dark:border-sky-800',
      };
  }
}
