import type { Person } from '../types';
import { splitBullets, parseDurationMonths, bucketFromMonths, asStringArray, asOptionalTrimmedString } from './utils';

type AirtableRecord<T> = { id: string; fields: T; createdTime: string };
type AirtableListResponse<T> = { records: AirtableRecord<T>[]; offset?: string };
type AttachmentInput = { filename: string; contentType: string; base64: string };
type SubmitApplicationResult = { personRecordId: string; applicationRecord: AirtableRecord<Record<string, unknown>> | null };

const IDEMPOTENCY_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_IDEMPOTENCY_CACHE_KEYS = 5000;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const inFlightIdempotency = new Map<string, Promise<SubmitApplicationResult>>();
const completedIdempotency = new Map<string, { result: SubmitApplicationResult; expiresAt: number }>();

type AirtableJobFields = {
  "Role Title"?: string;
  "Programme / Functional Area"?: string;
  "Team/Vertical"?: string;
  "Displayed Status"?: string;

  "Published?"?: boolean;

  "Location / Base"?: string;
  "Work Type"?: string;
  "Role Type"?: string;

  "Start Date"?: string; // Airtable date as "YYYY-MM-DD"
  "Duration (Months)"?: number | string; // Number field preferred; but tolerate string
  "Duration Categories"?: string; // your formula field ("0–3", "3–6", ... "TBD")

  "Displayed Purpose of the Role"?: string;
  "Key Responsibilities"?: string;

  "10. Required Qualifications"?: string[] | string;
  "Other Required Qualifications"?: string;

  "Preferred Qualifications"?: string[] | string;
  "Additional Skill Notes"?: string;

  "Displayed Estimated Time Commitment"?: string;

  "Languages Required"?: string[] | string;
};

// Shared helpers moved to lib/utils.ts

function normalizeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  if (!key) return null;
  if (!SAFE_IDEMPOTENCY_KEY.test(key)) return null;
  return key;
}

function escapeFormulaValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getIdempotencyFieldCandidates() {
  const configured = process.env.AIRTABLE_APPLICATIONS_IDEMPOTENCY_FIELD?.trim() || '';
  const defaults = ['Idempotency Key', 'Submission Idempotency Key', 'Submission Key'];
  const fields = configured ? [configured, ...defaults] : defaults;
  return Array.from(new Set(fields.filter(Boolean)));
}

function pruneCompletedIdempotency(now = Date.now()) {
  for (const [key, entry] of completedIdempotency.entries()) {
    if (entry.expiresAt <= now) completedIdempotency.delete(key);
  }
  while (completedIdempotency.size > MAX_IDEMPOTENCY_CACHE_KEYS) {
    const oldestKey = completedIdempotency.keys().next().value;
    if (!oldestKey) break;
    completedIdempotency.delete(oldestKey);
  }
}

function getCompletedIdempotencyResult(key: string): SubmitApplicationResult | null {
  const entry = completedIdempotency.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    completedIdempotency.delete(key);
    return null;
  }
  return entry.result;
}

function setCompletedIdempotencyResult(key: string, result: SubmitApplicationResult) {
  pruneCompletedIdempotency();
  completedIdempotency.set(key, { result, expiresAt: Date.now() + IDEMPOTENCY_CACHE_TTL_MS });
}

export async function getJobs() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_GEROLES_TABLE; // set this to your Roles table name
  const view = process.env.AIRTABLE_JOBS_VIEW;

  if (!token || !baseId || !table) {
    const missing = [];
    if (!token) missing.push('AIRTABLE_TOKEN');
    if (!baseId) missing.push('AIRTABLE_BASE_ID');
    if (!table) missing.push('AIRTABLE_GEROLES_TABLE');
    throw new Error(`Missing Airtable env vars: ${missing.join(', ') || 'unknown'}`);
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
      roleType: r.fields["Role Type"] ?? null,

      startDate: r.fields["Start Date"] ?? null,

      // New/updated:
      durationMonths, // number | null
      durationCategory, // string like "0–3", "3–6", ... "TBD"

      purposeShort: r.fields["Displayed Purpose of the Role"] ?? null,
      keyResponsibilities: splitBullets(r.fields["Key Responsibilities"]),

      requiredQualifications: asStringArray(r.fields["10. Required Qualifications"]),
      otherQualifications: asOptionalTrimmedString(r.fields["Other Required Qualifications"]),

      preferredQualifications: asStringArray(r.fields["Preferred Qualifications"]),
      additionalQualifications: asOptionalTrimmedString(r.fields["Additional Skill Notes"]),

      timeCommitment: r.fields["Displayed Estimated Time Commitment"] ?? null,

      languagesRequired: asStringArray(r.fields["Languages Required"]),
    };
  });

  return { jobs };
}

