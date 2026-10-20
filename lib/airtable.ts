import { traceApplicationStep } from './application-tracing';
import { createHash } from 'node:crypto';
import { CURRENT_COUNTRY_FIELD, resolveCountryRecord } from './country-records';
import type { Person } from './types';
import { APPLICANT_STATUS, OPPORTUNITY_BOARD_SOURCE } from './application-select-options';
import { AppError } from './errors';
import { airtableRequestError, parseAirtableError } from './airtable-errors';
import { captureServerException } from './monitoring';
import { normalizeDocumentUrl, normalizeTorDocuments } from './tor';
import { splitBullets, parseDurationMonths, bucketFromMonths, asStringArray, asOptionalTrimmedString } from './utils';

type AirtableRecord<T> = { id: string; fields: T; createdTime: string };
type AirtableListResponse<T> = { records: AirtableRecord<T>[]; offset?: string };
type AttachmentInput = { filename: string; contentType: string; bytes: Uint8Array };
type SubmitApplicationResult = { personRecordId: string; applicationRecord: AirtableRecord<AirtableApplicationFields> };

const IDEMPOTENCY_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_IDEMPOTENCY_CACHE_KEYS = 5000;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const JOBS_CACHE_TTL_SECONDS = 300;
const JOBS_CACHE_TAG = 'jobs';
const JOBS_REQUIRED_QUERY_FIELDS = [
  'Role Title',
  'Programme / Functional Area',
  'Team/Vertical',
  'Displayed Status',
  'Published?',
  'Location / Base',
  'Work Type',
  'Role Type',
  'Start Date',
  'Duration (Months)',
  'Duration Categories',
  'Displayed Purpose of the Role',
  'Key Responsibilities',
  '10. Required Qualifications',
  'Other Required Qualifications',
  'Preferred Qualifications',
  'Displayed Estimated Time Commitment',
  'Languages Required',
] as const;
const JOBS_OPTIONAL_QUERY_FIELDS = [
  'TOR',
  'TOR Upload',
  'Point form of essential skills, education & experience',
] as const;
const JOBS_QUERY_FIELDS = [...JOBS_REQUIRED_QUERY_FIELDS, ...JOBS_OPTIONAL_QUERY_FIELDS] as const;
const JOBS_PUBLISHED_FORMULA = '{Published?}=1';
const APPLICATION_PERSON_LINK_FIELD = 'People';
const APPLICATION_JOB_LINK_FIELD = 'GE Roles';
const APPLICATION_ATTACHMENT_FIELD = 'CV / Resume';
const APPLICATION_IDEMPOTENCY_FIELD = 'Idempotency Key';
// Refreshing cannot fix an option Airtable refuses, and it would clear the form, so this copy never suggests it.
const FRIENDLY_SELECT_OPTION_ERROR = 'We couldn\'t submit your application because one of your selected answers could not be saved. Your answers are still on this page. Please try again later, and let the Global Encounters team know if this keeps happening.';
const PERSON_SELECT_FIELDS = ['Candidate Status', 'Age', 'Gender', 'Country of Birth'] as const;
const OPTIONAL_PERSON_SELECT_FIELDS = new Set<string>(['Gender', 'Country of Birth']);
const PERSON_REVIEW_NOTES_FIELD = 'Notes RE: Candidate';
const PERSON_REVIEW_MARKER = '[Opportunity Board: DATA REVIEW REQUIRED]';
const MAX_PERSON_CREATE_RETRIES = 3;
const inFlightIdempotency = new Map<string, { scope: string; request: Promise<SubmitApplicationResult> }>();
const completedIdempotency = new Map<string, { scope: string; result: SubmitApplicationResult; expiresAt: number }>();

type AirtableJobFields = {
  "TOR"?: string;
  "TOR Upload"?: AirtableAttachment[];
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
  "Point form of essential skills, education & experience"?: string;

  "Displayed Estimated Time Commitment"?: string;

  "Languages Required"?: string[] | string;
};

