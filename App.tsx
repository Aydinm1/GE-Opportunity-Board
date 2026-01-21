'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Job } from './types';
import JobCard from './components/JobCard';
import JobDetails from './components/JobDetails';

const App: React.FC = () => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
        programmeArea: [],
        teamVertical: [],
        workType: [],
        roleStatus: [],
        durationCategory: [],
        timeCommitment: [],
    });
    const [showMobileList, setShowMobileList] = useState(true);
    const filtersRowRef = useRef<HTMLDivElement | null>(null);
    const optionsPanelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const fetchJobs = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/jobs');
                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    const msg = text || `Failed to fetch jobs (status ${response.status})`;
                    throw new Error(msg);
                }
                const data = await response.json();
                setJobs(data.jobs || []);
                if (data.jobs && data.jobs.length > 0) {
                    setSelectedJobId(data.jobs[0].id);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
                console.error('Error fetching jobs:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchJobs();
    }, []);

    const filteredJobs = useMemo(() => {
        const q = searchQuery.toLowerCase();
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
                if (key === 'roleStatus') return vals.includes((job as any).roleStatus || '');
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
    }, [jobs, searchQuery, selectedFilters]);

    const selectedJob = useMemo(() => {
        if (!selectedJobId) return null;
        return jobs.find(j => j.id === selectedJobId) || jobs[0] || null;
    }, [jobs, selectedJobId]);

    const filters = [
        { id: 'programmeArea', label: 'Programme Area' },
        { id: 'teamVertical', label: 'Functional Area' },
        { id: 'workType', label: 'Type' },
        //{ id: 'roleStatus', label: 'Role Status' },
        { id: 'durationCategory', label: 'Project Duration' },
        { id: 'timeCommitment', label: 'Weekly Time Commitment' },
    ];

     type FilterOption = string | { value: string; label: string };

    const durationBuckets: { value: string; label: string }[] = [
        { value: '0–3', label: '0–3 months' },
        { value: '3–6', label: '3–6 months' },
        { value: '6–9', label: '6–9 months' },
        { value: '9–12', label: '9–12 months' },
        { value: '12+', label: '12+ months' },
        { value: 'TBD', label: 'TBD' },
    ];
    const timeCommitmentBuckets = [
        '1-10 hours',
        '10-20 hours',
        '20-30 hours',
        '30-40 hours',
        '40+ hours',
    ];

    const fieldOptions = useMemo(() => {
        const opts: Record<string, Set<string>> = {
            programmeArea: new Set(),
            teamVertical: new Set(),
            workType: new Set(),
            roleStatus: new Set(),
            durationCategory: new Set(),
            timeCommitment: new Set(),
        };
        jobs.forEach(j => {
            if (j.programmeArea) opts.programmeArea.add(j.programmeArea);
            if (j.teamVertical) opts.teamVertical.add(j.teamVertical);
            if (j.workType) opts.workType.add(j.workType);
            const rs = (j as any).roleStatus;
            if (rs) opts.roleStatus.add(rs);
            if (j.durationCategory) opts.durationCategory.add(j.durationCategory);
            if (j.timeCommitment) opts.timeCommitment.add(j.timeCommitment);
        });
        // Ensure required base options always show, then append any extras (alphabetized)
        const mergeWithBase = (base: string[], set: Set<string>) => {
            const extras = Array.from(set).filter(v => !base.includes(v)).sort();
            return [...base, ...extras];
        };

         const mergeDuration = (base: { value: string; label: string }[], set: Set<string>) => {
            const seen = new Set(base.map(b => b.value));
            const extras = Array.from(set)
                .filter(v => !seen.has(v))
                .sort()
                .map(v => ({ value: v, label: v }));
            return [...base, ...extras];
        };
        
        const mapped = Object.fromEntries(
            Object.entries(opts).map(([k, s]) => {
                if (k === 'durationCategory') return [k, mergeDuration(durationBuckets, s)];
                if (k === 'timeCommitment') return [k, mergeWithBase(timeCommitmentBuckets, s)];
                return [k, Array.from(s).sort()];
            })
        );
        return mapped;
    }, [jobs]);

    const getOptionLabel = (filterId: string, val: string) => {
        const opts = (fieldOptions as any)[filterId] as FilterOption[] | undefined;
        if (!opts) return val;
        for (const opt of opts) {
            if (typeof opt === 'string') {
                if (opt === val) return opt;
            } else {
                if (opt.value === val) return opt.label;
            }
        }
        return val;
    };

    const sortSelectedValues = (filterId: string, vals: string[]) => {
        if (!vals || vals.length <= 1) return vals;
        if (filterId === 'durationCategory') {
            const order = durationBuckets.map(b => b.value);
            return vals.slice().sort((a, b) => {
                const ia = order.indexOf(a);
                const ib = order.indexOf(b);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return a.localeCompare(b);
            });
        }
        if (filterId === 'timeCommitment') {
            const order = timeCommitmentBuckets;
            return vals.slice().sort((a, b) => {
                const ia = order.indexOf(a);
                const ib = order.indexOf(b);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return a.localeCompare(b);
            });
        }
        return vals;
    };

    // Close filter panel when clicking outside of filter controls
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (activeFilter === null) return;
            if (optionsPanelRef.current && optionsPanelRef.current.contains(target)) return;
            if (filtersRowRef.current && filtersRowRef.current.contains(target)) return;
            setActiveFilter(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeFilter]);

    const clearAllFilters = () => {
        setSelectedFilters({
            programmeArea: [],
            teamVertical: [],
            workType: [],
            roleStatus: [],
            durationCategory: [],
            timeCommitment: [],
        });
        setActiveFilter(null);
    };

    const anyFilterSelected = Object.values(selectedFilters).some(arr => Array.isArray(arr) && arr.length > 0);


    return (
        <div className="min-h-screen flex flex-col">
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
                className="relative pt-10 pb-24 sm:pt-12 sm:pb-32 px-4 sm:px-6 lg:px-8 shadow-lg bg-[#00558C]"
                style={{
                    backgroundImage: "url('/img/pattern.png')",
                    backgroundRepeat: 'repeat',
                    backgroundSize: '700px auto',
                }}
            >
                <div className="max-w-6xl mx-auto flex flex-col items-center relative z-10">
                    <div className="w-full max-w-3xl text-center text-white mb-6">
                         <h1 className="text-3xl sm:text-4xl font-bold font-display leading-tight">Opportunity Board</h1>
                        <p className="text-base sm:text-lg font-semibold mt-2 text-white/85">Find your next role today</p>
                    </div>
                    <div className="w-full max-w-3xl group mb-6">
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                                <span className="material-icons-round text-gray-400 group-focus-within:text-primary text-xl">search</span>
                            </div>
                            <input 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="block w-full pl-12 pr-4 sm:pr-28 py-3 sm:py-4 rounded-xl border-none shadow-xl bg-white text-sm sm:text-base font-body placeholder-gray-500 text-black focus:ring-4 focus:ring-blue-500/30 transition-all" 
                                placeholder="Job title, keywords, location" 
                                type="text"
                            />
                            <button className="hidden sm:flex absolute right-2 top-2 bottom-2 bg-primary hover:bg-primary-hover text-white px-6 rounded-lg text-sm font-semibold font-body uppercase tracking-wider transition-colors shadow-sm items-center justify-center">
                                Search
                            </button>
                        </div>
                        <button className="mt-3 w-full sm:hidden bg-primary hover:bg-primary-hover text-white px-4 py-3 rounded-lg text-sm font-semibold font-body uppercase tracking-wider transition-colors shadow-sm">
                            Search
                        </button>
                    </div>
                    <div ref={filtersRowRef} className="w-full flex flex-wrap justify-center gap-2 px-2">
                        {filters.map((f) => {
                            const selectedValues = selectedFilters[f.id] || [];
                            const sortedValues = sortSelectedValues(f.id, selectedValues);
                            const selectedText = (sortedValues && sortedValues.length > 0)
                                ? (sortedValues.length <= 2
                                    ? sortedValues.map(v => getOptionLabel(f.id, v)).join(', ')
                                    : `${f.label} (${sortedValues.length})`)
                                : f.label;
                            const isActive = activeFilter === f.id;
                            const isSelected = selectedValues && selectedValues.length > 0;
                            const onState = isActive || isSelected;
                            return (
                                <button 
                                    key={f.id}
                                    onClick={() => setActiveFilter(isActive ? null : f.id)}
                                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium font-body shadow-sm transition-all flex items-center gap-1 border border-transparent whitespace-nowrap ${
                                        onState
                                        ? 'bg-primary text-white'
                                        : 'bg-white hover:bg-gray-50 text-gray-700 hover:border-gray-200'
                                    }`}
                                >
                                    {selectedText}
                                    <span className={`material-icons-round text-[16px] transition-transform ${isActive ? 'rotate-180' : ''} ${onState ? 'text-white/70' : 'text-gray-400'}`}>
                                        expand_more
                                    </span>
                                </button>
                            );
                        })}
                        {anyFilterSelected && (
                            <button
                                onClick={clearAllFilters}
                                className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium font-body shadow-sm transition-colors flex items-center gap-1 border border-transparent whitespace-nowrap bg-gray-600 hover:bg-gray-800 text-white"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                    {activeFilter && (fieldOptions as any)[activeFilter] && (
                        <div className="w-full flex justify-center mt-3">
                            <div ref={optionsPanelRef} className="bg-white dark:bg-gray-900 rounded-lg shadow p-3 inline-flex gap-2 flex-wrap justify-center w-fit mx-auto">
                                <button
                                    onClick={() => { setSelectedFilters({ ...selectedFilters, [activeFilter]: [] }); }}
                                    className={`px-3 py-1 rounded text-sm bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 whitespace-nowrap`}
                                >
                                    All
                                </button>
                                {((fieldOptions as any)[activeFilter] as FilterOption[]).map((opt: FilterOption) => {
                                    const value = typeof opt === 'string' ? opt : opt.value;
                                    const label = typeof opt === 'string' ? opt : opt.label;
                                    const currently = selectedFilters[activeFilter] || [];
                                    const isPicked = Array.isArray(currently) && currently.includes(value);
                                    return (
                                    <button
                                        key={value}
                                        onClick={() => {
                                            const curr = selectedFilters[activeFilter] || [];
                                            const next = curr.includes(value) ? curr.filter(v => v !== value) : [...curr, value];
                                            setSelectedFilters({ ...selectedFilters, [activeFilter]: next });
                                        }}
                                        className={`px-3 py-1 rounded text-sm border whitespace-nowrap ${isPicked ? 'bg-primary text-white border-transparent' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-100'}`}
                                    >
                                        {label}
                                    </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <main className="-mt-20 relative z-20 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full flex-1">
                <div className="bg-surface-light dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden p-4 sm:p-6 min-h-[600px] flex flex-col md:block">
                    <div className="flex items-center justify-between mb-3 lg:hidden">
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            Jobs ({filteredJobs.length})
                        </div>
                        <button
                            onClick={() => setShowMobileList(!showMobileList)}
                            className="text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            {showMobileList ? 'Hide list' : 'Show list'}
                        </button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start h-full">
                        {/* Sidebar */}
                        <div className={`lg:col-span-4 flex flex-col gap-4 h-full ${showMobileList ? '' : 'hidden lg:flex'}`}>
                            <div className="pb-2 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center mb-2">
                                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 font-display">
                                    {filteredJobs.length} Positions Available
                                </h2>
                            </div>
                            <div className="flex flex-col gap-4 overflow-y-auto lg:max-h-[800px] pr-1 sm:pr-2 scrollbar-hide">
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
                                            isSelected={selectedJobId === job.id}
                                            onClick={() => {
                                                setSelectedJobId(job.id);
                                                window.scrollTo({ top: 400, behavior: 'smooth' });
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
                        <div className="lg:col-span-8 border-t border-gray-100 dark:border-gray-800 lg:border-t-0 lg:border-l pl-0 lg:pl-6 pt-4 lg:pt-0 h-full min-h-[500px]">
                            {loading ? (
                                <div className="h-full flex items-center justify-center text-gray-400">
                                    Loading job details...
                                </div>
                            ) : selectedJob ? (
                                <JobDetails job={selectedJob} />
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
            <div className="h-20 lg:hidden"></div>
        </div>
    );
};

export default App;
