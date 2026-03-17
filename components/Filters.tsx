import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Job, FilterOptions } from '../types';
import { DURATION_BUCKETS, TIME_COMMITMENT_BUCKETS } from '../lib/utils';

type FilterOption = string | { value: string; label: string };

interface Props {
  jobs: Job[];
  selectedFilters: FilterOptions;
  setSelectedFilters: React.Dispatch<React.SetStateAction<FilterOptions>>;
  mobileMode?: 'full' | 'compact';
}

const Filters: React.FC<Props> = ({ jobs, selectedFilters, setSelectedFilters, mobileMode = 'full' }) => {
  const [activeFilter, setActiveFilter] = useState<keyof FilterOptions | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const filtersRowRef = useRef<HTMLDivElement | null>(null);
  const optionsPanelRef = useRef<HTMLDivElement | null>(null);

  const filters: { id: keyof FilterOptions; label: string }[] = [
    { id: 'programmeArea', label: 'Programme Area' },
    { id: 'teamVertical', label: 'Functional Area' },
    { id: 'workType', label: 'Work Type' },
    { id: 'roleType', label: 'Role Type' },
    { id: 'durationCategory', label: 'Project Duration' },
    { id: 'timeCommitment', label: 'Weekly Time Commitment' },
  ];

  const durationBuckets = DURATION_BUCKETS;
  const timeCommitmentBuckets = TIME_COMMITMENT_BUCKETS;

  const fieldOptions = useMemo((): Record<string, FilterOption[]> => {
    const opts: Record<string, Set<string>> = {
      programmeArea: new Set(),
      teamVertical: new Set(),
      workType: new Set(),
      roleType: new Set(),
      durationCategory: new Set(),
      timeCommitment: new Set(),
    };
    jobs.forEach(j => {
      if (j.programmeArea) opts.programmeArea.add(j.programmeArea);
      if (j.teamVertical) opts.teamVertical.add(j.teamVertical);
      if (j.workType) opts.workType.add(j.workType);
      if (j.roleType) opts.roleType.add(j.roleType);
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
    return mapped as Record<string, FilterOption[]>;
  }, [jobs]);

  const getOptionLabel = (filterId: keyof FilterOptions | string, val: string) => {
    const opts = fieldOptions[filterId as string] as FilterOption[] | undefined;
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
      roleType: [],
      durationCategory: [],
      timeCommitment: [],
    });
    setActiveFilter(null);
  };

  const updateFilter = (filterId: keyof FilterOptions, next: string[]) => {
    setSelectedFilters(prev => ({ ...prev, [filterId]: next } as FilterOptions));
  };

  const anyFilterSelected = Object.values(selectedFilters).some(arr => Array.isArray(arr) && arr.length > 0);
  const selectedFilterCount = Object.values(selectedFilters).reduce((total, values) => total + (Array.isArray(values) ? values.length : 0), 0);
  const activeFilterMeta = filters.find((filter) => filter.id === activeFilter) || null;
  const isMobileSheet = typeof window !== 'undefined' && window.innerWidth < 1024;
  const isCompactMobile = mobileMode === 'compact' && isMobileSheet;
  const closeMobileSheet = () => {
    setActiveFilter(null);
    setMobileSheetOpen(false);
  };

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

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 1024) return;
    if (activeFilter === null && !mobileSheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeFilter, mobileSheetOpen]);

  return (
    <>
      {isCompactMobile ? (
        <div ref={filtersRowRef} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveFilter(null);
              setMobileSheetOpen(true);
            }}
            className="inline-flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[1.25rem] border border-gray-200 bg-white px-4 py-2.5 text-[15px] font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-2">
              <span className="material-icons-round text-[17px] text-primary">tune</span>
              Filters
            </span>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500">
              {selectedFilterCount > 0 ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[12px] font-semibold text-gray-600">
                  {selectedFilterCount} active
                </span>
              ) : null}
              <span className="material-icons-round text-[18px] text-gray-400">expand_more</span>
            </span>
          </button>
          {anyFilterSelected && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center justify-center rounded-[1.25rem] border border-gray-200 bg-white px-3 py-2.5 text-[14px] font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      ) : (
        <div ref={filtersRowRef} className="w-full">
          <div className="flex flex-wrap justify-center gap-2 px-2 pb-1 lg:flex-nowrap lg:px-0">
            {filters.map((f) => {
              const selectedValues = selectedFilters[f.id] ?? [];
              const sortedValues = sortSelectedValues(f.id as string, selectedValues);
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
                  <span className="min-w-0 truncate text-left">{selectedText}</span>
                  <span className={`material-icons-round text-[16px] transition-transform ${isActive ? 'rotate-180' : ''} ${onState ? 'text-white/70' : 'text-gray-400'}`}>
                    expand_more
                  </span>
                </button>
              );
            })}
            {anyFilterSelected && (
              <button
                onClick={clearAllFilters}
                className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium font-body shadow-sm transition-colors flex items-center gap-1 border border-transparent whitespace-nowrap bg-gray-600 hover:bg-gray-700 text-white flex-shrink-0"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}

      {activeFilter && fieldOptions[activeFilter as string] && (
        <>
          <div className="w-full flex justify-center mt-3">
            <div ref={optionsPanelRef} className="bg-white dark:bg-gray-900 rounded-lg shadow p-3 inline-flex gap-2 flex-wrap justify-center w-fit mx-auto">
              <button
                onClick={() => { updateFilter(activeFilter as keyof FilterOptions, []); }}
                className="px-3 py-1 rounded text-sm bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 whitespace-nowrap"
              >
                All
              </button>
              {fieldOptions[activeFilter as string].map((opt: FilterOption) => {
                const value = typeof opt === 'string' ? opt : opt.value;
                const label = typeof opt === 'string' ? opt : opt.label;
                const curr = selectedFilters[activeFilter as keyof FilterOptions] || [];
                const isPicked = Array.isArray(curr) && curr.includes(value);
                return (
                  <button
                    key={value}
                    onClick={() => {
                      const currVals = selectedFilters[activeFilter as keyof FilterOptions] || [];
                      const next = currVals.includes(value) ? currVals.filter((v) => v !== value) : [...currVals, value];
                      updateFilter(activeFilter as keyof FilterOptions, next);
                    }}
                    className={`px-3 py-1 rounded text-sm whitespace-nowrap ${isPicked ? 'bg-primary text-white' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {!isCompactMobile && isMobileSheet && typeof document !== 'undefined' && createPortal(
        <div className="lg:hidden fixed inset-0 z-[80] bg-slate-900/30" onClick={closeMobileSheet}>
          <div
            ref={optionsPanelRef}
            className="absolute inset-x-0 bottom-0 max-h-[calc(100svh-6rem)] overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+4rem)] pt-3 shadow-[0_-20px_48px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-200" />
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Filter</p>
              </div>
              <h3 className="flex-1 text-center text-[15px] font-semibold text-gray-900">{activeFilterMeta?.label || 'Options'}</h3>
              <button
                type="button"
                onClick={closeMobileSheet}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600"
                aria-label="Close filter options"
              >
                <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pb-2">
                  <button
                    onClick={() => { updateFilter(activeFilter as keyof FilterOptions, []); }}
                    className="px-3 py-2 rounded-full text-sm bg-gray-100 text-gray-700 whitespace-nowrap"
                  >
                    All
                  </button>
                  {fieldOptions[activeFilter as string].map((opt: FilterOption) => {
                    const value = typeof opt === 'string' ? opt : opt.value;
                    const label = typeof opt === 'string' ? opt : opt.label;
                    const curr = selectedFilters[activeFilter as keyof FilterOptions] || [];
                    const isPicked = Array.isArray(curr) && curr.includes(value);
                    return (
                      <button
                        key={value}
                        onClick={() => {
                          const currVals = selectedFilters[activeFilter as keyof FilterOptions] || [];
                          const next = currVals.includes(value) ? currVals.filter((v) => v !== value) : [...currVals, value];
                          updateFilter(activeFilter as keyof FilterOptions, next);
                        }}
                        className={`px-3 py-2 rounded-full text-sm border whitespace-nowrap ${isPicked ? 'bg-primary text-white border-transparent' : 'bg-white text-gray-700 border-gray-200'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}

      {isCompactMobile && mobileSheetOpen && typeof document !== 'undefined' && createPortal(
        <div className="lg:hidden fixed inset-0 z-[80] bg-slate-900/30" onClick={closeMobileSheet}>
          <div
            ref={optionsPanelRef}
            className="absolute inset-x-0 bottom-0 max-h-[calc(100svh-6rem)] overflow-y-auto rounded-t-[1.75rem] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+4rem)] pt-3 shadow-[0_-20px_48px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200" />
            <div className="mb-4 grid grid-cols-[36px_1fr_36px] items-start gap-3">
              {activeFilter ? (
                <button
                  type="button"
                  onClick={() => setActiveFilter(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600"
                  aria-label="Back to filter groups"
                >
                  <span className="material-icons-round text-base">arrow_back</span>
                </button>
              ) : (
                <div className="h-9 w-9" aria-hidden="true" />
              )}
              <div className="pt-0.5 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Filter</p>
                <h3 className="mt-1 text-[15px] font-semibold leading-tight text-gray-900">
                  {activeFilterMeta?.label || 'Filter roles'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeMobileSheet}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600"
                aria-label="Close filter options"
              >
                <span className="material-icons-round text-base">close</span>
              </button>
            </div>
            {activeFilter === null ? (
              <div className="space-y-2 pb-1">
                {filters.map((filter) => {
                  const currentValues = selectedFilters[filter.id] || [];
                  const summary = currentValues.length === 0
                    ? 'All'
                    : currentValues.length <= 2
                      ? currentValues.map((value) => getOptionLabel(filter.id, value)).join(', ')
                      : `${currentValues.length} selected`;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setActiveFilter(filter.id)}
                      className="flex w-full items-center justify-between rounded-[1.25rem] border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-gray-50"
                    >
                      <div>
                        <div className="text-[15px] font-semibold leading-tight text-gray-900">{filter.label}</div>
                        <div className="mt-0.5 text-[14px] text-gray-500">{summary}</div>
                      </div>
                      <span className="material-icons-round text-base text-gray-400">chevron_right</span>
                    </button>
                  );
                })}
                {anyFilterSelected && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="mt-2 w-full rounded-[1.25rem] border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pb-1">
                <button
                  onClick={() => { updateFilter(activeFilter as keyof FilterOptions, []); }}
                  className="rounded-full bg-gray-100 px-3 py-2 text-[14px] text-gray-700 whitespace-nowrap"
                >
                  All
                </button>
                {fieldOptions[activeFilter as string].map((opt: FilterOption) => {
                  const value = typeof opt === 'string' ? opt : opt.value;
                  const label = typeof opt === 'string' ? opt : opt.label;
                  const curr = selectedFilters[activeFilter as keyof FilterOptions] || [];
                  const isPicked = Array.isArray(curr) && curr.includes(value);
                  return (
                      <button
                        key={value}
                        onClick={() => {
                          const currVals = selectedFilters[activeFilter as keyof FilterOptions] || [];
                          const next = currVals.includes(value) ? currVals.filter((v) => v !== value) : [...currVals, value];
                          updateFilter(activeFilter as keyof FilterOptions, next);
                        }}
                      className={`rounded-full border px-3 py-2 text-[14px] whitespace-nowrap ${isPicked ? 'bg-primary text-white border-transparent' : 'bg-white text-gray-700 border-gray-200'}`}
                      >
                        {label}
                      </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default Filters;
