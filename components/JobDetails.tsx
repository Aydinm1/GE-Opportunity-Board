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
    const usesFixedDetailsPane = !isEmbedded || isMobile;
    const usesStandalonePaneScroll = !isMobile && !isEmbedded;
    useScrollBoundaryTransfer(detailsScrollRef, usesStandalonePaneScroll);

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!usesStandalonePaneScroll) return;
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
    }, [job.id, usesStandalonePaneScroll]);

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
        if (!usesStandalonePaneScroll) return;
        const el = detailsScrollRef.current;
        if (!el) return;
        const onScroll = () => {
            scrollPositionsRef.current[job.id] = el.scrollTop;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            el.removeEventListener('scroll', onScroll);
        };
    }, [job.id, usesStandalonePaneScroll]);

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

    return (
        <div className={`flex flex-col min-h-0 ${usesFixedDetailsPane ? 'h-full' : ''} ${usesStandalonePaneScroll ? 'overflow-hidden' : 'overflow-visible'}`}>
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
            ) : (
                <>
                    <div className={isMobile ? 'mb-3' : 'mb-6'}>
                        {isMobile && (
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
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent bg-transparent text-primary transition-colors hover:border-primary/15 hover:bg-primary/5 hover:text-primary-hover active:border-primary/15 active:bg-primary/10 focus-visible:border-primary/15 focus-visible:bg-primary/5"
                                    aria-label={copied ? 'Link copied' : 'Share job'}
                                >
                                    <span className="material-icons-round text-[18px]">{copied ? 'check' : 'share'}</span>
                                </button>
                            </div>
                        )}
                        <div className="flex flex-col gap-3.5 md:flex-row md:items-start md:justify-between">
                            <div className="flex-1">
                                <h1 className={`${isMobile ? 'pr-4 text-[1.56rem] tracking-[-0.03em]' : 'text-2xl'} mb-2.5 font-bold leading-[1.03] text-black dark:text-white font-display`}>{job.roleTitle}</h1>
                                {isMobile ? (
                                    <div className="mb-3.5 space-y-1">
                                        {job.programmeArea && (
                                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{job.programmeArea}</p>
                                        )}
                                        {job.teamVertical && (
                                            <p className="text-[13px] font-medium text-gray-500">{job.teamVertical}</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 mb-3">
                                        {job.teamVertical && (
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{job.teamVertical}</p>
                                        )}
                                        {job.teamVertical && job.programmeArea && (
                                            <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                                        )}
                                        {job.programmeArea && (
                                            <p className="text-xs font-bold text-primary uppercase tracking-widest">{job.programmeArea}</p>
                                        )}
                                    </div>
                                )}
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
                                {isMobile && (
                                    <button type="button" onClick={() => setViewMode('apply')} className="mt-4 w-full rounded-xl bg-primary px-5 py-3 text-[13px] font-bold uppercase tracking-[0.1em] text-white shadow-lg shadow-blue-900/10 transition-all active:scale-[0.99]">
                                        Apply Now
                                    </button>
                                )}
                            </div>
                            {!isMobile && (
                                <div className="flex gap-3 flex-col sm:flex-row sm:items-center">
                                    <button type="button" onClick={handleShare} aria-label="Share job" className="inline-flex w-full sm:w-auto items-center justify-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-primary hover:bg-gray-50 px-4 py-2.5 rounded-lg text-sm font-semibold transition">
                                        {copied ? 'Copied!' : 'Share'}
                                    </button>
                                    <button type="button" onClick={() => setViewMode('apply')} className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-6 rounded-lg shadow-lg shadow-blue-900/10 transition-all transform active:scale-95 text-[13px] uppercase tracking-[0.14em] font-body whitespace-nowrap sm:text-sm sm:tracking-wide">
                                        Apply Now
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {!isMobile && <div className="mb-4 h-px w-full bg-gray-100 dark:bg-gray-800"></div>}

                    <div ref={detailsScrollRef} className={`${usesStandalonePaneScroll ? 'flex-1 min-h-0 overflow-y-scroll pr-2' : 'overflow-visible pb-4 pr-0'}`}>
                        {metaItems.length > 0 && (
                            isMobile ? (
                                <div className="mb-8 rounded-[1.25rem] border border-gray-100 bg-gray-50 px-4 py-2 shadow-[0_8px_22px_rgba(15,23,42,0.035)] dark:border-gray-800 dark:bg-gray-900/50">
                                    <div className="divide-y divide-gray-200/80 dark:divide-gray-800">
                                        {metaItems.map((item, index) => (
                                            <div
                                                key={item.label}
                                                className={`flex items-center gap-3 py-3 ${index === 0 ? 'pt-2.5' : ''}`}
                                            >
                                                <span className="material-icons-round text-[1.45rem] text-primary">{item.icon}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">{item.label}</p>
                                                    <p className="mt-0.5 text-[0.94rem] font-semibold leading-snug text-gray-900 dark:text-white">
                                                        {item.value}
                                                        {item.helper && <span className="ml-1 text-[12px] font-normal text-gray-400">({item.helper})</span>}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                                    {metaItems.map((item) => (
                                        <div key={item.label} className="rounded-[1.1rem] border border-gray-100 bg-gray-50 p-2.5 dark:border-gray-800 dark:bg-gray-900/50">
                                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">{item.label}</p>
                                            <div className="flex items-start gap-2">
                                                <span className="material-icons-round text-base text-primary">{item.icon}</span>
                                                <span className="text-sm font-semibold leading-snug dark:text-white">
                                                    {item.value}
                                                    {item.helper && <span className="ml-1 text-[11px] font-normal text-gray-400">({item.helper})</span>}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none font-body">
                            {job.purposeShort && (
                                <div className={isMobile ? 'mb-8' : 'mb-8'}>
                                    <h3 className={`${isMobile ? 'mb-3 text-[10px] tracking-[0.12em] text-gray-500' : 'mb-3.5 border-b border-gray-100 pb-2 text-[11px] tracking-[0.18em] text-gray-500 dark:border-gray-800 dark:text-gray-400'} font-bold uppercase font-display`}>Role Overview</h3>
                                    <p className="leading-relaxed text-gray-600 dark:text-gray-300">
                                    {job.purposeShort}
                                    </p>
                                </div>
                            )}

                            {job.keyResponsibilities.length > 0 && (
                                <div className={isMobile ? 'mb-8' : 'mb-8'}>
                                    <h3 className={`${isMobile ? 'mb-3 text-[10px] tracking-[0.12em] text-gray-500' : 'mb-3.5 border-b border-gray-100 pb-2 text-[11px] tracking-[0.18em] text-gray-500 dark:border-gray-800 dark:text-gray-400'} font-bold uppercase font-display`}>Key Responsibilities</h3>
                                    <ul className="list-none space-y-3.5 pl-0 text-gray-600 dark:text-gray-300">
                                    {job.keyResponsibilities.map((resp, idx) => (
                                            <li key={idx} className="flex items-start gap-3">
                                            <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"></span>
                                                <span className="leading-relaxed">{resp}</span>
                                        </li>
                                    ))}
                                    </ul>
                                </div>
                            )}

                            {requiredQualifications.length > 0 && (
                                <div className={isMobile ? 'mb-8' : 'mb-8'}>
                                    <h3 className={`${isMobile ? 'mb-3 text-[10px] tracking-[0.12em] text-gray-500' : 'mb-3.5 border-b border-gray-100 pb-2 text-[11px] tracking-[0.18em] text-gray-500 dark:border-gray-800 dark:text-gray-400'} font-bold uppercase font-display`}>Required Qualifications</h3>
                                    <ul className="list-none space-y-3.5 pl-0 text-gray-600 dark:text-gray-300">
                                    {requiredQualifications.map((req, idx) => (
                                            <li key={idx} className="flex items-start gap-3">
                                            <span className="material-icons-round text-green-600 dark:text-green-400 text-base">check_circle</span>
                                                <span className="leading-relaxed">{req}</span>
                                        </li>
                                    ))}
                                    </ul>
                                </div>
                            )}

                            {preferredQualifications.length > 0 && (
                                <div className={isMobile ? 'mb-8' : 'mb-8'}>
                                    <h3 className={`${isMobile ? 'mb-3 text-[10px] tracking-[0.12em] text-gray-500' : 'mb-3.5 border-b border-gray-100 pb-2 text-[11px] tracking-[0.18em] text-gray-500 dark:border-gray-800 dark:text-gray-400'} font-bold uppercase font-display`}>Preferred Qualifications</h3>
                                    <ul className="list-none space-y-3.5 pl-0 text-gray-600 dark:text-gray-300">
                                        {preferredQualifications.map((req, idx) => (
                                            <li key={idx} className="flex items-start gap-3">
                                                <span className="material-icons-round text-primary/60 text-base">star</span>
                                                <span className="leading-relaxed">{req}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {job.languagesRequired.length > 0 && (
                                <div className="mb-6">
                                    <h3 className={`${isMobile ? 'mb-3 text-[10px] tracking-[0.12em] text-gray-500' : 'mb-3.5 border-b border-gray-100 pb-2 text-[11px] tracking-[0.18em] text-gray-500 dark:border-gray-800 dark:text-gray-400'} font-bold uppercase font-display`}>Languages Required</h3>
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
