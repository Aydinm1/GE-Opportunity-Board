import React from 'react';
import { Job } from '../types';
import { statusVariant } from '../lib/utils';

interface JobCardProps {
    job: Job;
    isMobile?: boolean;
    isSelected: boolean;
    onClick: () => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, isMobile = false, isSelected, onClick }) => {
    const getStatusStyles = (status: string | null) => statusVariant(status).card;
    const selectedCardClasses = isMobile
        ? 'border-gray-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.05)]'
        : 'border-primary bg-white shadow-md';
    const defaultCardClasses = 'border-gray-100 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:border-gray-200 hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]';
    const primaryMetaLabel = job.roleType || job.workType;

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

    const getRoleTypeStyles = (roleType: string | null) => {
        const normalized = roleType?.trim().toLowerCase();

        switch (normalized) {
            case 'paid':
            case 'paid role':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'volunteer':
            case 'volunteering':
            case 'volunteer role':
                return 'bg-violet-50 text-violet-700 border-violet-200';
            default:
                return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative w-full rounded-[1.35rem] border p-4 text-left transition-all cursor-pointer group sm:rounded-xl sm:p-5 ${
                isSelected 
                ? selectedCardClasses
                : defaultCardClasses
            }`}
        >
            <div className="mb-[1.125rem] sm:mb-6">
                <h3 className={`mb-2 font-display text-[1.04rem] font-bold leading-[1.08] transition-colors sm:text-base ${isSelected && !isMobile ? 'text-primary' : 'text-black dark:text-white group-hover:text-primary'}`}>
                    {job.roleTitle}
                </h3>
                <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 leading-none">
                        {job.teamVertical}
                    </p>
                    <p className="text-[12px] font-semibold text-primary/80 dark:text-primary leading-none">
                        {job.programmeArea}
                    </p>
                </div>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border ${getStatusStyles(job.roleStatus || 'Actively Hiring')}`}>
                        {job.roleStatus || 'Actively Hiring'}
                    </span>
                    {primaryMetaLabel && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border ${job.roleType ? getRoleTypeStyles(job.roleType) : getLocationStyles(job.workType)}`}>
                            {primaryMetaLabel}
                        </span>
                    )}
                </div>
                {job.timeCommitment && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400 sm:text-right">
                        {job.timeCommitment}
                    </span>
                )}
            </div>
        </button>
    );
};

export default JobCard;
