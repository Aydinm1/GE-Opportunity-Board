import React from 'react';
import { Job } from '../types';

interface JobDetailsProps {
    job: Job;
}

const JobDetails: React.FC<JobDetailsProps> = ({ job }) => {
    const locationName = job.locationBase ?? (job as any).locationName ?? '';
    const locationType = job.workType ?? (locationName ? 'In-Person' : 'Virtual');
    const showSpecificLocation = (locationType === 'In-Person' || locationType === 'Hybrid') && !!locationName;

    const responsibilities = job.keyResponsibilities ?? (job as any).responsibilities ?? [];
    const requirements = job.requiredQualifications ?? (job as any).requirements ?? [];
    const preferred = job.preferredQualifications ?? (job as any).preferredQualifications ?? [];
    const languages = job.languagesRequired ?? (job as any).languages ?? [];

    return (
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
                            <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-primary dark:text-sky-300 font-body uppercase tracking-wide border border-sky-200 dark:border-sky-800/50">
                                Actively Hiring
                            </span>
                        </div>
                    </div>
                    <button className="bg-primary hover:bg-primary-hover text-white font-bold py-2.5 px-6 rounded-lg shadow-lg shadow-blue-900/10 transition-all transform active:scale-95 text-sm uppercase tracking-wide font-body whitespace-nowrap">
                        Apply Now
                    </button>
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
                            <span className="text-xs font-semibold dark:text-white">{job.startDate}</span>
                        </div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Commitment</p>
                        <div className="flex items-center gap-1.5">
                            <span className="material-icons-round text-sm text-primary">update</span>
                            <span className="text-xs font-semibold dark:text-white">{job.durationCategory}</span>
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
                            {job.purposeShort ?? (job as any).overview ?? ''}
                        </p>
                    </div>

                    <div className="mb-8">
                        <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-white tracking-widest mb-3 font-display border-b border-gray-100 dark:border-gray-800 pb-2">Key Responsibilities</h3>
                        <ul className="space-y-3 list-none pl-0 text-gray-600 dark:text-gray-300">
                            {responsibilities.map((resp: string, idx: number) => (
                                <li key={idx} className="flex gap-3 items-start">
                                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"></span>
                                    <span>{resp}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="mb-8">
                        <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-white tracking-widest mb-3 font-display border-b border-gray-100 dark:border-gray-800 pb-2">Required Qualifications</h3>
                        <ul className="space-y-3 list-none pl-0 text-gray-600 dark:text-gray-300">
                            {requirements.map((req: string, idx: number) => (
                                <li key={idx} className="flex gap-3 items-start">
                                    <span className="material-icons-round text-green-600 dark:text-green-400 text-base mt-0.5">check_circle</span>
                                    <span>{req}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {job.preferredQualifications.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-white tracking-widest mb-3 font-display border-b border-gray-100 dark:border-gray-800 pb-2">Preferred Qualifications</h3>
                            <ul className="space-y-3 list-none pl-0 text-gray-600 dark:text-gray-300">
                                {preferred.map((req: string, idx: number) => (
                                        <li key={idx} className="flex gap-3 items-start">
                                            <span className="material-icons-round text-primary/60 text-base mt-0.5">star</span>
                                            <span>{req}</span>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    )}

                    <div className="mb-6">
                        <h3 className="text-xs font-bold uppercase text-gray-900 dark:text-white tracking-widest mb-3 font-display border-b border-gray-100 dark:border-gray-800 pb-2">Languages Required</h3>
                        <div className="flex flex-wrap gap-2">
                            {languages.map((lang: string, idx: number) => (
                                <span key={idx} className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                    {lang}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default JobDetails;