type AirtablePeopleFields = {
  "Full Name"?: string;
  "Candidate Status"?: string;
  "Email Address"?: string;
  "Phone Number (incl. Country Code)"?: string;
  "LinkedIn Profile Link (if available)"?: string;
  "Age"?: string;
  "Gender"?: string;
  "Country of Birth"?: string;
  "Country of Living (Current Location)"?: string;
  "Jurisdiction"?: string;
  "Academic / Professional Education"?: string;
  "Current Profession / Occupation"?: string;
  "Jamati Experience"?: string;
  "normalized email"?: string;
  [key: string]: unknown;
};

type AirtableAttachment = {
  id?: string;
  url?: string;
  filename?: string;
  [key: string]: unknown;
};

type AirtableApplicationFields = {
  "People"?: string[];
  "GE Roles"?: string[];
  "Status"?: string;
  "Source"?: string;
  "Why are you interested in or qualified for this job?"?: string;
  "CV / Resume"?: AirtableAttachment[];
  "Idempotency Key"?: string;
  [key: string]: unknown;
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

function getCompletedIdempotencyResult(key: string, scope: string): SubmitApplicationResult | null {
  const entry = completedIdempotency.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    completedIdempotency.delete(key);
    return null;
  }
  assertSameSubmissionScope(entry.scope, scope);
  return entry.result;
}

function setCompletedIdempotencyResult(key: string, scope: string, result: SubmitApplicationResult) {
  pruneCompletedIdempotency();
  completedIdempotency.set(key, { scope, result, expiresAt: Date.now() + IDEMPOTENCY_CACHE_TTL_MS });
}

