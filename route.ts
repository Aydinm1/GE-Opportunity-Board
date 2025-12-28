
type AirtableRecord<T> = { id: string; fields: T; createdTime: string };
type AirtableListResponse<T> = { records: AirtableRecord<T>[]; offset?: string };

type AirtableJobFields = {
  "Role Title"?: string;
  "Programme / Functional Area"?: string;
  "Team/Vertical"?: string;
  "Displayed Status"?: string;

  "Published?"?: boolean;

  "Location / Base"?: string;
  "Work Type"?: string;

  "Start Date"?: string; // Airtable date as "YYYY-MM-DD"
  "Duration (Months)"?: number | string; // Number field preferred; but tolerate string
  "Duration Categories"?: string; // your formula field ("0–3", "3–6", ... "TBD")

  "Purpose of the Role copy"?: string;
  "Key Responsibilities"?: string;

  "10. Required Qualifications"?: string[] | string;
  "Other"?: string;

  "Preferred Qualifications"?: string[] | string;
  "Additional Skill Notes"?: string;

  "Estimated Time Commitment copy"?: string;

  "Languages Required"?: string[] | string;
  "OTHER LANGUAGES"?: string;
};

function splitBullets(text?: string): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-•\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function parseDurationMonths(v: number | string | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.match(/(\d+(\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Fallback bucket logic if Airtable field is blank/missing
function bucketFromMonths(months: number | null): string {
  if (!months) return "TBD";
  if (months <= 3) return "0–3";
  if (months <= 6) return "3–6";
  if (months <= 9) return "6–9";
  if (months <= 12) return "9–12";
  return "12+";
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  if (typeof v === "string")
    return v
      .split(/\r?\n|,/g)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

export async function getJobs() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_GEROLES_TABLE; // set this to your Roles table name
  const view = process.env.AIRTABLE_JOBS_VIEW;

  if (!token || !baseId || !table) {
    throw new Error("Missing Airtable env vars");
  }

  const encodedTable = encodeURIComponent(table);
  const viewQuery = view ? `&view=${encodeURIComponent(view)}` : "";
  const url =
    `https://api.airtable.com/v0/${baseId}/${encodedTable}` +
    `?pageSize=100${viewQuery}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Airtable request failed: ${details}`);
  }

  const data = (await res.json()) as AirtableListResponse<AirtableJobFields>;

  const jobs = data.records.map((r) => {
    const durationMonths = parseDurationMonths(r.fields["Duration (Months)"]);
    const durationCategory =
      r.fields["Duration Categories"] ?? bucketFromMonths(durationMonths);

    return {
      id: r.id,

      roleTitle: r.fields["Role Title"] ?? "",
      roleStatus: r.fields["Displayed Status"] ?? null,
      programmeArea: r.fields["Programme / Functional Area"] ?? null,
      teamVertical: r.fields["Team/Vertical"] ?? null,

      locationBase: r.fields["Location / Base"] ?? null,
      workType: r.fields["Work Type"] ?? null,

      startDate: r.fields["Start Date"] ?? null,

      // New/updated:
      durationMonths, // number | null
      durationCategory, // string like "0–3", "3–6", ... "TBD"

      purposeShort: r.fields["Purpose of the Role copy"] ?? null,
      keyResponsibilities: splitBullets(r.fields["Key Responsibilities"]),

      requiredQualifications: asStringArray(r.fields["10. Required Qualifications"]),
      requiredOther: r.fields["Other"] ?? null,

      preferredQualifications: asStringArray(r.fields["Preferred Qualifications"]),
      additionalSkillNotes: r.fields["Additional Skill Notes"] ?? null,

      timeCommitment: r.fields["Estimated Time Commitment copy"] ?? null,

      languagesRequired: asStringArray(r.fields["Languages Required"]),
      otherLanguages: r.fields["OTHER LANGUAGES"] ?? null,
    };
  });

  return { jobs };
}
