# Checking Airtable compatibility

Run `npm run test:airtable` from a configured checkout. This reads base metadata and country-directory reference records;
no records, options, or fields are created or modified. A nonzero exit means the
check failed: read the reported table, field, type, or missing option. Do not
weaken the contract to silence a mismatch without checking how the app writes it.

The contract covers the fields the app reads/writes in GE Roles, People, and
Applications, and the country directory. Required fields and incompatible types fail. Missing optional role
fields warn. Select choices are case-sensitive; text variants explicitly allowed
by the contract do not require select choices. Extra choices are accepted only
where the contract uses `contains`. Unrelated fields are ignored.

Current Country is required to be a linked-record field targeting the configured
country directory. Jurisdiction must be a lookup through that link to the directory
Jurisdiction field. The live check also resolves every supported country against
uncached directory records; missing or ambiguous mappings fail. This closes the
previous gap where a linked field passed metadata checks even though the app sent
a plain string. `AIRTABLE_COUNTRIES_TABLE` optionally selects the directory by ID
or name; it defaults to `Country / Jurisdiction Table`. The workflow can use the
default without another variable.

## GitHub manual check

After this workflow reaches `main`, open Actions → Airtable schema check → Run
workflow, selecting `main`. Configure the credential boundary in GitHub Settings
→ Environments, not just in the workflow YAML:

- Create the `airtable-schema` environment. Under deployment branches and tags,
  choose **Selected branches and tags**, add only the **branch** `main`, and add
  no tag rules. The job references this environment; GitHub enforces its branch
  restriction before making environment secrets available.
- The workflow's `github.ref` condition only avoids accidental runs. A branch
  can edit its own YAML, so that condition alone does not protect a repository
  secret.

- **Environment secret** `AIRTABLE_SCHEMA_TOKEN` in `airtable-schema`: a dedicated PAT with
  `schema.bases:read` and `data.records:read` scopes, limited to the configured base. The second scope is needed to validate actual country record IDs/names, which metadata does not contain; no write scope is needed. Do not reuse
  the production write token. Do not also store this credential as a repository
  or organization secret; those copies would bypass the environment boundary.
  If migrating an existing repository secret, remove that copy before use.
- Repository variables `AIRTABLE_BASE_ID`, `AIRTABLE_GEROLES_TABLE`,
  `AIRTABLE_PEOPLE_TABLE`, and `AIRTABLE_APPLICATIONS_TABLE`: match deployment
  configuration; table names or IDs are supported.

Missing configuration fails clearly. The workflow is manual, not scheduled; a
change made directly in Airtable is detected the next time it runs. Normal PR CI
runs deterministic schema-comparison, rendered-dropdown, validation, and API
payload tests without access to Airtable credentials.

## Gender casing

The configured base uses `male` / `female`. The app submits those exact values
while displaying “Male” / “Female”. `Non-Binary` and `Prefer not to share` retain
their existing casing. The case-sensitive schema check detects future changes;
no Airtable schema modification is needed.

## Staff review of saved fallback answers

If a new person's optional demographic field cannot be saved, the same People
create request writes a note into the existing **Notes RE: Candidate** field:

```text
[Opportunity Board: DATA REVIEW REQUIRED]
...
Country of Birth: United States
Country of Living (Current Location): United States
```

When a refused value matches several fields, all matching fields must be on the
permitted demographic list; otherwise submission still fails. Age, Candidate
Status, identity/contact fields, application answers, and CV are not dropped.
The record-ID compatibility fallback for linked Current Country/Jurisdiction
also preserves original answers in this note. No new field is created.

Staff can filter **People → Notes RE: Candidate contains
`[Opportunity Board: DATA REVIEW REQUIRED]`**, or open the linked People record
from Applications. After correcting the options or linked-record mapping and
restoring the structured answers, change the note's header to
`[Opportunity Board: REVIEW RESOLVED]`. The note retains the original answers.
This does not send an email or create a view automatically.

The notes field is required by the schema contract. If writing it fails, the
fallback must not return success. It is written only when creating a new People
record, so returning applicants' existing staff notes are never overwritten.
Submitted values stay in Airtable; diagnostic logs and Sentry contain field
names and error types/statuses, not the original answers.

## Limits and release checks

Metadata checks do not verify arbitrary formula results, applicant field contents, write permissions,
network availability, or successful attachment uploads. API tests use mocked
Airtable responses; a green suite does not prove production writes work. On the
preview, verify a clearly marked new applicant and a returning applicant, including
Age 18–24, Female, and both countries United States. Check saved answers and CV.
Verify mobile/desktop and the actual parent embed before deployment. Any live
synthetic submission requires explicit authorization and a cleanup arrangement.

CV retry recovery, required-answer preservation under renamed fields, upload-size
boundaries, and browser error presentation receive regression tests with their
respective fixes (#43, #44, and #46), rather than accepting failing tests here.

Current Country record mapping, fallback semantics and backfill procedure:
[current-country mapping](current-country-mapping.md).