function buildJobsRequestUrl(baseId: string, table: string, view: string | undefined, fieldNames: readonly string[], offset?: string) {
  const params = new URLSearchParams();
  params.set('pageSize', '100');
  if (offset) params.set('offset', offset);
  params.set('filterByFormula', JOBS_PUBLISHED_FORMULA);
  if (view) {
    params.set('view', view);
  }
  for (const fieldName of fieldNames) {
    params.append('fields[]', fieldName);
  }

  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?${params.toString()}`;
}

function parseUnknownFieldName(details: string) {
  try {
    const parsed = JSON.parse(details) as {
      error?: { type?: string; message?: string };
    };
    if (parsed.error?.type !== 'UNKNOWN_FIELD_NAME' || typeof parsed.error.message !== 'string') {
      return null;
    }

    const match = parsed.error.message.match(/Unknown field name: "([^"]+)"/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
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

  const optionalFields = new Set<string>(JOBS_OPTIONAL_QUERY_FIELDS);
  const skippedOptionalFields = new Set<string>();
  let requestedFields: string[] = [...JOBS_QUERY_FIELDS];
  const records: AirtableRecord<AirtableJobFields>[] = [];
  let offset: string | undefined;
  const seenOffsets = new Set<string>();

  while (true) {
    const res = await fetchFromAirtable(buildJobsRequestUrl(baseId, table, view, requestedFields, offset), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'force-cache',
      next: { revalidate: JOBS_CACHE_TTL_SECONDS, tags: [JOBS_CACHE_TAG] },
    });

    if (res.ok) {
      const page = (await readAirtableJson(res)) as AirtableListResponse<AirtableJobFields>;
      if (!Array.isArray(page.records)) throw new Error('Invalid Airtable jobs response');
      records.push(...page.records);
      if (!page.offset) break;
      if (typeof page.offset !== 'string' || seenOffsets.has(page.offset)) {
        throw new Error('Invalid Airtable jobs pagination');
      }
      seenOffsets.add(page.offset);
      offset = page.offset;
      continue;
    }

    const details = await res.text();
    const unknownFieldName = parseUnknownFieldName(details);
    if (unknownFieldName && optionalFields.has(unknownFieldName) && requestedFields.includes(unknownFieldName)) {
      // Restart the list so every page uses the same optional field selection.
      records.length = 0;
      offset = undefined;
      seenOffsets.clear();
      skippedOptionalFields.add(unknownFieldName);
      requestedFields = requestedFields.filter((fieldName) => fieldName !== unknownFieldName);
      console.warn('Airtable jobs query skipped missing optional field', {
        fieldName: unknownFieldName,
      });
      continue;
    }

    throw airtableRequestError('Airtable jobs request failed', res.status, details);
  }

  if (skippedOptionalFields.size > 0) {
    console.warn('Airtable jobs response loaded without optional fields', {
      fieldNames: Array.from(skippedOptionalFields),
    });
  }

  const jobs = records.map((r) => {
    const durationMonths = parseDurationMonths(r.fields["Duration (Months)"]);
    const durationCategory =
      r.fields["Duration Categories"] ?? bucketFromMonths(durationMonths);

    return {
      id: r.id,
      torUrl: normalizeDocumentUrl(r.fields.TOR),
      torDocuments: normalizeTorDocuments(r.id, r.fields["TOR Upload"]),

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
      additionalQualifications: asOptionalTrimmedString(r.fields["Point form of essential skills, education & experience"]),

      timeCommitment: r.fields["Displayed Estimated Time Commitment"] ?? null,

      languagesRequired: asStringArray(r.fields["Languages Required"]),
    };
  });

  return { jobs };
}

export async function getTorAttachment(jobId: string, attachmentId: string): Promise<{ url: string; filename: string | null }> {
  const unavailable = () => new AppError('This TOR document is no longer available. Please return to the role and refresh.', { status: 404 });
  if (!/^rec[A-Za-z0-9]+$/.test(jobId) || !/^att[A-Za-z0-9]+$/.test(attachmentId)) throw unavailable();
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_GEROLES_TABLE;
  if (!token || !baseId || !table) throw new Error('Missing Airtable configuration for TOR documents');
  const url = new URL(buildJobsRequestUrl(baseId, table, process.env.AIRTABLE_JOBS_VIEW, ['Published?', 'TOR Upload']));
  url.searchParams.set('filterByFormula', `AND(${JOBS_PUBLISHED_FORMULA},RECORD_ID()='${jobId}')`);
  url.searchParams.set('maxRecords', '1');
  const response = await fetchFromAirtable(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    const details = await response.text();
    if (response.status === 404 || parseUnknownFieldName(details) === 'TOR Upload') throw unavailable();
    throw new Error(`Airtable TOR request failed (${response.status})`);
  }
  const data = await readAirtableJson(response) as AirtableListResponse<AirtableJobFields>;
  const role = data.records.find((record) => record.id === jobId && Boolean(record.fields['Published?']));
  const attachments = role?.fields['TOR Upload'];
  const attachment = Array.isArray(attachments) ? attachments.find((item) => item?.id === attachmentId) : undefined;
  const destination = normalizeDocumentUrl(attachment?.url);
  if (!destination) throw unavailable();
  return { url: destination, filename: asOptionalTrimmedString(attachment?.filename) };
}

// --- Airtable write helpers ---

function airtableBaseUrl(baseId: string, tableName: string) {
  return `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
}

// Airtable names the refused value, not the field: `... create new select option ""Female""`.
function parseRefusedSelectOption(details: string): string | null {
  const error = parseAirtableError(details);
  if (error?.type !== 'INVALID_MULTIPLE_CHOICE_OPTIONS' || typeof error.message !== 'string') return null;
  const match = error.message.match(/select option\s+"+([^"]+)"+/i);
  return match?.[1] ?? null;
}

function toAirtableWriteError(prefix: string, details: string, status?: number): Error {
  const error = parseAirtableError(details);
  if (error?.type === 'INVALID_MULTIPLE_CHOICE_OPTIONS') {
    const appError = new AppError(FRIENDLY_SELECT_OPTION_ERROR, {
      status: 400,
      code: 'INVALID_SELECT_OPTION',
    });
    // Error causes are logged: retain diagnostics, never the response message or applicant values.
    appError.cause = {
      operation: prefix,
      airtableErrorType: error.type,
      status,
    };
    return appError;
  }

  return airtableRequestError(prefix, status, details);
}

function selectFieldsHoldingRefusedOption(details: string, fields: Record<string, unknown>): string[] {
  const refused = parseRefusedSelectOption(details);
  if (!refused) return [];
  return PERSON_SELECT_FIELDS.filter((field) => typeof fields[field] === 'string' && (fields[field] as string).trim() === refused.trim());
}

