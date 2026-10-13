import React, { useState } from 'react';
import type { Job } from '../types';
import { getTorLinks } from '../lib/tor';
import { parseErrorResponseMessage } from '../lib/utils';

export default function TorSection({ job }: { job: Job }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<{ jobId: string; message: string } | null>(null);
  const links = getTorLinks(job);
  if (!links.length) return null;
  return (
    <div className="not-prose mb-6">
      <ul className="m-0 list-none space-y-2 p-0">
        {links.map((link, index) => {
          const label = `View Terms of Reference (TOR)${links.length > 1 ? ` ${index + 1}` : ''}`;
          const filename = link.label !== 'View TOR' ? link.label : null;
          return (
            <li key={link.key}>
              <a href={link.href} target={link.download ? undefined : '_blank'} rel="noopener noreferrer"
                download={link.download ? filename || 'TOR' : undefined}
                aria-disabled={link.download && downloading !== null ? true : undefined}
                onClick={async (event) => {
                  if (!link.download) return;
                  event.preventDefault();
                  if (downloading) return;
                  setDownloading(link.key);
                  setError(null);
                  try {
                    const response = await fetch(link.href, { cache: 'no-store' });
                    if (!response.ok) throw new Error(parseErrorResponseMessage(await response.text(), 'Could not download the TOR. Please try again.'));
                    const blob = await response.blob();
                    const encodedName = response.headers.get('content-disposition')?.match(/filename\*=UTF-8\'\'([^;]+)/i)?.[1];
                    let downloadName = filename || 'TOR';
                    if (encodedName) {
                      try { downloadName = decodeURIComponent(encodedName); } catch { /* Use the displayed filename. */ }
                    }
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = downloadName;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
                  } catch (error) {
                    setError({ jobId: job.id, message: error instanceof Error ? error.message : 'Could not download the TOR. Please try again.' });
                  } finally {
                    setDownloading(null);
                  }
                }}
                title={filename || undefined}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white no-underline transition-colors hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                aria-label={`${label}${filename ? `: ${filename}` : ''} ${link.download ? '(downloads a file)' : '(opens in a new tab)'}`}>
                {downloading === link.key ? 'Downloading…' : label}
              </a>
            </li>
          );
        })}
      </ul>
      {error?.jobId === job.id && <p role="alert" className="mt-2 text-sm text-red-600">{error.message}</p>}
    </div>
  );
}
