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

Submits candidate application, creating/updating People and Applications records in Airtable.

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

Optional text fields:
- `linkedIn`
- `jobId`
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
  "ok": true,
  "result": {
    "personRecordId": "recPerson123",
    "applicationRecord": {
      "id": "recApp123"
    }
  }
}
```

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
  - max size 10MB
  - filename safety checks (path separators are rejected)
- Anti-bot checks validate honeypot/timing metadata when provided.

### Write behavior

- Upsert person by normalized email
- Create application record with:
  - `Status = 1a - Applicant`
  - `Source = Opportunity Board`
- Attach CV/Resume using Airtable content API
- Retry logic for unknown Airtable field name errors in create application path
- Idempotency support:
  - optional request header: `X-Idempotency-Key: <unique-key>`
  - optional form field: `idempotencyKey`
  - header takes precedence when both are present
  - accepted key format: `A-Z a-z 0-9 . _ : -` (max 128 chars)
  - invalid key formats are rejected with `400`
  - repeated submissions with the same key return the same application result (prevents duplicate records from double-click/retry)

### Errors

Common error status codes:
- `400` validation/payload errors
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