async function findPersonByNormalizedEmail(normalizedEmail: string): Promise<AirtableRecord<AirtablePeopleFields> | null> {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const peopleTable = process.env.AIRTABLE_PEOPLE_TABLE;
  if (!token || !baseId || !peopleTable) throw new Error('Missing Airtable env vars for people');

  const formula = `({normalized email} = '${escapeFormulaValue(normalizedEmail)}')`;
  const url = `${airtableBaseUrl(baseId, peopleTable)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const res = await fetchFromAirtable(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (res.ok) {
    const json = await readAirtableJson(res) as AirtableListResponse<AirtablePeopleFields>;
    if (json.records?.length) return json.records[0];
  } else {
    const details = await res.text();
    const error = parseAirtableError(details);
    const missingNormalizedField = res.status === 422 &&
      (error?.type === 'INVALID_FILTER_BY_FORMULA' || error?.type === 'UNKNOWN_FIELD_NAME') &&
      /unknown field(?: names?)?:?\s*["']?normalized email["']?/i.test(error.message ?? '');
    if (!missingNormalizedField) throw airtableRequestError('Airtable normalized email lookup failed', res.status, details);
  }

  // Support legacy records or a missing normalized-email field, not arbitrary lookup failures.
  const emailFormula = `(LOWER({Email Address}) = '${escapeFormulaValue(normalizedEmail)}')`;
  const emailUrl = `${airtableBaseUrl(baseId, peopleTable)}?maxRecords=1&filterByFormula=${encodeURIComponent(emailFormula)}`;
  const fallback = await fetchFromAirtable(emailUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!fallback.ok) throw airtableRequestError('Airtable email lookup failed', fallback.status, await fallback.text());
  const json = await readAirtableJson(fallback) as AirtableListResponse<AirtablePeopleFields>;
  return json.records?.[0] ?? null;
}

async function createPerson(person: Person): Promise<AirtableRecord<AirtablePeopleFields> | null> {
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
  if (person.education && person.education.trim() !== '') fields['Academic / Professional Education'] = person.education.trim();
  if (person.profession && person.profession.trim() !== '') fields['Current Profession / Occupation'] = person.profession.trim();
  if (person.jamatiExperience && person.jamatiExperience.trim() !== '') fields['Jamati Experience'] = person.jamatiExperience.trim();

  const url = airtableBaseUrl(baseId, peopleTable);
  const submittedFields = { ...fields };
  const omissions: Array<{ field: string; airtableErrorType: string; status?: number }> = [];
  if (typeof fields[CURRENT_COUNTRY_FIELD] === 'string') {
    const country = await traceApplicationStep('country_lookup', () => resolveCountryRecord(fields[CURRENT_COUNTRY_FIELD] as string));
    if (country.kind === 'resolved') fields[CURRENT_COUNTRY_FIELD] = [country.id];
    else {
      delete fields[CURRENT_COUNTRY_FIELD];
      omissions.push({ field: CURRENT_COUNTRY_FIELD, airtableErrorType: country.kind === 'missing' ? 'COUNTRY_RECORD_MISSING' : 'COUNTRY_RECORD_AMBIGUOUS' });
    }
  }
  const withReviewNotes = (values: Record<string, unknown>) => omissions.length ? {
    ...values,
    [PERSON_REVIEW_NOTES_FIELD]: [
      PERSON_REVIEW_MARKER,
      'The following submitted answers could not be saved in their structured fields.',
      'Staff: correct the configuration or linked-record mapping, restore these answers, then change the header to [Opportunity Board: REVIEW RESOLVED].',
      ...omissions.map(({ field }) => `${field}: ${String(submittedFields[field])}`),
    ].join('\n'),
  } : values;
  let attemptFields: Record<string, unknown> = withReviewNotes(fields);

  for (let attempt = 0; ; attempt += 1) {
    const res = await fetchFromAirtable(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [{ fields: attemptFields }] }),
    });

    if (res.ok) {
      const json = await readAirtableJson(res) as AirtableListResponse<AirtablePeopleFields>;
      const created = json.records?.[0] ?? null;
      if (created && omissions.length > 0) reportPersonReviewFallback(omissions);
      return created;
    }

    const d = await res.text();
    if (attempt >= MAX_PERSON_CREATE_RETRIES) {
      throw toAirtableWriteError('Airtable create person failed', d, res.status);
    }

    // A refused select option (schema drift in Airtable) should not block the applicant:
    // create the person without that field and report it so staff can fix the option.
    const refusedFields = selectFieldsHoldingRefusedOption(d, attemptFields);
    const dropFields: readonly string[] = refusedFields.length > 0 && refusedFields.every((field) => OPTIONAL_PERSON_SELECT_FIELDS.has(field))
      ? refusedFields
      : [];
    if (dropFields.length === 0) {
      throw toAirtableWriteError('Airtable create person failed', d, res.status);
    }

    for (const field of dropFields) {
      omissions.push({ field, airtableErrorType: parseAirtableError(d)?.type ?? 'UNKNOWN_ERROR', status: res.status });
    }
    attemptFields = { ...attemptFields };
    for (const field of dropFields) delete attemptFields[field];
    // Save the original answers atomically with the new person. If notes cannot be
    // written, creation fails; never accept an unflagged omission or overwrite an existing person's notes.
    attemptFields = withReviewNotes(attemptFields);
  }
}

function reportPersonReviewFallback(omissions: Array<{ field: string; airtableErrorType: string; status?: number }>) {
  const meta = {
    context: '/api/applications',
    operation: 'create_person_review_fallback',
    // Flat primitive arrays survive Sentry's default context normalization depth.
    omittedFields: omissions.map(item => item.field),
    airtableErrorTypes: omissions.map(item => item.airtableErrorType),
    omissionStatuses: omissions.flatMap(item => item.status === undefined ? [] : [item.status]),
  };
  console.warn('People profile needs staff review; submitted answers preserved in notes', meta);
  captureServerException(
    new Error('People profile needs staff review; submitted answers preserved in notes'),
    meta
  );
}

async function findApplicationByIdempotencyKey(idempotencyKey: string): Promise<AirtableRecord<AirtableApplicationFields> | null> {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const appsTable = process.env.AIRTABLE_APPLICATIONS_TABLE;
  if (!token || !baseId || !appsTable) throw new Error('Missing Airtable env vars for applications');

  const escapedKey = escapeFormulaValue(idempotencyKey);
  const formula = `({${APPLICATION_IDEMPOTENCY_FIELD}} = '${escapedKey}')`;
  const url = `${airtableBaseUrl(baseId, appsTable)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const res = await fetchFromAirtable(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });

  if (!res.ok) {
    const details = await res.text();
    throw airtableRequestError('Airtable idempotency lookup failed', res.status, details);
  }

  const json = await readAirtableJson(res) as AirtableListResponse<AirtableApplicationFields>;
  return json.records && json.records.length > 0 ? json.records[0] : null;
}