// --- Airtable write helpers ---

function airtableBaseUrl(baseId: string, tableName: string) {
  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
}

async function findPersonByNormalizedEmail(normalizedEmail: string) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const peopleTable = process.env.AIRTABLE_PEOPLE_TABLE;
  if (!token || !baseId || !peopleTable) throw new Error('Missing Airtable env vars for people');

  // Try normalized email lookup first (if the field exists and is queryable).
  try {
    const formula = `({normalized email} = '${escapeFormulaValue(normalizedEmail)}')`;
    const url = `${airtableBaseUrl(baseId, peopleTable)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const json = await res.json() as AirtableListResponse<Record<string, unknown>>;
      if (json.records && json.records.length > 0) return json.records[0];
    }
    // if not ok or no records, fallthrough to email search
  } catch (err) {
    // ignore and try email fallback
  }

  // Fallback: search by Email Address using lowercased comparison
  try {
    const emailFormula = `(LOWER({Email Address}) = '${escapeFormulaValue(normalizedEmail)}')`;
    const emailUrl = `${airtableBaseUrl(baseId, peopleTable)}?maxRecords=1&filterByFormula=${encodeURIComponent(emailFormula)}`;
    const r2 = await fetch(emailUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!r2.ok) {
      const d = await r2.text();
      throw new Error(`Airtable people email query failed: ${d}`);
    }
    const json2 = await r2.json() as AirtableListResponse<Record<string, unknown>>;
    return json2.records && json2.records.length > 0 ? json2.records[0] : null;
  } catch (err) {
    // surface the original error
    throw err;
  }
}

async function createPerson(person: Person) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const peopleTable = process.env.AIRTABLE_PEOPLE_TABLE;
  if (!token || !baseId || !peopleTable) throw new Error('Missing Airtable env vars for people');

  const fields: Record<string, unknown> = {};
  // Only include fields when they are non-empty to avoid creating new single-select options
  if (person.fullName && person.fullName.trim() !== '') fields['Full Name'] = person.fullName.trim();
  if (person.candidateStatus && person.candidateStatus.trim() !== '') fields['Candidate Status'] = person.candidateStatus.trim();
  if (person.emailAddress && person.emailAddress.trim() !== '') fields['Email Address'] = person.emailAddress.trim();
  if (person.phoneNumber && person.phoneNumber.trim() !== '') fields['Phone Number (incl. Country Code)'] = person.phoneNumber.trim();
  if (person.linkedIn && person.linkedIn.trim() !== '') fields['LinkedIn Profile Link (if available)'] = person.linkedIn.trim();
  if (person.age && person.age.trim() !== '') fields['Age'] = person.age.trim();
  if (person.gender && person.gender.trim() !== '') fields['Gender'] = person.gender.trim();
  if (person.countryOfOrigin && person.countryOfOrigin.trim() !== '') fields['Country of Birth'] = person.countryOfOrigin.trim();
  if (person.countryOfLiving && person.countryOfLiving.trim() !== '') fields['Country of Living (Current Location)'] = person.countryOfLiving.trim();
  if (person.jurisdiction && person.jurisdiction.trim() !== '') fields['Jurisdiction'] = person.jurisdiction.trim();
  if (person.education && person.education.trim() !== '') fields['Academic / Professional Education'] = person.education.trim();
  if (person.profession && person.profession.trim() !== '') fields['Current Profession / Occupation'] = person.profession.trim();
  if (person.jamatiExperience && person.jamatiExperience.trim() !== '') fields['Jamati Experience'] = person.jamatiExperience.trim();

  const url = airtableBaseUrl(baseId, peopleTable);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });

  if (!res.ok) {
    const d = await res.text();
    throw new Error(`Airtable create person failed: ${d}`);
  }
  const json = await res.json() as AirtableListResponse<Record<string, unknown>>;
  return json.records && json.records.length > 0 ? json.records[0] : null;
}

async function findApplicationByIdempotencyKey(idempotencyKey: string) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const appsTable = process.env.AIRTABLE_APPLICATIONS_TABLE;
  if (!token || !baseId || !appsTable) throw new Error('Missing Airtable env vars for applications');

  const escapedKey = escapeFormulaValue(idempotencyKey);
  const fields = getIdempotencyFieldCandidates();

  for (const field of fields) {
    const formula = `({${field}} = '${escapedKey}')`;
    const url = `${airtableBaseUrl(baseId, appsTable)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.ok) {
      const json = await res.json() as AirtableListResponse<Record<string, unknown>>;
      if (json.records && json.records.length > 0) return json.records[0];
      continue;
    }

    const details = await res.text();
    if (/UNKNOWN_FIELD_NAME|Unknown field name/i.test(details)) {
      continue;
    }
    console.warn(`Airtable idempotency lookup warning for field "${field}": ${details}`);
  }

  return null;
}

