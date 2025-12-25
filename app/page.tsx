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

  durationMonths: number | null;
  durationCategory: string;

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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ opacity: 0.92, lineHeight: 1.5 }}>{children}</div>
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(0,0,0,0.02)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default function HomePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/jobs");
        const data = await res.json();
        const nextJobs = (data.jobs ?? []) as Job[];
        setJobs(nextJobs);

        // Auto-select first job when data loads
        if (!selectedJobId && nextJobs.length > 0) {
          setSelectedJobId(nextJobs[0].id);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const selectedJob = useMemo(() => {
    if (!filtered.length) return null;
    const found = filtered.find((j) => j.id === selectedJobId);
    return found ?? filtered[0];
  }, [filtered, selectedJobId]);

  // If the selected job disappeared due to filtering, keep selection sane.
  useEffect(() => {
    if (!filtered.length) return;
    if (!selectedJobId) {
      setSelectedJobId(filtered[0].id);
      return;
    }
    const stillExists = filtered.some((j) => j.id === selectedJobId);
    if (!stillExists) setSelectedJobId(filtered[0].id);
  }, [filtered, selectedJobId]);

  return (
    <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
          Opportunities
        </h1>
        <div style={{ opacity: 0.7 }}>
          {loading ? "Loading…" : `${filtered.length} roles`}
        </div>
      </div>

      {/* Search */}
      <div style={{ marginTop: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roles, programme, team, location..."
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 10,
            outline: "none",
          }}
        />
      </div>

      {/* Main two-column */}
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "440px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Left: results list */}
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            overflow: "hidden",
            background: "white",
          }}
        >
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              fontWeight: 700,
              opacity: 0.85,
            }}
          >
            Roles
          </div>

          <div
            style={{
              maxHeight: "calc(100vh - 220px)",
              overflowY: "auto",
            }}
          >
            {loading ? (
              <div style={{ padding: 14, opacity: 0.7 }}>Loading roles…</div>
            ) : null}

            {!loading && filtered.length === 0 ? (
              <div style={{ padding: 14, opacity: 0.7 }}>No matching roles.</div>
            ) : null}

            {filtered.map((job) => {
              const selected = job.id === selectedJob?.id;

              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: 14,
                    border: "none",
                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                    background: selected ? "rgba(0, 85, 140, 0.08)" : "white",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {job.roleTitle}
                  </div>
                  
                  <div style={{ opacity: 0.8, marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge>{job.locationBase ?? "Location TBD"}</Badge>
                    {job.workType ? <Badge>{job.workType}</Badge> : null}
                    {job.timeCommitment ? <Badge>{job.timeCommitment}</Badge> : null}
                  </div>

                  <div style={{ opacity: 0.7, marginTop: 8, fontSize: 12 }}>
                    {formatStartAndDuration(job)}
                  </div>

                  {job.purposeShort ? (
                    <div
                      style={{
                        opacity: 0.88,
                        marginTop: 10,
                        fontSize: 13,
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {job.purposeShort}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: details */}
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 14,
            padding: 18,
            background: "white",
            minHeight: 420,
          }}
        >
          {!selectedJob ? (
            <div style={{ opacity: 0.7 }}>
              Select a role to view details.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {selectedJob.roleTitle}
                  </div>

                  <div style={{ opacity: 0.8, marginTop: 6 }}>
                    {selectedJob.programmeArea ?? "—"}
                    {selectedJob.teamVertical ? ` • ${selectedJob.teamVertical}` : ""}
                  </div>

                  <div style={{ opacity: 0.8, marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge>{selectedJob.locationBase ?? "Location TBD"}</Badge>
                    {selectedJob.workType ? <Badge>{selectedJob.workType}</Badge> : null}
                    {selectedJob.timeCommitment ? <Badge>{selectedJob.timeCommitment}</Badge> : null}
                    <Badge>{selectedJob.durationCategory || "TBD"}</Badge>
                  </div>

                  <div style={{ opacity: 0.7, marginTop: 10, fontSize: 13 }}>
                    {formatStartAndDuration(selectedJob)}
                  </div>
                </div>

                <button
                  onClick={() => {
                    window.location.href = `/jobs/${selectedJob.id}?apply=1`;
                  }}
                  style={{
                    height: 40,
                    padding: "0 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "white",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Apply
                </button>
              </div>

              {selectedJob.purposeShort ? (
                <Section title="Purpose">
                  <div>{selectedJob.purposeShort}</div>
                </Section>
              ) : null}

              <Section title="Key responsibilities">
                {selectedJob.keyResponsibilities?.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {selectedJob.keyResponsibilities.map((x, idx) => (
                      <li key={idx}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ opacity: 0.7 }}>Not specified.</div>
                )}
              </Section>

              <Section title="Required qualifications">
                {selectedJob.requiredQualifications?.some(
                  (x) => x !== "Other (please specify below)"
                ) ? (
                  <>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {selectedJob.requiredQualifications
                        .filter((x) => x !== "Other (please specify below)")
                        .map((x, idx) => (
                          <li key={idx}>{x}</li>
                        ))}
                    </ul>
                    {selectedJob.requiredQualifications.includes(
                      "Other (please specify below)"
                    ) && selectedJob.requiredOther ? (
                      <div style={{ marginTop: 8 }}>{selectedJob.requiredOther}</div>
                    ) : null}
                  </>
                ) : selectedJob.requiredOther ? (
                  <div>{selectedJob.requiredOther}</div>
                ) : (
                  <div style={{ opacity: 0.7 }}>Not specified.</div>
                )}
              </Section>

              <Section title="Preferred qualifications">
                {selectedJob.preferredQualifications?.some(
                  (x) => x !== "Other (please specify below)"
                ) ? (
                  <>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {selectedJob.preferredQualifications
                        .filter((x) => x !== "Other (please specify below)")
                        .map((x, idx) => (
                          <li key={idx}>{x}</li>
                        ))}
                    </ul>
                    {selectedJob.preferredQualifications.includes(
                      "Other (please specify below)"
                    ) && selectedJob.additionalSkillNotes ? (
                      <div style={{ marginTop: 8 }}>{selectedJob.additionalSkillNotes}</div>
                    ) : null}
                  </>
                ) : selectedJob.additionalSkillNotes ? (
                  <div>{selectedJob.additionalSkillNotes}</div>
                ) : (
                  <div style={{ opacity: 0.7 }}>Not specified.</div>
                )}
              </Section>

              <Section title="Languages required">
                {selectedJob.languagesRequired?.length ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {selectedJob.languagesRequired.map((l) => (
                      <Badge key={l}>{l}</Badge>
                    ))}
                  </div>
                ) : (
                  <div style={{ opacity: 0.7 }}>Not specified.</div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