async function createApplicationRecord(
  personRecordId: string,
  jobId?: string | null,
  jobTitle?: string | null,
  extras?: Record<string, unknown>,
  idempotencyKey?: string | null
): Promise<AirtableRecord<AirtableApplicationFields>> {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const appsTable = process.env.AIRTABLE_APPLICATIONS_TABLE;
  if (!token || !baseId || !appsTable) throw new Error('Missing Airtable env vars for applications');
  const baseUrl = airtableBaseUrl(baseId, appsTable);

  // Build common payload fields (only include non-empty values) — do NOT include job title (avoid unknown field errors)
  const baseFields: Record<string, unknown> = {};
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) baseFields[k] = v;
    }
  }
  baseFields[APPLICATION_PERSON_LINK_FIELD] = [personRecordId];
  if (jobId && jobId.trim() !== '') baseFields[APPLICATION_JOB_LINK_FIELD] = [jobId];
  if (idempotencyKey) baseFields[APPLICATION_IDEMPOTENCY_FIELD] = idempotencyKey;

  // Every field currently written here is required for a complete application.
  // A renamed column must fail visibly instead of removing an applicant's answer.
  const res = await fetchFromAirtable(baseUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields: baseFields }] }),
  });
  if (!res.ok) throw toAirtableWriteError('Airtable create application failed', await res.text(), res.status);
  const json = await readAirtableJson(res) as AirtableListResponse<AirtableApplicationFields>;
  const record = json.records?.[0];
  if (!record?.id || !record.fields) throw new Error('Airtable application create returned no record');
  return record;
}

