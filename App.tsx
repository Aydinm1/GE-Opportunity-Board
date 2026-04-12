'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Job, FilterOptions } from './types';
import { HOST_ORIGIN } from './constants';
import JobCard from './components/JobCard';
import JobDetails from './components/JobDetails';
import Filters from './components/Filters';
import { JOBS_LOAD_ERROR_MESSAGE, loadJobs, type RequestError } from './lib/jobs-load';
import { captureClientException } from './lib/monitoring';
import { isTrustedParentMessage, parseTrustedRedirectUrl } from './lib/message-security';
import { requestIframeResize } from './lib/request-iframe-resize';
import { useScrollBoundaryTransfer } from './lib/useScrollBoundaryTransfer';

type InitialParentParams = {
    jobParam: string | null;
    viewParam: string | null;
};

// Helper to get initial params from parent URL (for iframe embedding)
const getInitialParamsFromParentUrl = async (timeout = 500): Promise<InitialParentParams> => {
    // First check our own URL
    if (typeof window !== 'undefined') {
        const ownParams = new URLSearchParams(window.location.search);
        const ownJob = ownParams.get('job');
        const ownView = ownParams.get('view');
        if (ownJob || ownView) return { jobParam: ownJob, viewParam: ownView };
    }

    // Check document.referrer from our trusted host origin only
    if (document.referrer) {
        const refUrl = parseTrustedRedirectUrl(document.referrer, HOST_ORIGIN);
        if (refUrl) {
            const refJob = refUrl.searchParams.get('job');
            const refView = refUrl.searchParams.get('view');
            if (refJob || refView) return { jobParam: refJob, viewParam: refView };
        }
    }

    if (typeof window === 'undefined' || window.parent === window) {
        return { jobParam: null, viewParam: null };
    }

    // Ask parent via postMessage
    return new Promise((resolve) => {
        const id = Math.random().toString(36).slice(2);
        let resolved = false;
        let timeoutId: ReturnType<typeof setTimeout>;
        function onMsg(e: MessageEvent) {
            if (!isTrustedParentMessage(e, HOST_ORIGIN)) return;
            const data = e.data && typeof e.data === 'object'
                ? e.data as { type?: unknown; id?: unknown; url?: unknown }
                : null;
            if (!data || data.type !== 'opportunityboard:parent-url' || data.id !== id) return;
            const parentUrl = parseTrustedRedirectUrl(data.url, HOST_ORIGIN);
            if (!parentUrl) return;
            if (resolved) return;
            resolved = true;
            clearTimeout(timeoutId);
            window.removeEventListener('message', onMsg);
            resolve({
                jobParam: parentUrl.searchParams.get('job'),
                viewParam: parentUrl.searchParams.get('view'),
            });
        }
        window.addEventListener('message', onMsg);
        try {
            window.parent.postMessage({ type: 'opportunityboard:get-parent-url', id }, HOST_ORIGIN);
        } catch {
            // ignore
        }
        timeoutId = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            window.removeEventListener('message', onMsg);
            resolve({ jobParam: null, viewParam: null });
        }, timeout);
    });
};