async function createApplicationRecord(
  personRecordId: string,
  jobId?: string | null,
  jobTitle?: string | null,
  extras?: Record<string, unknown>,
  idempotencyKey?: string | null
) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const appsTable = process.env.AIRTABLE_APPLICATIONS_TABLE;
  const personLinkField = process.env.AIRTABLE_APPLICATIONS_PERSON_FIELD || 'Person';
  if (!token || !baseId || !appsTable) throw new Error('Missing Airtable env vars for applications');

  // Try multiple candidate link field names to accommodate different table schemas.
  const personCandidates = [personLinkField, 'People'].filter(Boolean) as string[];
  const jobLinkCandidates = ['GE Roles'].filter(Boolean) as string[];
  const idempotencyCandidates = idempotencyKey
    ? [...getIdempotencyFieldCandidates(), null]
    : [null];
  const baseUrl = airtableBaseUrl(baseId, appsTable);

  // Build common payload fields (only include non-empty values) — do NOT include job title (avoid unknown field errors)
  const baseFields: Record<string, unknown> = {};
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) baseFields[k] = v;
    }
  }

  const removedFields = new Set<string>();
  let lastError: any = null;

  // Try combinations of person link field and job link field (if jobId present)
  for (const personCandidate of personCandidates) {
    const jobCandidates = jobId && jobId.trim() !== '' ? jobLinkCandidates.concat([null]) : [null];
    for (const jobCandidate of jobCandidates) {
      for (const idempotencyField of idempotencyCandidates) {
        const fields: Record<string, unknown> = { ...baseFields };
        for (const f of removedFields) delete fields[f];
        // add person link
        fields[personCandidate] = [personRecordId];
        // add job link if available
        if (jobCandidate) fields[jobCandidate] = [jobId];
        if (idempotencyField && idempotencyKey) fields[idempotencyField] = idempotencyKey;

        try {
          const res = await fetch(baseUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: [{ fields }] }),
          });
          if (!res.ok) {
            const d = await res.text();
            // If Airtable reports unknown field name, extract it and retry without that field
            const m = d && d.match(/Unknown field name:\s*"([^"]+)"/i);
            if (m && m[1]) {
              const unknown = m[1];
              removedFields.add(unknown);
              lastError = d;
              continue;
            }
            if (d && d.includes('UNKNOWN_FIELD_NAME')) {
              lastError = d;
              continue;
            }
            throw new Error(`Airtable create application failed: ${d}`);
          }
          const json = await res.json() as AirtableListResponse<Record<string, unknown>>;
          return json.records && json.records.length > 0 ? json.records[0] : null;
        } catch (err) {
          lastError = err;
          // try next candidate combination
        }
      }
    }
  }

  throw new Error(`Airtable create application failed (all link field candidates tried): ${lastError}`);
}

