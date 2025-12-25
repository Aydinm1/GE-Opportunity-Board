"use client";

import React, { useEffect, useMemo, useState } from "react";

type Job = {
  id: string;
  roleTitle: string;
  programmeArea: string | null;
  teamVertical: string | null;
  locationBase: string | null;
  workType: string | null;
  startDate: string | null; // YYYY-MM-DD or null
  durationMonths: number | null;
  durationCategory: string; // "0–3" | "3–6" | "6–9" | "9–12" | "12+" | "TBD"
  purposeShort: string | null;
  keyResponsibilities: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  timeCommitment: string | null;
  languagesRequired: string[];
};

function formatStartAndDuration(job: Job) {
  const start = job.startDate ? `Start: ${job.startDate}` : "Start: TBD";
  const duration =
    job.durationMonths != null
      ? `Duration: ${job.durationMonths} months`
      : `Duration: ${job.durationCategory || "TBD"}`;
  return `${start} • ${duration}`;
}

function Badge({ children, variant }: { children: React.ReactNode; variant?: "muted" | "accent" }) {
  const base = "text-xs font-medium inline-flex items-center px-2.5 py-1 rounded-full border";
  const classes =
    variant === "accent"
      ? `${base} border-[#d7eefb] bg-[#eaf6ff] text-[#00558C]`
      : `${base} border-gray-200 bg-white text-gray-700`;
  return <span className={classes}>{children}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="text-sm text-gray-800 leading-6">{children}</div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="relative">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none cursor-pointer bg-white border rounded-full px-3 py-1 text-sm pr-8 shadow-sm border-gray-200"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </label>
  );
}

