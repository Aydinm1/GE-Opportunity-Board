import type { TorDocument } from './types';

export function normalizeDocumentUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeTorDocuments(jobId: string, value: unknown): TorDocument[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
        !/^att[A-Za-z0-9]+$/.test(item.id) || seen.has(item.id) || !normalizeDocumentUrl(item.url)) return [];
    seen.add(item.id);
    return [{
      id: item.id,
      filename: typeof item.filename === 'string' && item.filename.trim() ? item.filename.trim() : null,
      href: `/api/jobs/${encodeURIComponent(jobId)}/tor/${encodeURIComponent(item.id)}`,
    }];
  });
}

export function getTorLinks(job: { torDocuments?: TorDocument[]; torUrl?: string | null }) {
  if (job.torDocuments?.length) return job.torDocuments.map((document) => ({
    key: document.id,
    href: document.href,
    label: document.filename || 'View TOR',
    download: true,
  }));
  const url = normalizeDocumentUrl(job.torUrl);
  return url ? [{ key: 'tor-link', href: url, label: 'View TOR', download: false }] : [];
}
