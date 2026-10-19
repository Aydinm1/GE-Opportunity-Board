# API Reference

All API routes are implemented as Next.js App Router route handlers under `app/api/*`.

## Base

- Local: `http://localhost:3000`
- Runtime: `nodejs`

## 1) `GET /api/jobs`

Fetches and normalizes role data from Airtable.

### Response: 200

```json
{
  "jobs": [
    {
      "id": "rec123",
      "roleTitle": "International Program Lead",
      "torUrl": "https://example.org/tor.pdf",
      "torDocuments": [{ "id": "att123", "filename": "TOR.pdf", "href": "/api/jobs/rec123/tor/att123" }],
      "roleStatus": "Actively Hiring",
      "programmeArea": "Global Encounters",
      "teamVertical": "Operations",
      "locationBase": "Remote",
      "workType": "Virtual",
      "roleType": "Volunteer",
      "startDate": "2026-01-15",
      "durationMonths": 6,
      "durationCategory": "3–6",
      "purposeShort": "...",
      "keyResponsibilities": ["..."],
      "requiredQualifications": ["..."],
      "otherQualifications": null,
      "preferredQualifications": ["..."],
      "additionalQualifications": null,
      "timeCommitment": "10-20 hours",
      "languagesRequired": ["English"]
    }
  ]
}
```

### Normalization logic

Performed in `lib/airtable.ts`:
- `Duration (Months)` parsed from number/string into `durationMonths`
- `durationCategory` derived from `Duration Categories` or bucketed fallback
- Bullet text fields converted to arrays
- Optional fields normalized to `null` when empty
- String/list fields normalized to `string[]` where required

### Errors

`500`

```json
{
  "error": "Failed to fetch jobs"
}
```

Possible underlying causes:
- Missing env vars (`AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `AIRTABLE_GEROLES_TABLE`)
- Airtable auth/table/view errors

## 2) `POST /api/applications`

Submits a candidate application to Airtable, reusing an existing Person by normalized email or creating one. Returning applicants' People profiles are not updated.

### Request body

`multipart/form-data`

Required text fields:
- `fullName`
- `emailAddress`
- `phoneNumber`
- `age`
- `gender`
- `countryOfOrigin`
- `countryOfLiving`
- `education`
- `profession`
- `jamatiExperience`
- `whyText`
- `jobId` (Airtable record ID for a published role in the configured jobs view)

Optional text fields:
- `linkedIn`
- `jobTitle`
- `website`
- `idempotencyKey`
- `formStartedAt`
- `submittedAt`

Required file field:
- `cvResume` (`.pdf`, `.doc`, `.docx`, `.txt`)

### Response: 200

```json
{
  "ok": true
}
```

Success returns no record IDs, Airtable records, or attachment URLs. Consumers of the former `result` property must adapt.

### Validation behavior

Server-side validation is strict and enforced in `lib/validation.ts`:
- Required form fields:
  - applicant identity/profile fields
  - `whyText`
  - `cvResume`
- String sanitization is applied (`NFKC` normalization, control-char stripping, whitespace collapsing).
- Email format is validated and normalized.
- Word limits are enforced on long-text fields (100 words max).
- Attachment validation enforces:
  - allowed extensions/content-types (`.pdf`, `.doc`, `.docx`, `.txt`)
  - valid uploaded file payload
  - max size 4MB (4 × 1024 × 1024 bytes), leaving multipart/form-field headroom under the [Vercel request limit](https://vercel.com/docs/functions/limitations)
  - filename safety checks (path separators are rejected)
  - extension and declared MIME type must agree
  - PDF, DOC, and DOCX must begin with their format signature; legacy DOC remains supported
  - TXT must be valid UTF-8 without binary control characters
- File signatures screen for format mismatches; they do not validate the full document or scan for malware. DOCX uses a ZIP signature, which other ZIP files can share.
- `jobId` is required and must match `^rec[A-Za-z0-9]+$`. Before writes, it must appear in the published roles list, including all Airtable pages and the configured view restriction. Unavailable roles return `400`; lookup failures fail the submission.
- Role eligibility uses the existing 300-second Airtable read cache; recent publication/view changes can take that long to appear.
- Anti-bot checks validate honeypot/timing metadata when provided.

### Write behavior

- Find the person by normalized email, creating one only when absent; lookup failures fail the request
- Create application record with:
  - `Status = 1a - Applicant`
  - `Source = Opportunity Board`
- Attach CV/Resume to the **application** using the Airtable content API and verify that it was saved
- Unknown application field names fail the request; application answers and other fields are never silently dropped
- Idempotency support:
  - optional request header: `X-Idempotency-Key: <unique-key>`
  - optional form field: `idempotencyKey`
  - header takes precedence when both are present
  - accepted key format: `A-Z a-z 0-9 . _ : -` (max 128 chars)
  - invalid key formats are rejected with `400`
  - an existing key must match the applicant, role, and normalized application answer; conflicts return `409`
  - matching retries reuse the saved application and upload its CV if missing; success requires a saved CV
  - completed and in-flight requests in the same process also compare a fingerprint of the submitted fields and CV bytes
  - across cold starts, existing CV bytes are not compared; duplicate prevention across instances is not guaranteed

See [submission recovery](submission-recovery.md) for verification behavior and remaining concurrency limits.

### Errors

Common error status codes:
- `400` validation/payload errors
- `409` submission key conflicts
- `429` rate limit exceeded
- `500` unexpected server/integration errors

Example `400`:

```json
{
  "error": "Expected multipart/form-data."
}
```

Other possible error messages:
- Validation failures (`400`)
- Rate limiting (`429`)
- Airtable create/update failures
- Attachment upload failures
- Missing Airtable env vars

## Removed Endpoints

As of the latest update, these legacy local-file endpoints have been removed:
- `POST /api/upload`
- `GET /uploads/[...path]`

All upload behavior now goes through `POST /api/applications` and Airtable attachment handling.


## `GET /api/jobs/[jobId]/tor/[attachmentId]`

Downloads an uploaded TOR for a published role in the configured Airtable jobs view. The route fetches fresh attachment data with `cache: no-store`, then streams the file from the validated HTTPS Airtable attachment CDN with `Content-Disposition: attachment` and a safely encoded filename. CDN redirects are rejected and Airtable credentials are not forwarded. All responses use `Cache-Control: no-store`. Query parameters cannot override the destination.

Returns `404` with a friendly JSON error when the role/document is unavailable, unpublished, excluded by the view, or has an unsafe URL. Returns `500` with a generic friendly JSON error on configuration or upstream failures.

The jobs response includes `torUrl` (validated link or `null`) and `torDocuments` (IDs, filenames and stable app links, never temporary download URLs). The UI prefers uploads, falls back to the link, and hides the section if neither is valid. Uploaded TORs download without opening a new tab; regular TOR links open in a new tab. Loading and friendly error messages appear beside the action.
