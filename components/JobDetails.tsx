import React, { useState, useRef, useEffect } from 'react';
import { Job } from '../types';
import { HOST_ORIGIN } from '../constants';
import { splitBullets, formatStartDate, statusVariant } from '../lib/utils';
import ApplyModal from './ApplyModal';

interface JobDetailsProps {
    job: Job;
}

const JobDetails: React.FC<JobDetailsProps> = ({ job }) => {
    const [showApply, setShowApply] = useState(false);
    const [copied, setCopied] = useState(false);
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
    }, []);

    // Resolve the host/parent URL for share links.
    // Strategy: try same-origin parent access -> document.referrer (if has path) -> postMessage request to parent
    const resolveParentUrl = async (timeout = 1000): Promise<string> => {
        // 1) same-origin access
        try {
            if (window.parent && window.parent.location && window.parent.location.href) {
                console.log('[resolveParentUrl] same-origin access succeeded:', window.parent.location.href);
                return window.parent.location.href;
            }
        } catch (e) {
            // cross-origin - continue to fallbacks
            console.log('[resolveParentUrl] same-origin access failed (cross-origin)');
        }

        // 2) referrer - only use if it has a meaningful path (some sites strip path via Referrer-Policy)
        console.log('[resolveParentUrl] document.referrer:', document.referrer);
        if (document.referrer) {
            try {
                const refUrl = new URL(document.referrer);
                console.log('[resolveParentUrl] referrer pathname:', refUrl.pathname);
                // Only return referrer if it has a path beyond '/' (not stripped by Referrer-Policy: origin)
                if (refUrl.pathname && refUrl.pathname !== '/') {
                    console.log('[resolveParentUrl] using referrer (has path):', document.referrer);
                    return document.referrer;
                }
                console.log('[resolveParentUrl] referrer has no path, falling through to postMessage');
            } catch (e) {
                // Invalid URL, continue to postMessage fallback
                console.log('[resolveParentUrl] referrer URL parse failed:', e);
            }
        }

        // 3) ask parent via postMessage, retrying if parent returns only the origin root
        console.log('[resolveParentUrl] trying postMessage to parent');
        const tries = 2;
        const retryDelay = 150; // ms
        for (let attempt = 0; attempt < tries; attempt++) {
            console.log('[resolveParentUrl] postMessage attempt', attempt + 1);
            const url = await new Promise<string>((resolve) => {
                const id = Math.random().toString(36).slice(2);
                function onMsg(e: MessageEvent) {
                    if (!e.data || e.data.type !== 'opportunityboard:parent-url' || e.data.id !== id) return;
                    window.removeEventListener('message', onMsg);
                    console.log('[resolveParentUrl] received parent-url response:', e.data.url);
                    resolve(e.data.url || window.location.href);
                }
                window.addEventListener('message', onMsg);
                try {
                    try { window.parent.postMessage({ type: 'opportunityboard:get-parent-url', id }, HOST_ORIGIN); }
                    catch (err) { try { window.parent.postMessage({ type: 'opportunityboard:get-parent-url', id }, '*'); } catch {} }
                } catch (e) {
                    // ignore
                }
                setTimeout(() => { window.removeEventListener('message', onMsg); console.log('[resolveParentUrl] postMessage timeout, using fallback'); resolve(window.location.href); }, timeout);
            });

            try {
                const parsed = new URL(url);
                if (parsed.pathname && parsed.pathname !== '/') {
                    console.log('[resolveParentUrl] got valid URL with path:', url);
                    return url;
                }
            } catch (e) {
                return url;
            }

            // if we only got the origin, wait and retry
            await new Promise((r) => setTimeout(r, retryDelay));
        }

        // final fallback
        console.log('[resolveParentUrl] all attempts failed, using window.location.href');
        return window.location.href;
    };

    // Ask parent to copy text to clipboard on our behalf (cross-origin fallback)
    const copyViaParent = async (text: string, timeout = 1500): Promise<boolean> => {
        return await new Promise((resolve) => {
            const id = Math.random().toString(36).slice(2);
            function onMsg(e: MessageEvent) {
                if (!e.data || e.data.type !== 'opportunityboard:copy-result' || e.data.id !== id) return;
                window.removeEventListener('message', onMsg);
                resolve(Boolean(e.data.ok));
            }
            window.addEventListener('message', onMsg);
            try {
                try { window.parent.postMessage({ type: 'opportunityboard:copy', id, text }, HOST_ORIGIN); }
                catch (err) { try { window.parent.postMessage({ type: 'opportunityboard:copy', id, text }, '*'); } catch {} }
            } catch (err) {
                window.removeEventListener('message', onMsg);
                resolve(false);
                return;
            }
            setTimeout(() => { window.removeEventListener('message', onMsg); resolve(false); }, timeout);
        });
    };
    const otherQualifications = splitBullets(job.otherQualifications);
    const requiredQualifications = otherQualifications.length
        ? [...job.requiredQualifications, ...otherQualifications]
        : job.requiredQualifications;

    const additionalQualifications = splitBullets(job.additionalQualifications);
    const normalizedPreferred = job.preferredQualifications
        .map((pref) => pref.trim())
        .filter(Boolean);
    const hasOtherPreferredSelection = normalizedPreferred.some(
        (pref) => pref.toLowerCase() === 'other (please specify below)'
    );
    const preferredQualifications =
        hasOtherPreferredSelection && additionalQualifications.length
            ? normalizedPreferred.filter((pref) => pref.toLowerCase() !== 'other (please specify below)')
            : normalizedPreferred;
    if ((hasOtherPreferredSelection || additionalQualifications.length) && additionalQualifications.length) {
        preferredQualifications.push(...additionalQualifications);
    }
    const showSpecificLocation = (
        job.workType === 'In-Person' ||
        job.workType === 'Hybrid' ||
        job.workType === 'Onsite' ||
        job.workType === 'On-site'
    ) && job.locationBase;
    const getStatusStyles = (status: string | null) => statusVariant(status).details;

    return (
        <>
        <div className="h-full flex flex-col">
            <div className="mb-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-black dark:text-white leading-tight mb-1 font-display">{job.roleTitle}</h1>
                        <div className="flex items-center gap-2 mb-3">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{job.teamVertical}</p>
                            <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                            <p className="text-xs font-bold text-primary uppercase tracking-widest">{job.programmeArea}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={getStatusStyles(job.roleStatus || 'Actively Hiring')}>
                                {job.roleStatus || 'Actively Hiring'}
                            </span>
                            {job.roleType && (
                                <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700">
                                    {job.roleType}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={async () => {
                                try { console.log('Share clicked', job.id); } catch (e) {}
                                try { if (window.parent) { try { window.parent.postMessage({ type: 'opportunityboard:child-click-share', id: job.id }, HOST_ORIGIN); } catch (err) { try { window.parent.postMessage({ type: 'opportunityboard:child-click-share', id: job.id }, '*'); } catch {} } } } catch (e) {}
                            // Resolve parent URL (prefers full URL when available) then build share link
                            const parentHref = await resolveParentUrl(500);
                            console.log('[Share] resolveParentUrl returned:', parentHref);
                            let link = '';
                            try {
                                const u = new URL(parentHref);
                                console.log('[Share] parsed URL pathname:', u.pathname);
                                // If parentHref has a path beyond '/', append query param to that URL
                                if (u.pathname && u.pathname !== '/') {
                                    link = `${parentHref}${parentHref.includes('?') ? '&' : '?'}job=${job.id}`;
                                } else {
                                    // fallback to origin root with query
                                    link = `${u.origin}/?job=${job.id}`;
                                }
                            } catch (e) {
                                // fallback to current origin
                                link = `${window.location.origin}/?job=${job.id}`;
                            }
                            console.log('[Share] final link:', link);

                            // Debug: report resolved parent href and link to host
                            try {
                                if (window.parent) {
                                    try { window.parent.postMessage({ type: 'opportunityboard:child-resolved-parent', id: job.id, parentHref, link }, HOST_ORIGIN); }
                                    catch (err) { try { window.parent.postMessage({ type: 'opportunityboard:child-resolved-parent', id: job.id, parentHref, link }, '*'); } catch {} }
                                }
                            } catch (e) { /* ignore */ }

                            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                                try {
                                    await navigator.clipboard.writeText(link);
                                    setCopied(true);
                                    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                                    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
                                    return;
                                } catch (e) {
                                    // Clipboard API blocked (permissions policy) or failed — try parent copy
                                    console.log('[Share] clipboard.writeText failed:', e);
                                }
                            }

                            // Try asking parent to copy (useful if Clipboard API blocked in iframe)
                            try {
                                const ok = await copyViaParent(link);
                                if (ok) {
                                    setCopied(true);
                                    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                                    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
                                    return;
                                }
                            } catch (e) {
                                // ignore
                            }

                            // Last-resort fallback: textarea + execCommand
                            if (typeof window !== 'undefined') {
                                const el = document.createElement('textarea');
                                el.value = link;
                                document.body.appendChild(el);
                                el.select();
                                try {
                                    document.execCommand('copy');
                                    setCopied(true);
                                    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                                    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
                                } catch (e) {
                                    // ignore
                                }
                                document.body.removeChild(el);
                            }
                        }} aria-label="Share job" className="inline-flex items-center justify-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-primary hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-semibold transition">
                            {copied ? 'Copied!' : 'Share'}
                        </button>

                        <button onClick={() => setShowApply(true)} className="bg-primary hover:bg-primary-hover text-white font-bold py-2.5 px-6 rounded-lg shadow-lg shadow-blue-900/10 transition-all transform active:scale-95 text-sm uppercase tracking-wide font-body whitespace-nowrap">
                            Apply Now
                        </button>
                    </div>
                </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800 w-full mb-6"></div>

            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Location</p>
                        <div className="flex items-center gap-1.5">
                            <span className="material-icons-round text-sm text-primary">
                                {job.workType === 'Virtual' ? 'laptop' : 'place'}
                            </span>
                            <span className="text-xs font-semibold dark:text-white">
                                {showSpecificLocation ? job.locationBase : job.workType}
                                {showSpecificLocation && <span className="text-[10px] text-gray-400 ml-1 font-normal">({job.workType})</span>}
                            </span>
                        </div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Start Date</p>
                        <div className="flex items-center gap-1.5">
                            <span className="material-icons-round text-sm text-primary">event</span>
                            <span className="text-xs font-semibold dark:text-white">{formatStartDate(job.startDate)}</span>
                        </div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Commitment</p>
                        <div className="flex items-center gap-1.5">
                            <span className="material-icons-round text-sm text-primary">update</span>
                            <span className="text-xs font-semibold dark:text-white">
                                {job.durationCategory && job.durationCategory !== 'TBD' ? `${job.durationCategory} Months` : (job.durationCategory || 'TBD')}
                            </span>
                        </div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Weekly Time</p>
                        <div className="flex items-center gap-1.5">
                            <span className="material-icons-round text-sm text-primary">schedule</span>
                            <span className="text-xs font-semibold dark:text-white">{job.timeCommitment}</span>
                        </div>
                    </div>
                </div>

                <div className="prose prose-sm prose-slate dark:prose-invert max-w-none font-body">
                    <div className="mb-8">
                        <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-white tracking-widest mb-3 font-display border-b border-gray-100 dark:border-gray-800 pb-2">Role Overview</h3>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                            {job.purposeShort}
                        </p>
                    </div>

                    <div className="mb-8">
                        <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-white tracking-widest mb-3 font-display border-b border-gray-100 dark:border-gray-800 pb-2">Key Responsibilities</h3>
                        <ul className="space-y-3 list-none pl-0 text-gray-600 dark:text-gray-300">
                            {job.keyResponsibilities.map((resp, idx) => (
                                <li key={idx} className="flex gap-3 items-center">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"></span>
                                    <span>{resp}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="mb-8">
                        <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-white tracking-widest mb-3 font-display border-b border-gray-100 dark:border-gray-800 pb-2">Required Qualifications</h3>
                        <ul className="space-y-3 list-none pl-0 text-gray-600 dark:text-gray-300">
                            {requiredQualifications.map((req, idx) => (
                                <li key={idx} className="flex gap-3 items-center">
                                    <span className="material-icons-round text-green-600 dark:text-green-400 text-base">check_circle</span>
                                    <span>{req}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {preferredQualifications.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-white tracking-widest mb-3 font-display border-b border-gray-100 dark:border-gray-800 pb-2">Preferred Qualifications</h3>
                            <ul className="space-y-3 list-none pl-0 text-gray-600 dark:text-gray-300">
                                {preferredQualifications.map((req, idx) => (
                                    <li key={idx} className="flex gap-3 items-start">
                                        <span className="material-icons-round text-primary/60 text-base">star</span>
                                        <span>{req}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="mb-6">
                        <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-white tracking-widest mb-3 font-display border-b border-gray-100 dark:border-gray-800 pb-2">Languages Required</h3>
                        <div className="flex flex-wrap gap-2">
                            {job.languagesRequired.map((lang, idx) => (
                                <span key={idx} className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                    {lang}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        {showApply && (
            <ApplyModal job={job} onClose={() => setShowApply(false)} />
        )}
        </>
    );
};

export default JobDetails;