async function uploadAttachmentToAirtable(recordId: string, fieldName: string, attachment: AttachmentInput) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error('Missing Airtable env vars for attachments');

  const uploadUrl = `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: attachment.contentType,
      file: attachment.base64,
      filename: attachment.filename,
    }),
  });
  if (!res.ok) {
    const d = await res.text();
    throw new Error(`Airtable upload attachment failed: ${d}`);
  }
  const data = await res.json() as any;
  // The API can return { attachment: {...} } or a record with fields
  const attachmentObj =
    (data && (data.attachment || data)) as Record<string, unknown>;
  let chosen = attachmentObj;

  // If we got a record with fields, try target field first, then any field containing attachments
  if (data && data.fields) {
    const target = (data.fields as Record<string, unknown>)[fieldName];
    if (Array.isArray(target) && target.length > 0) {
      chosen = target[0] as Record<string, unknown>;
    } else {
      for (const value of Object.values(data.fields as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
          chosen = value[0] as Record<string, unknown>;
          break;
        }
      }
    }
  }

  const attachmentUrl = chosen?.url as string | undefined;
  if (!attachmentUrl) {
    const keys = chosen ? Object.keys(chosen) : [];
    const fieldKeys = data?.fields ? Object.keys(data.fields) : [];
    throw new Error(`Attachment upload response missing url (keys: ${keys.join(',')}; fieldKeys: ${fieldKeys.join(',')})`);
  }
  return chosen;
}

function asAttachmentPatchItem(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id === 'string' && obj.id.trim() !== '') {
    return { id: obj.id };
  }
  if (typeof obj.url === 'string' && obj.url.trim() !== '') {
    const item: Record<string, string> = { url: obj.url };
    if (typeof obj.filename === 'string' && obj.filename.trim() !== '') {
      item.filename = obj.filename;
    }
    return item;
  }
  return null;
}

export async function submitApplication(payload: {
  person: Person;
  jobId?: string | null;
  jobTitle?: string | null;
  extras?: Record<string, unknown>;
  attachments?: { cvResume?: AttachmentInput };
  idempotencyKey?: string | null;
}) {
  const { person, jobId, jobTitle, extras, attachments } = payload;
  if (!person || !person.emailAddress) throw new Error('Person email is required');

  const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey);
  if (idempotencyKey) {
    const cachedResult = getCompletedIdempotencyResult(idempotencyKey);
    if (cachedResult) return cachedResult;
    const inFlight = inFlightIdempotency.get(idempotencyKey);
    if (inFlight) return inFlight;
  }

  const run = async (): Promise<SubmitApplicationResult> => {
    const normalized = (person.normalizedEmail || person.emailAddress).trim().toLowerCase();
    // Ensure base application status metadata is always set
    const baseExtras = {
      Status: '1a - Applicant',
      Source: 'Opportunity Board',
    };
    const mergedExtras = { ...baseExtras, ...(extras ?? {}) };
    delete (mergedExtras as Record<string, unknown>)['status'];
    delete (mergedExtras as Record<string, unknown>)['source'];

    // Find existing person
    const existing = await findPersonByNormalizedEmail(normalized);
    let personRecordId: string;
    if (existing) {
      personRecordId = existing.id;
    } else {
      const created = await createPerson({ ...person, normalizedEmail: normalized });
      if (!created) throw new Error('Failed to create person');
      personRecordId = created.id;
    }

    if (idempotencyKey) {
      const existingApplication = await findApplicationByIdempotencyKey(idempotencyKey);
      if (existingApplication) {
        return { personRecordId, applicationRecord: existingApplication };
      }
    }

    // Create application record linked to person
    const app = await createApplicationRecord(personRecordId, jobId, jobTitle, mergedExtras, idempotencyKey);
    // Attach CV / Resume via Airtable content API (requires existing record id)
    if (attachments?.cvResume && app?.id) {
      const attachmentField = process.env.AIRTABLE_APPLICATIONS_ATTACHMENT_FIELD || 'CV / Resume';
      const attachmentObj = await uploadAttachmentToAirtable(app.id, attachmentField, attachments.cvResume);
      try {
        const token = process.env.AIRTABLE_TOKEN;
        const baseId = process.env.AIRTABLE_BASE_ID;
        const appsTable = process.env.AIRTABLE_APPLICATIONS_TABLE;
        if (!token || !baseId || !appsTable) throw new Error('Missing Airtable env vars for applications');
        const updateUrl = airtableBaseUrl(baseId, appsTable);
        // Keep this patch best-effort. The content API upload already writes the attachment.
        const existing = (app as any)?.fields?.[attachmentField] ?? [];
        const existingItems = Array.isArray(existing)
          ? existing.map(asAttachmentPatchItem).filter(Boolean) as Record<string, string>[]
          : [];
        const uploadedItem = asAttachmentPatchItem(attachmentObj);
        const newArray = uploadedItem ? [...existingItems, uploadedItem] : existingItems;
        if (newArray.length === 0) {
          return { personRecordId, applicationRecord: app };
        }
        const res = await fetch(updateUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            records: [
              {
                id: app.id,
                fields: { [attachmentField]: newArray },
              },
            ],
          }),
        });
        if (!res.ok) {
          const d = await res.text();
          console.warn(`Airtable attachment patch warning: ${d}`);
        }
      } catch (err) {
        console.warn('Airtable attachment patch warning:', err);
      }
    }

    return { personRecordId, applicationRecord: app };
  };

  if (!idempotencyKey) return run();

  const request = run()
    .then((result) => {
      setCompletedIdempotencyResult(idempotencyKey, result);
      return result;
    })
    .finally(() => {
      inFlightIdempotency.delete(idempotencyKey);
    });

  inFlightIdempotency.set(idempotencyKey, request);
  return request;
}
