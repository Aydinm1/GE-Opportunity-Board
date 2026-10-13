import React from 'react';
import type { Job } from '../types';
import { getTorLinks } from '../lib/tor';

export default function TorSection({ job, headingClassName }: { job: Job; headingClassName: string }) {
  const links = getTorLinks(job);
  if (!links.length) return null;
  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-900">
      <h3 className={headingClassName}>Terms of Reference (TOR)</h3>
      <ul className="not-prose m-0 list-none space-y-2 p-0">
        {links.map((link) => (
          <li key={link.key}>
            <a href={link.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-start gap-2 break-all text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              aria-label={`${link.label} (opens in a new tab)`}>
              <span className="material-icons-round text-base" aria-hidden="true">description</span>
              {link.label}
              <span className="material-icons-round text-base" aria-hidden="true">open_in_new</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
