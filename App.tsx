'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Job, FilterOptions } from './types';
import JobCard from './components/JobCard';
import JobDetails from './components/JobDetails';
import Filters from './components/Filters';
const App: React.FC = () => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [selectedFilters, setSelectedFilters] = useState<FilterOptions>({
        programmeArea: [],
        teamVertical: [],
        workType: [],
        roleType: [],
        durationCategory: [],
        timeCommitment: [],
    });
    const [showMobileList, setShowMobileList] = useState(true);
    

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
    }, [jobs, searchQuery, selectedFilters]);

    const selectedJob = useMemo(() => {
        if (!selectedJobId) return null;
        return jobs.find(j => j.id === selectedJobId) || jobs[0] || null;
    }, [jobs, selectedJobId]);

    // Filter UI and helper logic moved to `components/Filters.tsx`.


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
                    <Filters jobs={jobs} selectedFilters={selectedFilters} setSelectedFilters={setSelectedFilters} />
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
