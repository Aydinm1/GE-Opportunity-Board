import React from 'react';
import { Job } from '../types';
import { statusVariant } from '../lib/utils';

interface JobCardProps {
    job: Job;
    isSelected: boolean;
    onClick: () => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, isSelected, onClick }) => {
    const getStatusStyles = (status: string | null) => statusVariant(status).card;

    const getLocationStyles = (loc: string | null) => {
        switch (loc) {
            case 'Virtual': return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200';
            case 'In-Person':
            case 'Onsite':
            case 'On-site':
                return 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200';
            case 'Hybrid': return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 border-indigo-200';
            default: return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200';
        }
    };

    return (
        <div 
            onClick={onClick}
            className={`relative p-5 rounded-xl transition-all cursor-pointer group border-2 ${
                isSelected 
                ? 'bg-white dark:bg-gray-800 border-primary shadow-md' 
                : 'bg-gray-50 dark:bg-gray-900 border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-sm'
            }`}
        >
            <div className="mb-8">
                <h3 className={`font-bold text-base font-display leading-tight mb-2 transition-colors ${isSelected ? 'text-primary' : 'text-black dark:text-white group-hover:text-primary'}`}>
                    {job.roleTitle}
                </h3>
                <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                        {job.teamVertical}
                    </p>
                    <p className="text-[11px] font-bold text-primary/80 dark:text-primary leading-none">
                        {job.programmeArea}
                    </p>
                </div>
            </div>
            <div className="flex justify-between items-end mt-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${getStatusStyles(job.roleStatus || 'Actively Hiring')}`}>
                        {job.roleStatus || 'Actively Hiring'}
                    </span>
                    <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${getLocationStyles(job.workType)}`}>
                        {job.workType}
                    </span>
                </div>
                <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap uppercase tracking-tighter">{job.timeCommitment}</span>
            </div>
        </div>
    );
};

export default JobCard;