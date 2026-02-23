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

```json
{
  "person": {
    "fullName": "Jane Doe",
    "emailAddress": "jane@example.com",
    "phoneNumber": "+1 555 0100",
    "age": "25-34",
    "gender": "Female",
    "countryOfOrigin": "Canada",
    "countryOfLiving": "United States",
    "education": "Text...",
    "profession": "Text...",
    "jamatiExperience": "Text..."
  },
  "jobId": "recJob123",
  "extras": {
    "Why are you interested in or qualified for this job?": "Text..."
  },
  "attachments": {
    "cvResume": {
      "filename": "resume.pdf",
      "contentType": "application/pdf",
      "base64": "JVBERi0xLjc..."
    }
  }
}
```

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

Current server-side required check:
- `person.emailAddress` must exist

Client-side form enforces additional required fields before submit, including attachment and application answers.

### Write behavior

- Upsert person by normalized email
- Create application record with:
  - `Status = 1a - Applicant`
  - `Source = Opportunity Board`
- Attach CV/Resume using Airtable content API
- Retry logic for unknown Airtable field name errors in create application path

### Errors

`500`

```json
{
  "error": "Person email is required"
}
```

Other possible error messages:
- Airtable create/update failures
- Attachment upload failures
- Missing Airtable env vars

## 3) `POST /api/upload` (legacy helper)

Stores a base64 file to local `uploads/` folder and returns URL metadata.

### Request

```json
{
  "filename": "resume.pdf",
  "dataUrl": "data:application/pdf;base64,JVBERi0xLjc..."
}
```

### Success response: 200

```json
{
  "url": "http://localhost:3000/uploads/1700000000000-resume.pdf",
  "filename": "1700000000000-resume.pdf",
  "mimeType": "application/pdf"
}
```

### Validation and errors

- `400` if `filename` or `dataUrl` missing
- `400` if data URL is malformed
- `500` on write failures

## 4) `GET /uploads/[...path]` (legacy helper)

Serves files from local `uploads/` directory.

### Behavior

- Validates path traversal (`fullPath` must stay inside uploads dir)
- Infers content-type by extension
- Returns:
  - `200` file bytes
  - `400` invalid path
  - `404` file not found
