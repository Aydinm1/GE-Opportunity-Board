import React, { useState, useRef, useEffect } from 'react';
import { Job } from '../types';
import { DEFAULT_PARENT_PAGE_URL, HOST_ORIGIN } from '../constants';
import { isTrustedParentMessage, parseTrustedRedirectUrl } from '../lib/message-security';
import { requestIframeResize } from '../lib/request-iframe-resize';
import { splitBullets, formatStartDate, statusVariant } from '../lib/utils';
import { useScrollBoundaryTransfer } from '../lib/useScrollBoundaryTransfer';
import ApplyView, { ApplyDraft } from './ApplyView';

interface JobDetailsProps {
    job: Job;
    initialViewMode?: 'details' | 'apply';
    isEmbedded?: boolean;
    isMobile?: boolean;
    onBackToList?: () => void;
}

const JobDetails: React.FC<JobDetailsProps> = ({ job, initialViewMode = 'details', isEmbedded = false, isMobile = false, onBackToList }) => {
    const [viewMode, setViewMode] = useState<'details' | 'apply'>(() => {
        if (initialViewMode === 'apply') return 'apply';
        if (typeof window === 'undefined') return 'details';
        const params = new URLSearchParams(window.location.search);
        return params.get('view') === 'apply' ? 'apply' : 'details';
    });
    const [copied, setCopied] = useState(false);
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const detailsScrollRef = useRef<HTMLDivElement | null>(null);
    const scrollPositionsRef = useRef<Record<string, number>>({});
    const applyDraftsRef = useRef<Record<string, ApplyDraft>>({});
    const previousJobIdRef = useRef<string>(job.id);
    const previousViewJobIdRef = useRef<string>(job.id);
    const usesFixedDetailsPane = !isMobile;
    const usesDetailsPaneScroll = !isMobile;
    useScrollBoundaryTransfer(detailsScrollRef, usesDetailsPaneScroll && !isEmbedded);

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!usesDetailsPaneScroll) return;
        const el = detailsScrollRef.current;
        if (!el) return;

        const previousJobId = previousJobIdRef.current;
        if (previousJobId && previousJobId !== job.id) {
            scrollPositionsRef.current[previousJobId] = el.scrollTop;
        }

        const nextTop = scrollPositionsRef.current[job.id] ?? 0;
        requestAnimationFrame(() => {
            const activeEl = detailsScrollRef.current;
            if (activeEl) activeEl.scrollTop = nextTop;
        });
        previousJobIdRef.current = job.id;
    }, [job.id, usesDetailsPaneScroll]);

    useEffect(() => {
        if (previousViewJobIdRef.current !== job.id) {
            setViewMode('details');
        }
        previousViewJobIdRef.current = job.id;
    }, [job.id]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        url.searchParams.set('job', job.id);
        if (viewMode === 'apply') {
            url.searchParams.set('view', 'apply');
        } else {
            url.searchParams.delete('view');
        }
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }, [job.id, viewMode]);

    useEffect(() => {
        if (!usesDetailsPaneScroll) return;
        const el = detailsScrollRef.current;
        if (!el) return;
        const onScroll = () => {
            scrollPositionsRef.current[job.id] = el.scrollTop;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
        };
    }, [job.id, usesDetailsPaneScroll]);

    useEffect(() => {
        if (!isEmbedded || typeof window === 'undefined') return;

        requestIframeResize();
        const frameId = window.requestAnimationFrame(requestIframeResize);
        const timeoutId = window.setTimeout(requestIframeResize, 180);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timeoutId);
        };
    }, [isEmbedded, job.id, viewMode]);

    const inIframe = typeof window !== 'undefined' && window.parent !== window;
    const fallbackShareBaseUrl = () => (inIframe ? DEFAULT_PARENT_PAGE_URL : window.location.href);

    // Resolve the host URL for share links.
    // Strategy: trusted referrer -> trusted postMessage response from parent.
    const resolveParentUrl = async (timeout = 1000): Promise<string> => {
        // 1) referrer - only trust configured host origin
        if (document.referrer) {
            const refUrl = parseTrustedRedirectUrl(document.referrer, HOST_ORIGIN);
            if (refUrl && refUrl.pathname && refUrl.pathname !== '/') {
                return refUrl.toString();
            }
        }

        if (!inIframe) {
            return fallbackShareBaseUrl();
        }

        // 2) ask parent via postMessage, retrying if parent returns only the origin root
        const tries = 2;
        const retryDelay = 150; // ms
        for (let attempt = 0; attempt < tries; attempt++) {
            const url = await new Promise<URL | null>((resolve) => {
                const id = Math.random().toString(36).slice(2);
                let resolved = false;
                let timeoutId: ReturnType<typeof setTimeout>;
                function onMsg(e: MessageEvent) {
                    if (!isTrustedParentMessage(e, HOST_ORIGIN)) return;
                    const data = e.data && typeof e.data === 'object'
                        ? e.data as { type?: unknown; id?: unknown; url?: unknown }
                        : null;
                    if (!data || data.type !== 'opportunityboard:parent-url' || data.id !== id) return;
                    const parsed = parseTrustedRedirectUrl(data.url, HOST_ORIGIN);
                    if (!parsed) return;
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);
                    window.removeEventListener('message', onMsg);
                    resolve(parsed);
                }
                window.addEventListener('message', onMsg);
                try {
                    window.parent.postMessage({ type: 'opportunityboard:get-parent-url', id }, HOST_ORIGIN);
                } catch (e) {
                    // ignore
                }
                timeoutId = setTimeout(() => {
                    if (resolved) return;
                    resolved = true;
                    window.removeEventListener('message', onMsg);
                    resolve(null);
                }, timeout);
            });

            if (url && url.pathname && url.pathname !== '/' && url.href !== window.location.href) {
                return url.toString();
            }

            // if we only got the origin, wait and retry
            await new Promise((r) => setTimeout(r, retryDelay));
        }

        // final fallback
        const fallbackUrl = fallbackShareBaseUrl();
        return fallbackUrl;
    };

    // Ask parent to copy text to clipboard on our behalf (cross-origin fallback)
    const copyViaParent = async (text: string, timeout = 1500): Promise<boolean> => {
        if (!inIframe) return false;
        return await new Promise((resolve) => {
            const id = Math.random().toString(36).slice(2);
            function onMsg(e: MessageEvent) {
                if (!isTrustedParentMessage(e, HOST_ORIGIN)) return;
                const data = e.data && typeof e.data === 'object'
                    ? e.data as { type?: unknown; id?: unknown; ok?: unknown }
                    : null;
                if (!data || data.type !== 'opportunityboard:copy-result' || data.id !== id) return;
                window.removeEventListener('message', onMsg);
                resolve(Boolean(data.ok));
            }
            window.addEventListener('message', onMsg);
            try {
                window.parent.postMessage({ type: 'opportunityboard:copy', id, text }, HOST_ORIGIN);
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
    const locationValue = showSpecificLocation ? job.locationBase : job.workType;
    const formattedStartDate = formatStartDate(job.startDate ?? undefined);
    const commitmentValue = job.durationCategory && job.durationCategory !== 'TBD'
        ? `${job.durationCategory} Months`
        : job.durationCategory || null;
    const metaItems = [
        {
            label: 'Location',
            icon: job.workType === 'Virtual' ? 'laptop' : 'place',
            value: locationValue,
            helper: showSpecificLocation ? job.workType : null,
        },
        {
            label: 'Start Date',
            icon: 'event',
            value: formattedStartDate || null,
        },
        {
            label: 'Commitment',
            icon: 'update',
            value: commitmentValue,
        },
        {
            label: 'Weekly Time',
            icon: 'schedule',
            value: job.timeCommitment || null,
        },
    ].filter((item) => item.value);
    const handleShare = async () => {
        const parentHref = await resolveParentUrl(500);
        let link = '';
        try {
            const u = parseTrustedRedirectUrl(parentHref, HOST_ORIGIN) ?? new URL(fallbackShareBaseUrl());
            u.searchParams.delete('job');
            u.searchParams.set('job', job.id);
            link = u.toString();
        } catch (e) {
            const fallback = new URL(fallbackShareBaseUrl());
            fallback.searchParams.delete('job');
            fallback.searchParams.set('job', job.id);
            link = fallback.toString();
        }

        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
                return;
            } catch (e) {
                // Clipboard API blocked (permissions policy) or failed - try parent copy.
            }
        }

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
    };
    const sectionHeadingClasses = isMobile
        ? 'mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 font-display'
        : 'mb-3.5 border-b border-gray-100 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:border-gray-800 dark:text-gray-400 font-display';
    const bodyTextClasses = isMobile
        ? 'text-[1rem] leading-[1.68] text-slate-600'
        : 'leading-relaxed text-gray-600 dark:text-gray-300';
    const bulletListClasses = isMobile
        ? 'list-none space-y-4 pl-0 text-slate-600'
        : 'list-none space-y-3.5 pl-0 text-gray-600 dark:text-gray-300';

    return (
        <div className={`flex flex-col min-h-0 ${usesFixedDetailsPane ? 'h-full' : ''} ${usesDetailsPaneScroll ? 'overflow-hidden' : 'overflow-visible'}`}>
            {viewMode === 'apply' ? (
                <ApplyView
                    job={job}
                    isEmbedded={isEmbedded}
                    isMobile={isMobile}
                    initialDraft={applyDraftsRef.current[job.id]}
                    onDraftChange={(draft) => {
                        applyDraftsRef.current[job.id] = draft;
                    }}
                    onBackToDetails={() => setViewMode('details')}
                />
            ) : isMobile ? (
                <>
                    <div className="mb-4 flex items-center justify-between gap-3">
                        {onBackToList ? (
                            <button
                                type="button"
                                onClick={onBackToList}
                                className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-gray-500 transition-colors hover:text-primary"
                            >
                                <span className="material-icons-round text-base">arrow_back</span>
                                Results
                            </button>
                        ) : <div />}
                        <button
                            type="button"
                            onClick={handleShare}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-primary shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-colors hover:border-primary/15 hover:bg-primary/5 hover:text-primary-hover active:border-primary/15 active:bg-primary/10 focus-visible:border-primary/15 focus-visible:bg-primary/5"
                            aria-label={copied ? 'Link copied' : 'Share job'}
                        >
                            <span className="material-icons-round text-[18px]">{copied ? 'check' : 'share'}</span>
                        </button>
                    </div>

                    <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_22px_52px_rgba(15,23,42,0.08)] ring-1 ring-slate-100/80">
                        <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.03),transparent_42%),linear-gradient(180deg,#ffffff_0%,#fbfcfd_100%)] px-5 pb-5 pt-5">
                            {(job.programmeArea || job.teamVertical) && (
                                <div className="mb-4 space-y-1.5">
                                    {job.programmeArea && (
                                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{job.programmeArea}</p>
                                    )}
                                    {job.teamVertical && (
                                        <p className="text-[13px] font-medium leading-snug text-slate-500">{job.teamVertical}</p>
                                    )}
                                </div>
                            )}
                            <h1 className="pr-4 text-[1.72rem] font-bold leading-[1.02] tracking-[-0.035em] text-slate-950 font-display">
                                {job.roleTitle}
                            </h1>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className={getStatusStyles(job.roleStatus || 'Actively Hiring')}>
                                    {job.roleStatus || 'Actively Hiring'}
                                </span>
                                {job.roleType && (
                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600">
                                        {job.roleType}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setViewMode('apply')}
                                className="mt-5 w-full rounded-[1.15rem] bg-primary px-5 py-3.5 text-[13px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_16px_30px_rgba(0,85,140,0.22)] transition-all active:scale-[0.99]"
                            >
                                Apply Now
                            </button>
                        </div>

                        <div ref={detailsScrollRef} className="overflow-visible px-5 pb-6 pt-5">
                            {metaItems.length > 0 && (
                                <div className={`mb-6 grid ${metaItems.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                                    {metaItems.map((item) => (
                                        <div
                                            key={item.label}
                                            className="min-w-0 rounded-[1.15rem] border border-slate-100 bg-white px-3.5 py-3.5 shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                                        >
                                            <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-primary shadow-[inset_0_0_0_1px_rgba(0,85,140,0.08)]">
                                                <span className="material-icons-round text-[18px]">{item.icon}</span>
                                            </div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                                            <p className="mt-1 text-[0.98rem] font-semibold leading-[1.28] text-slate-900">
                                                {item.value}
                                            </p>
                                            {item.helper && (
                                                <p className="mt-1 text-[11px] font-medium leading-[1.3] text-slate-400">{item.helper}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="max-w-none font-body">
                                {job.purposeShort && (
                                    <div className="pb-6">
                                        <h3 className={sectionHeadingClasses}>Role Overview</h3>
                                        <p className={bodyTextClasses}>{job.purposeShort}</p>
                                    </div>
                                )}

                                {job.keyResponsibilities.length > 0 && (
                                    <div className={`${job.purposeShort ? 'border-t border-slate-100 pt-5' : 'pt-0'} pb-6`}>
                                        <h3 className={sectionHeadingClasses}>Key Responsibilities</h3>
                                        <ul className={bulletListClasses}>
                                            {job.keyResponsibilities.map((resp, idx) => (
                                                <li key={idx} className="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-x-4">
                                                    <span className="mt-[0.72rem] h-2 w-2 rounded-full bg-primary"></span>
                                                    <span className={bodyTextClasses}>{resp}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {requiredQualifications.length > 0 && (
                                    <div className="border-t border-slate-100 py-6">
                                        <h3 className={sectionHeadingClasses}>Required Qualifications</h3>
                                        <ul className={bulletListClasses}>
                                            {requiredQualifications.map((req, idx) => (
                                                <li key={idx} className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-x-3">
                                                    <span className="material-icons-round mt-[0.28rem] text-[18px] text-green-600">check_circle</span>
                                                    <span className={bodyTextClasses}>{req}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {preferredQualifications.length > 0 && (
                                    <div className="border-t border-slate-100 py-6">
                                        <h3 className={sectionHeadingClasses}>Preferred Qualifications</h3>
                                        <ul className={bulletListClasses}>
                                            {preferredQualifications.map((req, idx) => (
                                                <li key={idx} className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-x-3">
                                                    <span className="material-icons-round mt-[0.28rem] text-[18px] text-primary/60">star</span>
                                                    <span className={bodyTextClasses}>{req}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {job.languagesRequired.length > 0 && (
                                    <div className="border-t border-slate-100 pt-6">
                                        <h3 className={sectionHeadingClasses}>Languages Required</h3>
                                        <div className="flex flex-wrap gap-2.5">
                                            {job.languagesRequired.map((lang, idx) => (
                                                <span key={idx} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                                                    {lang}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className="mb-6">
                        <div className="flex flex-col gap-3.5 md:flex-row md:items-start md:justify-between">
                            <div className="flex-1">
                                <h1 className="mb-2.5 text-2xl font-bold leading-[1.03] text-black dark:text-white font-display">{job.roleTitle}</h1>
                                <div className="mb-3 flex items-center gap-2">
                                    {job.teamVertical && (
                                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">{job.teamVertical}</p>
                                    )}
                                    {job.teamVertical && job.programmeArea && (
                                        <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                                    )}
                                    {job.programmeArea && (
                                        <p className="text-xs font-bold uppercase tracking-widest text-primary">{job.programmeArea}</p>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={getStatusStyles(job.roleStatus || 'Actively Hiring')}>
                                        {job.roleStatus || 'Actively Hiring'}
                                    </span>
                                    {job.roleType && (
                                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                            {job.roleType}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                <button type="button" onClick={handleShare} aria-label="Share job" className="inline-flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 sm:w-auto">
                                    {copied ? 'Copied!' : 'Share'}
                                </button>
                                <button type="button" onClick={() => setViewMode('apply')} className="w-full whitespace-nowrap rounded-lg bg-primary px-6 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-white shadow-lg shadow-blue-900/10 transition-all transform active:scale-95 font-body hover:bg-primary-hover sm:w-auto sm:text-sm sm:tracking-wide">
                                    Apply Now
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mb-4 h-px w-full bg-gray-100 dark:bg-gray-800"></div>

                    <div ref={detailsScrollRef} className={`${usesDetailsPaneScroll ? 'flex-1 min-h-0 overflow-y-scroll pr-2' : 'overflow-visible pb-4 pr-0'}`}>
                        {metaItems.length > 0 && (
                            <div className="mb-8 grid grid-cols-2 gap-x-6 gap-y-4">
                                {metaItems.map((item) => (
                                    <div key={item.label} className="min-w-0 border-b border-slate-100 pb-3.5 dark:border-gray-800/80">
                                        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-gray-400">{item.label}</p>
                                        {item.helper ? (
                                            <div className="grid grid-cols-[17px_minmax(0,1fr)] items-start gap-x-2.5 gap-y-0.5">
                                                <span className="material-icons-round row-span-2 shrink-0 pt-0.5 text-[17px] leading-none text-primary/80">{item.icon}</span>
                                                <span className="block text-[1rem] font-semibold leading-[1.24] text-slate-900 dark:text-white">
                                                    {item.value}
                                                </span>
                                                <span className="col-start-2 text-[11px] font-medium leading-none text-slate-400 dark:text-gray-500">{item.helper}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2.5">
                                                <span className="material-icons-round shrink-0 text-[17px] leading-none text-primary/80">{item.icon}</span>
                                                <span className="block text-[1rem] font-semibold leading-[1.24] text-slate-900 dark:text-white">
                                                    {item.value}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none font-body">
                            {job.purposeShort && (
                                <div className="mb-8">
                                    <h3 className={sectionHeadingClasses}>Role Overview</h3>
                                    <p className={bodyTextClasses}>{job.purposeShort}</p>
                                </div>
                            )}

                            {job.keyResponsibilities.length > 0 && (
                                <div className="mb-8">
                                    <h3 className={sectionHeadingClasses}>Key Responsibilities</h3>
                                    <ul className={bulletListClasses}>
                                        {job.keyResponsibilities.map((resp, idx) => (
                                            <li key={idx} className="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-x-4">
                                                <span className="mt-[0.72rem] h-2 w-2 rounded-full bg-primary"></span>
                                                <span className={bodyTextClasses}>{resp}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {requiredQualifications.length > 0 && (
                                <div className="mb-8">
                                    <h3 className={sectionHeadingClasses}>Required Qualifications</h3>
                                    <ul className={bulletListClasses}>
                                        {requiredQualifications.map((req, idx) => (
                                            <li key={idx} className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-x-3">
                                                <span className="material-icons-round mt-[0.28rem] text-[18px] text-green-600 dark:text-green-400">check_circle</span>
                                                <span className={bodyTextClasses}>{req}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {preferredQualifications.length > 0 && (
                                <div className="mb-8">
                                    <h3 className={sectionHeadingClasses}>Preferred Qualifications</h3>
                                    <ul className={bulletListClasses}>
                                        {preferredQualifications.map((req, idx) => (
                                            <li key={idx} className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-x-3">
                                                <span className="material-icons-round mt-[0.28rem] text-[18px] text-primary/60">star</span>
                                                <span className={bodyTextClasses}>{req}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {job.languagesRequired.length > 0 && (
                                <div className="mb-6">
                                    <h3 className={sectionHeadingClasses}>Languages Required</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {job.languagesRequired.map((lang, idx) => (
                                            <span key={idx} className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                                {lang}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default JobDetails;
