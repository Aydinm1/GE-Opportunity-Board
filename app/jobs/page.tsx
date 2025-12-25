"use client";

import { useEffect, useMemo, useState } from "react";

type Job = {
  id: string;
  roleTitle: string;
  programmeArea: string | null;
  teamVertical: string | null;
  locationBase: string | null;
  workType: string | null;

  startDate: string | null;

  // updated to match API
  durationMonths: number | null;
  durationCategory: string; // "0–3" | "3–6" | "6–9" | "9–12" | "12+" | "TBD"

  purposeShort: string | null;
  keyResponsibilities: string[];

  requiredQualifications: string[];
  requiredOther: string | null;

  preferredQualifications: string[];
  additionalSkillNotes: string | null;

  timeCommitment: string | null;

  languagesRequired: string[];
  otherLanguages: string | null;
};

function formatStartAndDuration(job: Job): string {
  const start = job.startDate ? `Start: ${job.startDate}` : "Start: TBD";
  const duration =
    job.durationMonths != null
      ? `Duration: ${job.durationMonths} months`
      : `Duration: ${job.durationCategory || "TBD"}`;
  return `${start} • ${duration}`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/jobs");
        const data = await res.json();
        setJobs(data.jobs ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;

    return jobs.filter((j) =>
      [
        j.roleTitle,
        j.programmeArea ?? "",
        j.teamVertical ?? "",
        j.locationBase ?? "",
        j.workType ?? "",
        j.timeCommitment ?? "",
        j.durationCategory ?? "",
        j.durationMonths != null ? String(j.durationMonths) : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [jobs, query]);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Opportunities</h1>

      <div style={{ marginTop: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roles, programme, team, location..."
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #ddd",
            borderRadius: 10,
          }}
        />
      </div>

      {loading ? <div style={{ marginTop: 16, opacity: 0.7 }}>Loading…</div> : null}

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {filtered.map((job) => (
          <div
            key={job.id}
            style={{
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{job.roleTitle}</div>

                <div style={{ opacity: 0.85, marginTop: 4 }}>
                  {job.programmeArea ?? "—"}
                  {job.teamVertical ? ` • ${job.teamVertical}` : ""}
                </div>

                <div style={{ opacity: 0.85, marginTop: 4 }}>
                  {job.locationBase ?? "Location TBD"}
                  {job.workType ? ` • ${job.workType}` : ""}
                  {job.timeCommitment ? ` • ${job.timeCommitment}` : ""}
                </div>

                <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
                  {formatStartAndDuration(job)}
                </div>
              </div>

              <button
                onClick={() => {
                  window.location.href = `/jobs/${job.id}?apply=1`;
                }}
                style={{
                  alignSelf: "start",
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  background: "white",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Apply
              </button>
            </div>

            {job.purposeShort ? (
              <p style={{ marginTop: 12, opacity: 0.9 }}>{job.purposeShort}</p>
            ) : null}
          </div>
        ))}

        {!loading && filtered.length === 0 ? (
          <div style={{ marginTop: 16, opacity: 0.7 }}>No matching roles.</div>
        ) : null}
      </div>
    </main>
  );
}