function App() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
    const [showSentryTestButton, setShowSentryTestButton] = useState(false);
    const [sentryTestSent, setSentryTestSent] = useState(false);
    const [sentryServerTestResult, setSentryServerTestResult] = useState<string | null>(null);
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [initialViewMode, setInitialViewMode] = useState<'details' | 'apply'>('details');
    const [initialViewRequestId, setInitialViewRequestId] = useState(0);
    const [selectedFilters, setSelectedFilters] = useState<FilterOptions>({
        programmeArea: [],
        teamVertical: [],
        workType: [],
        roleType: [],
        durationCategory: [],
        timeCommitment: [],
    });
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [mobileScreen, setMobileScreen] = useState<'list' | 'details'>('list');
    const [isEmbedded, setIsEmbedded] = useState(false);
    const mobileListScrollRef = useRef<HTMLDivElement | null>(null);

    useScrollBoundaryTransfer(mobileListScrollRef, !isMobileViewport && !isEmbedded);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setIsEmbedded(window.parent !== window);
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const smokeTestsEnabled = process.env.NEXT_PUBLIC_ENABLE_SENTRY_SMOKE_TESTS === 'true';
            setShowSentryTestButton(smokeTestsEnabled && params.get('sentry-test') === '1');
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mediaQuery = window.matchMedia('(max-width: 1023px)');
        const syncViewport = (event?: MediaQueryListEvent) => {
            setIsMobileViewport(event ? event.matches : mediaQuery.matches);
        };

        syncViewport();
        mediaQuery.addEventListener('change', syncViewport);
        return () => mediaQuery.removeEventListener('change', syncViewport);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const fetchJobs = async () => {
            const parentParamsPromise = getInitialParamsFromParentUrl(500).catch(() => ({
                jobParam: null,
                viewParam: null,
            }));

            try {
                setLoading(true);

                const loadedJobs = await loadJobs();
                if (cancelled) return;
                setJobs(loadedJobs);
                if (loadedJobs.length > 0) {
                    setSelectedJobId(loadedJobs[0].id);
                }
                setLoading(false);

                const { jobParam, viewParam } = await parentParamsPromise;
                if (cancelled) return;

                const resolvedInitialView = viewParam === 'apply' ? 'apply' : 'details';
                setInitialViewMode(resolvedInitialView);
                setInitialViewRequestId((current) => current + 1);

                if (loadedJobs.length > 0) {
                    if (jobParam && loadedJobs.find((j: Job) => j.id === jobParam)) {
                        setSelectedJobId(jobParam);
                        setMobileScreen('details');
                    } else if (viewParam === 'apply') {
                        setMobileScreen('details');
                    }
                }
            } catch (err) {
                if (cancelled) return;
                const requestError = err as RequestError;
                if (
                    err instanceof TypeError ||
                    (typeof requestError?.status === 'number' && requestError.status >= 500)
                ) {
                    captureClientException(err, {
                        endpoint: requestError.endpoint || '/api/jobs',
                        operation: 'jobs_fetch',
                        status: requestError.status,
                    });
                }
                setError(requestError.userMessage || (err instanceof Error ? err.message : JOBS_LOAD_ERROR_MESSAGE));
                console.error('Error fetching jobs:', err);
            } finally {
                if (cancelled) return;
                setLoading(false);
            }
        };

        fetchJobs();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const trimmedQuery = searchInput.trim();
        if (trimmedQuery === '') {
            setAppliedSearchQuery('');
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setAppliedSearchQuery(trimmedQuery);
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [searchInput]);

    const handleSearchSubmit = () => {
        setAppliedSearchQuery(searchInput.trim());
        if (isMobileViewport) {
            setMobileScreen('list');
        }
    };
    const scrollMobileViewportToTop = () => {
        if (typeof window === 'undefined') return;
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    };

    const filteredJobs = useMemo(() => {
        const q = appliedSearchQuery.toLowerCase();
        let res = jobs.filter(job =>
            job.roleTitle.toLowerCase().includes(q) ||
            (job.teamVertical || '').toLowerCase().includes(q) ||
            (job.programmeArea || '').toLowerCase().includes(q) ||
            (job.purposeShort || '').toLowerCase().includes(q) ||
            (job.locationBase || '').toLowerCase().includes(q)
        );

        // apply selected filters (support multiple selections per filter)
        Object.entries(selectedFilters).forEach(([key, vals]) => {
            if (!Array.isArray(vals) || vals.length === 0) return;
            res = res.filter(job => {
                const fieldVal = ((job as any)[key] || '') as string;
                if (!fieldVal) return false;
                if (key === 'roleType') return vals.includes((job as any).roleType || '');
                return vals.includes(fieldVal);
            });
        });

        // always sort by start date (soonest first)
        const toTime = (d?: string | null) => {
            if (!d) return Infinity;
            const t = Date.parse(d);
            return Number.isNaN(t) ? Infinity : t;
        };
        res = res.slice().sort((a, b) => toTime(a.startDate) - toTime(b.startDate));

        return res;
    }, [appliedSearchQuery, jobs, selectedFilters]);

    useEffect(() => {
        if (loading) return;
        if (filteredJobs.length === 0) {
            if (selectedJobId !== null) setSelectedJobId(null);
            if (isMobileViewport) setMobileScreen('list');
            return;
        }

        if (!selectedJobId || !filteredJobs.some((job) => job.id === selectedJobId)) {
            setSelectedJobId(filteredJobs[0].id);
        }
    }, [filteredJobs, isMobileViewport, loading, selectedJobId]);

    useEffect(() => {
        if (!isMobileViewport || mobileScreen !== 'details' || typeof window === 'undefined') return;

        scrollMobileViewportToTop();
        const frameId = window.requestAnimationFrame(scrollMobileViewportToTop);
        const timeoutId = window.setTimeout(scrollMobileViewportToTop, 60);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timeoutId);
        };
    }, [isMobileViewport, mobileScreen, selectedJobId]);

    useEffect(() => {
        if (!isEmbedded || typeof window === 'undefined') return;

        requestIframeResize();
        const frameId = window.requestAnimationFrame(requestIframeResize);
        const timeoutId = window.setTimeout(requestIframeResize, 180);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timeoutId);
        };
    }, [error, filteredJobs.length, isEmbedded, isMobileViewport, loading, mobileScreen, selectedFilters, selectedJobId]);

    const selectedJob = useMemo(() => {
        if (!selectedJobId) return null;
        return jobs.find(j => j.id === selectedJobId) || jobs[0] || null;
    }, [jobs, selectedJobId]);
    const isMobileDetailsView = isMobileViewport && mobileScreen === 'details';
    const usesDesktopPaneLayout = !isMobileViewport;
    const usesEmbeddedMobileLayout = isEmbedded && isMobileViewport;

    // Filter UI and helper logic moved to `components/Filters.tsx`.


    return (
        <div id="opportunityboard-root" className="flex flex-col">
            {/* Header */}
            {/* <nav className="bg-white dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 py-4 px-4 sm:px-6 lg:px-8 z-50 relative">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <img
                            src="./img/logo.png"
                            alt="Global Encounters"
                            className="h-10 w-auto object-contain drop-shadow-sm"
                        />
                    </div>
                </div>
            </nav> */}

            {/* Hero / Search Section */}
            {/*. Use pattern again: <div className="relative pattern-bg pt-12 pb-32 px-4 sm:px-6 lg:px-8 shadow-lg">*/}
            <div
                className={`relative px-4 shadow-lg sm:px-6 lg:px-8 bg-[#00558C] ${
                    isMobileDetailsView
                        ? 'hidden sm:block pb-3 pt-[calc(env(safe-area-inset-top)+0.35rem)]'
                        : 'pt-10 pb-24 sm:pt-12 sm:pb-32'
                }`}
                style={{
                    backgroundImage: "url('/img/pattern.png')",
                    backgroundRepeat: 'repeat',
                    backgroundSize: '700px auto',
                }}
            >
                <div className="max-w-6xl mx-auto flex flex-col items-center relative z-10">
                    <div className={`w-full max-w-3xl text-center text-white ${isMobileDetailsView ? 'hidden sm:block mb-2' : 'mb-6'}`}>
                        <h1 className="text-3xl sm:text-4xl font-bold font-display leading-tight">Opportunity Board</h1>
                        <p className="text-base sm:text-lg font-semibold mt-2 text-white/85">Find your next role today</p>
                        {showSentryTestButton && (
                            <div className="mt-4">
                                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            captureClientException(new Error('Sentry client smoke test'), {
                                                operation: 'manual_smoke_test',
                                                endpoint: window.location.pathname,
                                            });
                                            setSentryTestSent(true);
                                        }}
                                        className="inline-flex items-center justify-center rounded-lg border border-white/40 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/20"
                                    >
                                        Send Browser Test Event
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            setSentryServerTestResult(null);
                                            try {
                                                const response = await fetch('/api/sentry-test', { method: 'POST' });
                                                setSentryServerTestResult(`Server smoke test returned ${response.status}. Check Sentry Issues for the event.`);
                                            } catch {
                                                setSentryServerTestResult('Server smoke test request failed before reaching the app.');
                                            }
                                        }}
                                        className="inline-flex items-center justify-center rounded-lg border border-white/40 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/20"
                                    >
                                        Trigger Server Test
                                    </button>
                                </div>
                                {sentryTestSent && (
                                    <p className="mt-2 text-xs font-medium text-white/85">
                                        Browser test event sent. Check Sentry Issues for the result.
                                    </p>
                                )}
                                {sentryServerTestResult && (
                                    <p className="mt-2 text-xs font-medium text-white/85">
                                        {sentryServerTestResult}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                    <div className={`w-full max-w-3xl group mb-6 ${isMobileDetailsView ? 'hidden sm:block' : ''}`}>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                                <span className="material-icons-round text-gray-400 group-focus-within:text-primary text-xl">search</span>
                            </div>
                            <input
                                value={searchInput}
                                onChange={(e) => {
                                    setSearchInput(e.target.value);
                                    if (isMobileViewport && mobileScreen !== 'list') {
                                        setMobileScreen('list');
                                    }
                                }}
                                className="block w-full pl-12 pr-4 sm:pr-28 py-3 sm:py-4 rounded-xl border-none shadow-xl bg-white text-base font-body placeholder-gray-500 text-black focus:ring-4 focus:ring-blue-500/30 transition-all"
                                placeholder="Job title, keywords, location"
                                type="text"
                            />
                            <button onClick={handleSearchSubmit} className="hidden sm:flex absolute right-2 top-2 bottom-2 bg-primary hover:bg-primary-hover text-white px-6 rounded-lg text-sm font-semibold font-body uppercase tracking-wider transition-colors shadow-sm items-center justify-center">
                                Search
                            </button>
                        </div>
                    </div>
                    <div className="hidden lg:block w-full">
                        <Filters jobs={jobs} selectedFilters={selectedFilters} setSelectedFilters={setSelectedFilters} />
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className={`relative z-20 mx-auto flex w-full max-w-7xl flex-1 px-0 pb-12 sm:px-6 lg:px-8 ${isMobileDetailsView ? 'mt-0' : '-mt-20'}`}>
                <div className={`flex w-full flex-col bg-surface-light px-5 pb-10 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] dark:bg-surface-dark sm:rounded-3xl sm:p-6 ${
                    usesEmbeddedMobileLayout ? 'min-h-0' : 'min-h-[520px]'
                } ${
                    usesDesktopPaneLayout
                        ? 'overflow-hidden lg:h-[820px] lg:shadow-2xl'
                        : 'overflow-visible'
                } ${
                    isMobileDetailsView
                        ? 'rounded-none pt-[calc(env(safe-area-inset-top)+1rem)]'
                        : 'rounded-t-[2rem] pt-5'
                }`}>
                    <div className={`grid grid-cols-1 gap-4 sm:gap-6 items-start lg:grid-cols-12 ${usesDesktopPaneLayout ? 'h-full lg:items-stretch' : ''}`}>
                        {/* Sidebar */}
                        <div className={`flex flex-col gap-4 lg:col-span-4 ${usesDesktopPaneLayout ? 'h-full min-h-0' : ''} ${isMobileViewport && mobileScreen !== 'list' ? 'hidden' : ''}`}>
                            <div className="mb-1 border-b border-gray-100 pb-3 dark:border-gray-800">
                                <div className="flex justify-between items-center gap-3">
                                    <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 font-display sm:text-sm sm:tracking-[0.18em]">
                                        {filteredJobs.length} {filteredJobs.length === 1 ? 'Position Available' : 'Positions Available'}
                                    </h2>
                                </div>
                                {isMobileViewport && (
                                    <div className="mt-3">
                                        <Filters
                                            jobs={jobs}
                                            selectedFilters={selectedFilters}
                                            setSelectedFilters={setSelectedFilters}
                                            mobileMode="compact"
                                        />
                                    </div>
                                )}
                            </div>
                            <div ref={mobileListScrollRef} className={`flex flex-col gap-3.5 pr-0 sm:pr-2 lg:pr-2 ${usesDesktopPaneLayout ? 'min-h-0 lg:flex-1 lg:max-h-none lg:overflow-y-scroll' : ''}`}>
                                {loading ? (
                                    <div className="p-8 text-center text-gray-500 font-medium">
                                        Loading jobs...
                                    </div>
                                ) : error ? (
                                    <div className="p-8 text-center text-red-500 font-medium">
                                        Error: {error}
                                    </div>
                                ) : filteredJobs.length > 0 ? (
                                            filteredJobs.map(job => (
                                                <JobCard 
                                                    key={job.id} 
                                                    job={job} 
                                                    isMobile={isMobileViewport}
                                                    isSelected={selectedJobId === job.id}
                                                    onClick={() => {
                                                        if (isMobileViewport) {
                                                            scrollMobileViewportToTop();
                                                        }
                                                        setSelectedJobId(job.id);
                                                        if (isMobileViewport) {
                                                            setMobileScreen('details');
                                                        } else if (!isEmbedded && typeof window !== 'undefined' && window.innerWidth >= 1024) {
                                                            window.scrollTo({ top: 400, behavior: 'smooth' });
                                                        }
                                                    }}
                                                />
                                            ))
                                ) : (
                                    <div className="p-8 text-center text-gray-500 font-medium italic">
                                        No jobs found matching your search.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Detailed View */}
                        <div className={`border-gray-100 pl-0 dark:border-gray-800 lg:col-span-8 lg:border-l lg:pl-6 ${
                            isMobileViewport
                                ? usesEmbeddedMobileLayout
                                    ? 'pt-0 min-h-0'
                                    : 'pt-0 min-h-[360px]'
                                : usesDesktopPaneLayout
                                    ? 'border-t pt-4 h-[72svh] min-h-[420px] overflow-hidden'
                                    : 'border-t pt-4 min-h-[420px]'
                        } ${usesDesktopPaneLayout ? 'lg:h-full lg:min-h-0 lg:overflow-hidden' : ''} lg:border-t-0 lg:pt-0 ${isMobileViewport && mobileScreen !== 'details' ? 'hidden' : ''}`}>
                            {loading ? (
                                <div className="h-full flex items-center justify-center text-gray-400">
                                    Loading job details...
                                </div>
                            ) : selectedJob ? (
                                <JobDetails
                                    job={selectedJob}
                                    initialViewMode={initialViewMode}
                                    initialViewRequestId={initialViewRequestId}
                                    isEmbedded={isEmbedded}
                                    isMobile={isMobileViewport}
                                    onBackToList={isMobileViewport ? () => {
                                        setMobileScreen('list');
                                    } : undefined}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-400">
                                    Select a job to view details
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Mobile Bottom Nav */}
            {/* <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-surface-dark border-t border-gray-200 dark:border-gray-800 pb-safe pt-2 px-6 flex justify-center z-50 lg:hidden shadow-lg">
                <button className="flex flex-col items-center gap-1 text-primary p-2">
                    <span className="material-icons-round">home</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide font-body">Home</span>
                </button>
            </nav>
            */}
        </div>
    );
};

export default App;