async function uploadAttachmentToAirtable(recordId: string, fieldName: string, attachment: AttachmentInput) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) throw new Error('Missing Airtable env vars for attachments');

  const uploadUrl = `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;
  const res = await fetchFromAirtable(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: attachment.contentType,
      file: Buffer.from(attachment.bytes).toString('base64'),
      filename: attachment.filename,
    }),
  });
  if (!res.ok) {
    const d = await res.text();
    throw airtableRequestError('Airtable upload attachment failed', res.status, d);
  }
  const data = await readAirtableJson(res) as {
    attachment?: AirtableAttachment;
    fields?: Record<string, unknown>;
    id?: string;
    url?: string;
  };
  // The content API writes the target attachment field itself. Do not PATCH a
  // stale attachment array over its result, or infer a CV from unrelated fields.
  if (data?.fields && data.id !== recordId) throw new Error('Airtable CV upload returned a different record');
  const target = data?.fields?.[fieldName];
  const uploaded = Array.isArray(target)
    ? target.filter(isSavedAttachment)
    : isSavedAttachment(data?.attachment) ? [data.attachment]
      : isSavedAttachment(data) ? [data] : [];
  if (uploaded.length > 0) return uploaded;

  // Airtable's official upload response keys fields by ID. Read the known
  // record back by field name instead of guessing which ID represents its CV.
  if (data?.id === recordId && data.fields && typeof data.fields === 'object') {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const appsTable = process.env.AIRTABLE_APPLICATIONS_TABLE;
    if (!baseId || !appsTable) throw new Error('Missing Airtable configuration for CV verification');
    return traceApplicationStep('cv_verify', async () => {
      const verification = await fetchFromAirtable(`${airtableBaseUrl(baseId, appsTable)}/${encodeURIComponent(recordId)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      if (!verification.ok) throw airtableRequestError('Airtable CV verification failed', verification.status, await verification.text());
      const saved = await readAirtableJson(verification) as AirtableRecord<AirtableApplicationFields>;
      const cv = saved?.fields?.[fieldName];
      if (saved?.id === recordId && Array.isArray(cv) && cv.some(isSavedAttachment)) return cv.filter(isSavedAttachment);
      throw new Error('Airtable CV upload could not be verified in the target field');
    });
  }
  throw new Error('Airtable CV upload could not be verified in the target field');
}

function isSavedAttachment(value: unknown): value is AirtableAttachment {
  if (!value || typeof value !== 'object') return false;
  const attachment = value as AirtableAttachment;
  return (typeof attachment.id === 'string' && /^att[A-Za-z0-9]+$/.test(attachment.id)) || Boolean(normalizeDocumentUrl(attachment.url));
}

function submissionConflict() {
  return new AppError('This submission conflicts with an earlier attempt. Your answers are still on this page. Please contact the Global Encounters team if this continues.', {
    status: 409, code: 'SUBMISSION_CONFLICT',
  });
}

function assertSameSubmissionScope(actual: string, expected: string) {
  if (actual !== expected) throw submissionConflict();
}

