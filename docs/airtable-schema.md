# Airtable Schema (Engineering Notes)

This document captures the operational data model used by the GE Opportunity Board.

## Data Model Overview

```text
Jobs (GE Roles) 1 --- * Applications * --- 1 People
Jobs (GE Roles) 1 --- * Referrals (recommended table)
People          1 --- * Referrals (recommended table, if referral is tied to a person)
```

## Tables

## 1) Jobs (Airtable: `AIRTABLE_GEROLES_TABLE`)

Primary purpose: publish role metadata shown on the board.

Key fields used by app:
- `Role Title`
- `Displayed Status`
- `Published?`
- `Programme / Functional Area`
- `Team/Vertical`
- `Location / Base`
- `Work Type`
- `Role Type`
- `Start Date`
- `Duration (Months)`
- `Duration Categories`
- `Displayed Purpose of the Role`
- `Key Responsibilities`
- `10. Required Qualifications`
- `Other Required Qualifications`
- `Preferred Qualifications`
- `Additional Skill Notes`
- `Displayed Estimated Time Commitment`
- `Languages Required`

Suggested status enum:
- `Draft`
- `Published`
- `Closed`

Current UI status badges (display):
- `Actively Hiring`
- `Interviewing`
- `Screening Applicants`
- `Filled` / `Closed`

## 2) People (Airtable: `AIRTABLE_PEOPLE_TABLE`)

Primary purpose: canonical candidate record (upsert by email).

Key fields used by app:
- `Full Name`
- `Email Address`
- `Candidate Status`
- `Phone Number (incl. Country Code)`
- `LinkedIn Profile Link (if available)`
- `Age`
- `Gender`
- `Country of Origin`
- `Country of Living (Current Location)`
- `Jurisdiction`
- `Academic / Professional Education`
- `Profession / Occupation`
- `Jamati Experience`

Lookup behavior in code:
- First by `{normalized email}`
- Fallback to `LOWER({Email Address}) = normalizedEmail`

## 3) Applications (Airtable: `AIRTABLE_APPLICATIONS_TABLE`)

Primary purpose: track submissions linked to People and Jobs.

Key fields used by app:
- Link to People (`Person` by default, fallback `People`)
- Link to Jobs (`GE Roles`, when `jobId` provided)
- `CV / Resume` attachment field
- `Status` (set to `1a - Applicant` on submission)
- `Source` (set to `Opportunity Board` on submission)
- `Why are you interested in or qualified for this job?` (via extras payload)
- Optional idempotency field (recommended): `Idempotency Key`

Suggested pipeline enum:
- `1a - Applicant`
- `1b - Screened`
- `2 - Interview`
- `3 - Offer`
- `4 - Hired`
- `Closed - Not Selected`

## 4) Referrals (recommended table)

This table is included to support the internal recommender workflow.

Suggested fields:
- `Referral ID` (formula/autonumber)
- `Job` (link to Jobs)
- `Candidate` (link to People or email/name fields when candidate does not exist yet)
- `Recommender Name`
- `Recommender Email`
- `Recommender Team/Department`
- `Referral Note`
- `Referral Status` (enum below)
- `Created At`

Suggested status enum:
- `Submitted`
- `Reviewed`
- `Forwarded`
- `Declined`

## Validation Rules

## Client-side validation (current behavior)

Required application fields:
- Full Name
- Email
- Phone
- Age
- Gender
- Country of Origin
- Current Country
- Education
- Profession
- Jamati Experience
- Why interested/qualified
- CV/Resume attachment

Text constraints:
- 100-word cap on:
  - Education
  - Profession
  - Jamati Experience
  - Why interested/qualified

File constraints:
- Accepted types: `.pdf`, `.doc`, `.docx`, `.txt`

## API-side validation (current behavior)

- `/api/applications` validates full payload shape (person details, extras answer, CV attachment)
- String inputs are sanitized (normalization + control-character stripping) before write operations
- Email format, word limits, file type/content-type, and file size are validated server-side
- Anti-bot metadata checks are applied when meta fields are provided
- Airtable write path enforces schema compatibility by retrying on unknown fields
- Attachment upload requires valid base64 payload and existing application record
- Idempotency keys are strictly format-validated (`A-Z a-z 0-9 . _ : -`, max 128) when supplied
- Optional idempotency keys prevent duplicate application creation on retries/double submits

Recommended server hardening:
- Durable idempotency storage (for cross-instance replay safety)
