import React from 'react';
import type { Job } from '../types';
import { getTorLinks } from '../lib/tor';

export default function TorSection({ job }: { job: Job }) {
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
              <a href={link.href} target="_blank" rel="noopener noreferrer"
                title={filename || undefined}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white no-underline transition-colors hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                aria-label={`${label}${filename ? `: ${filename}` : ''} (opens in a new tab)`}>
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