export default function HomePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const [filters, setFilters] = useState<{
    programme?: string;
    team?: string;
    workType?: string;
    timeCommitment?: string;
    durationCategory?: string;
    startDate?: "any" | "has" | "none";
  }>({ startDate: "any" });

  // load persisted state
  useEffect(() => {
    const savedQuery = typeof window !== "undefined" ? localStorage.getItem("jobs_query") : null;
    const savedFilters = typeof window !== "undefined" ? localStorage.getItem("jobs_filters") : null;
    if (savedQuery) setQuery(savedQuery);
    if (savedFilters) {
      try {
        setFilters(JSON.parse(savedFilters));
      } catch {}
    }
  }, []);

  // persist
  useEffect(() => {
    localStorage.setItem("jobs_query", query);
  }, [query]);

  useEffect(() => {
    localStorage.setItem("jobs_filters", JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/jobs");
        const data = await res.json();
        const nextJobs = (data.jobs ?? []) as Job[];
        if (!mounted) return;
        setJobs(nextJobs);
        if (!selectedJobId && nextJobs.length > 0) setSelectedJobId(nextJobs[0].id);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo(() => {
    const programmes = Array.from(new Set(jobs.map((j) => j.programmeArea).filter(Boolean) as string[])).sort();
    const teams = Array.from(new Set(jobs.map((j) => j.teamVertical).filter(Boolean) as string[])).sort();
    const workTypes = Array.from(new Set(jobs.map((j) => j.workType).filter(Boolean) as string[])).sort();
    const times = Array.from(new Set(jobs.map((j) => j.timeCommitment).filter(Boolean) as string[])).sort();
    const durations = Array.from(new Set(jobs.map((j) => j.durationCategory).filter(Boolean) as string[])).sort();
    return { programmes, teams, workTypes, times, durations };
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filters.programme && j.programmeArea !== filters.programme) return false;
      if (filters.team && j.teamVertical !== filters.team) return false;
      if (filters.workType && j.workType !== filters.workType) return false;
      if (filters.timeCommitment && j.timeCommitment !== filters.timeCommitment) return false;
      if (filters.durationCategory && j.durationCategory !== filters.durationCategory) return false;
      if (filters.startDate === "has" && !j.startDate) return false;
      if (filters.startDate === "none" && j.startDate) return false;

      if (!q) return true;
      const hay = [
        j.roleTitle,
        j.programmeArea ?? "",
        j.teamVertical ?? "",
        j.locationBase ?? "",
        j.workType ?? "",
        j.timeCommitment ?? "",
        j.durationCategory ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, query, filters]);

  // keep selection sane
  useEffect(() => {
    if (!filtered.length) {
      setSelectedJobId(null);
      return;
    }
    if (!selectedJobId) {
      setSelectedJobId(filtered[0].id);
      return;
    }
    const exists = filtered.some((j) => j.id === selectedJobId);
    if (!exists) setSelectedJobId(filtered[0].id);
  }, [filtered, selectedJobId]);

  const selected = useMemo(() => jobs.find((j) => j.id === selectedJobId) ?? (filtered[0] ?? null), [jobs, selectedJobId, filtered]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 sm:px-6 lg:px-8 py-6">
      {/* Top header */}
      <header className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#00558C] flex items-center justify-center text-white font-bold">GE</div>
          <div className="text-lg font-semibold">Global Encounters</div>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="rounded-2xl hero-pattern bg-[#00558C] p-8 text-white shadow-sm">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-semibold mb-4">Find your next opportunity</h2>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="relative">
                  <input
                    aria-label="Search"
                    className="w-full rounded-full px-4 py-3 text-gray-800 placeholder-gray-500"
                    placeholder="Search roles, programme, team, location..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <svg className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
              <button
                className="px-5 py-3 rounded-full bg-white text-[#00558C] font-semibold shadow-sm"
                onClick={() => { /* search is live via query; keep for accessibility */ }}
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Filter chips row */}
        <div className="mt-4 flex gap-3 flex-wrap">
          <FilterSelect label="Programme" value={filters.programme} onChange={(v) => setFilters((s) => ({ ...s, programme: v || undefined }))} options={options.programmes} />
          <FilterSelect label="Team" value={filters.team} onChange={(v) => setFilters((s) => ({ ...s, team: v || undefined }))} options={options.teams} />
          <FilterSelect label="Work type" value={filters.workType} onChange={(v) => setFilters((s) => ({ ...s, workType: v || undefined }))} options={options.workTypes} />
          <FilterSelect label="Time commitment" value={filters.timeCommitment} onChange={(v) => setFilters((s) => ({ ...s, timeCommitment: v || undefined }))} options={options.times} />
          <FilterSelect label="Duration" value={filters.durationCategory} onChange={(v) => setFilters((s) => ({ ...s, durationCategory: v || undefined }))} options={options.durations} />
          <label className="relative">
            <select
              value={filters.startDate ?? "any"}
              onChange={(e) => setFilters((s) => ({ ...s, startDate: e.target.value as any }))}
              className="appearance-none cursor-pointer bg-white border rounded-full px-3 py-1 text-sm pr-8 shadow-sm border-gray-200"
            >
              <option value="any">Start date: Any</option>
              <option value="has">Has start date</option>
              <option value="none">No start date / TBD</option>
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
          </div>
        </div>

      </div>

      {/* Main container */}
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-sm p-4 md:p-6 grid md:grid-cols-[420px_1fr] gap-6">
        {/* Left: list */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Roles</h3>
            <div className="text-sm text-gray-500">{loading ? "Loading…" : `${filtered.length} roles`}</div>
          </div>

          <div className="scroll-area border border-gray-100 rounded-lg">
            {loading ? (
              <div className="p-4 text-gray-500">Loading roles…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-gray-500">No matching roles.</div>
            ) : null}

            <ul className="divide-y divide-gray-100">
              {filtered.map((job) => {
                const isSelected = job.id === selectedJobId;
                return (
                  <li key={job.id}>
                    <button
                      onClick={() => setSelectedJobId(job.id)}
                      className={`w-full text-left p-4 flex flex-col gap-2 ${isSelected ? "ring-2 ring-[#00558C] bg-[#eaf6ff]" : "hover:bg-gray-50"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-gray-900 truncate">{job.roleTitle}</div>
                        <div className="text-xs text-gray-500">{job.programmeArea ?? ""}</div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-600">{job.locationBase ?? "Location TBD"}</span>
                        {job.workType ? <span className="text-xs text-gray-600">• {job.workType}</span> : null}
                        {job.timeCommitment ? <span className="text-xs text-gray-600">• {job.timeCommitment}</span> : null}
                      </div>

                      <div className="text-xs text-gray-500">{formatStartAndDuration(job)}</div>

                      {job.languagesRequired?.length ? (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {job.languagesRequired.slice(0, 3).map((l) => (
                            <span key={l} className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{l}</span>
                          ))}
                          {job.languagesRequired.length > 3 ? <span className="text-xs text-gray-500">+{job.languagesRequired.length - 3}</span> : null}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="min-h-[420px]">
          {!selected ? (
            <div className="p-6 text-gray-500">Select a role to view details.</div>
          ) : (
            <div className="p-4 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-gray-900">{selected.roleTitle}</h1>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {selected.programmeArea ? <Badge>{selected.programmeArea}</Badge> : null}
                    {selected.teamVertical ? <Badge>{selected.teamVertical}</Badge> : null}
                    {selected.locationBase ? <Badge>{selected.locationBase}</Badge> : null}
                    {selected.workType ? <Badge>{selected.workType}</Badge> : null}
                    {selected.timeCommitment ? <Badge>{selected.timeCommitment}</Badge> : null}
                    <Badge variant="muted">{selected.durationCategory || "TBD"}</Badge>
                  </div>
                  <div className="mt-3 text-sm text-gray-600">{formatStartAndDuration(selected)}</div>
                </div>

                <div>
                  <button
                    onClick={() => (window.location.href = `/jobs/${selected.id}?apply=1`) }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00558C] text-white font-semibold shadow"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {selected.purposeShort ? (
                <Section title="Purpose">
                  <div>{selected.purposeShort}</div>
                </Section>
              ) : null}

              <Section title="Key responsibilities">
                {selected.keyResponsibilities?.length ? (
                  <ul className="list-disc pl-5">
                    {selected.keyResponsibilities.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-gray-500">Not specified.</div>
                )}
              </Section>

              <Section title="Required qualifications">
                {selected.requiredQualifications?.length ? (
                  <ul className="list-disc pl-5">
                    {selected.requiredQualifications.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-gray-500">Not specified.</div>
                )}
              </Section>

              <Section title="Preferred qualifications">
                {selected.preferredQualifications?.length ? (
                  <ul className="list-disc pl-5">
                    {selected.preferredQualifications.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-gray-500">Not specified.</div>
                )}
              </Section>

              <Section title="Languages required">
                {selected.languagesRequired?.length ? (
                  <div className="flex gap-2 flex-wrap">
                    {selected.languagesRequired.map((l) => (
                      <Badge key={l}>{l}</Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500">Not specified.</div>
                )}
              </Section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
