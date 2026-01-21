import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Job } from '../types';

type FilterOption = string | { value: string; label: string };

interface Props {
  jobs: Job[];
  selectedFilters: Record<string, string[]>;
  setSelectedFilters: (s: Record<string, string[]>) => void;
}

const Filters: React.FC<Props> = ({ jobs, selectedFilters, setSelectedFilters }) => {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const filtersRowRef = useRef<HTMLDivElement | null>(null);
  const optionsPanelRef = useRef<HTMLDivElement | null>(null);

  const filters = [
    { id: 'programmeArea', label: 'Programme Area' },
    { id: 'teamVertical', label: 'Functional Area' },
    { id: 'workType', label: 'Type' },
    { id: 'durationCategory', label: 'Project Duration' },
    { id: 'timeCommitment', label: 'Weekly Time Commitment' },
  ];

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

  return (
    <>
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
            className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium font-body shadow-sm transition-colors flex items-center gap-1 border border-transparent whitespace-nowrap bg-gray-600 hover:bg-gray-700 text-white"
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
    </>
  );
};

export default Filters;