function assertMatchingApplication(app: AirtableRecord<AirtableApplicationFields>, personId: string | undefined, jobId: string | null, whyText: unknown) {
  const people = app.fields?.[APPLICATION_PERSON_LINK_FIELD];
  const roles = app.fields?.[APPLICATION_JOB_LINK_FIELD];
  const matchingRole = jobId ? Array.isArray(roles) && roles.includes(jobId) : !roles || roles.length === 0;
  const normalizeAnswer = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : null;
  const savedAnswer = normalizeAnswer(app.fields?.['Why are you interested in or qualified for this job?']);
  if (!personId || !Array.isArray(people) || !people.includes(personId) || !matchingRole || !savedAnswer || savedAnswer !== normalizeAnswer(whyText)) {
    throw submissionConflict();
  }
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

  const normalized = person.emailAddress.trim().toLowerCase();
  const roleId = jobId?.trim() || null;
  const sorted = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
  const cv = attachments?.cvResume;
  // Keep only a fingerprint in cache metadata. Changed requests cannot reuse a
  // completed/in-flight success merely because their email and role are the same.
  const scope = createHash('sha256').update(JSON.stringify({
    person: sorted({ ...person, emailAddress: normalized, normalizedEmail: normalized }),
    roleId,
    extras: sorted(extras ?? {}),
    cv: cv ? { filename: cv.filename, contentType: cv.contentType, hash: createHash('sha256').update(cv.bytes).digest('hex') } : null,
  })).digest('hex');
  const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey);
  if (idempotencyKey) {
    const cachedResult = getCompletedIdempotencyResult(idempotencyKey, scope);
    if (cachedResult) return cachedResult;
    const inFlight = inFlightIdempotency.get(idempotencyKey);
    if (inFlight) {
      assertSameSubmissionScope(inFlight.scope, scope);
      return inFlight.request;
    }
  }

  const run = async (): Promise<SubmitApplicationResult> => {
    const mergedExtras = { ...extras, Status: APPLICANT_STATUS, Source: OPPORTUNITY_BOARD_SOURCE };
    delete (mergedExtras as Record<string, unknown>)['status'];
    delete (mergedExtras as Record<string, unknown>)['source'];

    const existing = await traceApplicationStep('person_lookup', () => findPersonByNormalizedEmail(normalized));
    let app = idempotencyKey ? await traceApplicationStep('idempotency_lookup', () => findApplicationByIdempotencyKey(idempotencyKey)) : null;
    let personRecordId: string;
    if (app) {
      // Check both links before any write, including when a new applicant reuses someone else's key.
      assertMatchingApplication(app, existing?.id, roleId, mergedExtras['Why are you interested in or qualified for this job?']);
      personRecordId = existing!.id;
    } else {
      const savedPerson = existing ?? await traceApplicationStep('person_create', async () => {
        const created = await createPerson({ ...person, normalizedEmail: normalized });
        if (!created) throw new Error('Failed to create person');
        return created;
      });
      personRecordId = savedPerson.id;
      app = await traceApplicationStep('application_create', () => createApplicationRecord(personRecordId, roleId, jobTitle, mergedExtras, idempotencyKey));
    }

    // A retry may find the application created before a failed upload. Finish
    // that record; success is cached only after the CV is already saved or uploaded.
    const cv = app.fields[APPLICATION_ATTACHMENT_FIELD];
    if (!Array.isArray(cv) || !cv.some(isSavedAttachment)) {
      if (!attachments?.cvResume) throw new Error('A CV is required to complete the application');
      const applicationId = app.id;
      const resume = attachments.cvResume;
      const uploaded = await traceApplicationStep('cv_upload', () => uploadAttachmentToAirtable(applicationId, APPLICATION_ATTACHMENT_FIELD, resume));
      app = { ...app, fields: { ...app.fields, [APPLICATION_ATTACHMENT_FIELD]: uploaded } };
    }
    return { personRecordId, applicationRecord: app };
  };

  if (!idempotencyKey) return run();
  const request = run()
    .then(result => {
      setCompletedIdempotencyResult(idempotencyKey, scope, result);
      return result;
    })
    .finally(() => { inFlightIdempotency.delete(idempotencyKey); });
  inFlightIdempotency.set(idempotencyKey, { scope, request });
  return request;
}

async function fetchFromAirtable(...args: Parameters<typeof fetch>) {
  try {
    return await fetch(...args);
  } catch {
    throw new Error('Airtable network request failed');
  }
}

async function readAirtableJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // JSON parser messages can include a snippet of the private response body.
    throw new Error('Airtable returned invalid JSON');
  }
}
