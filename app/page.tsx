'use client';
import React, { useEffect, useState, useMemo } from 'react';
import { Job } from './types';
import JobCard from './components/JobCard';
import JobDetails from './components/JobDetails';

const App: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                const res = await fetch('/api/jobs');
                const data = await res.json();
                const nextJobs = (data.jobs ?? []) as Job[];
                if (!mounted) return;
                setJobs(nextJobs);
                if (nextJobs.length > 0) setSelectedJobId((prev) => prev ?? nextJobs[0].id);
            } catch (e) {
                console.error('Failed to load jobs', e);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => {
            mounted = false;
        };
    }, []);

    const filteredJobs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return jobs.filter((job) => {
            if (!q) return true;
            return (
                (job.roleTitle ?? '').toLowerCase().includes(q) ||
                (job.teamVertical ?? '').toLowerCase().includes(q) ||
                (job.programmeArea ?? '').toLowerCase().includes(q) ||
                (job.purposeShort ?? '').toLowerCase().includes(q)
            );
        });
    }, [jobs, searchQuery]);

    const selectedJob = useMemo(() => {
        return jobs.find((j) => j.id === selectedJobId) ?? jobs[0] ?? null;
    }, [jobs, selectedJobId]);

    const filters = [
        { id: 'programmeArea', label: 'Programme Area' },
        { id: 'teamVertical', label: 'Team Vertical' },
        { id: 'roleType', label: 'Role Type' },
        { id: 'workType', label: 'Work Type' },
    ];

    return (
        <div className="min-h-screen flex flex-col">
            {/* Header */}
            <nav className="bg-white dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 py-4 px-4 sm:px-6 lg:px-8 z-50 relative">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <span className="material-icons-round text-primary text-3xl">public</span>
                        <h1 className="text-xl font-display font-bold text-primary tracking-wide uppercase">Global Encounters</h1>
                    </div>
                    <div className="flex items-center">
                         <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Job Portal</span>
                    </div>
                </div>
            </nav>

            {/* Hero / Search Section */}
            <div className="relative pattern-bg pt-12 pb-32 px-4 sm:px-6 lg:px-8 shadow-lg">
                <div className="max-w-4xl mx-auto flex flex-col items-center relative z-10">
                    <div className="w-full max-w-3xl relative group mb-6">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <span className="material-icons-round text-gray-400 group-focus-within:text-primary text-xl">search</span>
                        </div>
                        <input 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="block w-full pl-12 pr-28 py-4 rounded-xl border-none shadow-xl bg-white text-base font-body placeholder-gray-500 text-black focus:ring-4 focus:ring-blue-500/30 transition-all" 
                            placeholder="Job title, keywords, location" 
                            type="text"
                        />
                        <button className="absolute right-2 top-2 bottom-2 bg-primary hover:bg-primary-hover text-white px-6 rounded-lg text-sm font-semibold font-body uppercase tracking-wider transition-colors shadow-sm">
                            Search
                        </button>
                    </div>
                    <div className="w-full flex flex-wrap justify-center gap-2">
                        {filters.map((f) => (
                            <button 
                                key={f.id}
                                onClick={() => setActiveFilter(activeFilter === f.id ? null : f.id)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium font-body shadow-sm transition-all flex items-center gap-1 border border-transparent ${
                                    activeFilter === f.id 
                                    ? 'bg-primary text-white' 
                                    : 'bg-white hover:bg-gray-50 text-gray-700 hover:border-gray-200'
                                }`}
                            >
                                {f.label} 
                                <span className={`material-icons-round text-[16px] transition-transform ${activeFilter === f.id ? 'rotate-180 text-white/70' : 'text-gray-400'}`}>
                                    expand_more
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="-mt-20 relative z-20 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full flex-1">
                <div className="bg-surface-light dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden p-6 min-h-[600px] flex flex-col md:block">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start h-full">
                        {/* Sidebar */}
                        <div className="lg:col-span-4 flex flex-col gap-4 h-full">
                            <div className="pb-2 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center mb-2">
                                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 font-display">
                                    {filteredJobs.length} Positions Available
                                </h2>
                            </div>
                            <div className="flex flex-col gap-4 overflow-y-auto lg:max-h-[800px] pr-2 scrollbar-hide">
                                {filteredJobs.length > 0 ? (
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
                        <div className="lg:col-span-8 border-l border-gray-100 dark:border-gray-800 pl-0 lg:pl-6 h-full min-h-[500px]">
                            {selectedJob ? (
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
            <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-surface-dark border-t border-gray-200 dark:border-gray-800 pb-safe pt-2 px-6 flex justify-center z-50 lg:hidden shadow-lg">
                <button className="flex flex-col items-center gap-1 text-primary p-2">
                    <span className="material-icons-round">home</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide font-body">Home</span>
                </button>
                <button className="flex flex-col items-center gap-1 text-gray-400 p-2">
                    <span className="material-icons-round">work_outline</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide font-body">My Jobs</span>
                </button>
                <button className="flex flex-col items-center gap-1 text-gray-400 p-2">
                    <span className="material-icons-round">person_outline</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide font-body">Profile</span>
                </button>
            </nav>
            <div className="h-20 lg:hidden"></div>
        </div>
    );
};

export default App;