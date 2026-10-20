# Current Country linked-record mapping

Current Country in People is a link to `Country / Jurisdiction Table`, not a select
field. Airtable expects an array of record IDs. Jurisdiction is derived by a lookup
through that link and must not be written by the application.

The old submission path sent a country-name string. Airtable rejected it with 422,
and the compatibility fallback created the profile without that link, preserving
the original country in `Notes RE: Candidate`. The resulting alert could look like
a refused select option even when the application and CV subsequently saved.

## Resolution

For new People records, read all pages of the country directory (`Name` and
`Jurisdiction`) and match the submitted country after NFKC normalization, trimming,
whitespace normalization and case folding. There is no fuzzy country matching.

- One matching record: use its ID.
- Duplicate names: use a record only when exactly one candidate has a nonblank
  Jurisdiction. The live directory contains older unassigned duplicates alongside
  assigned records; preferring exact case alone can choose the unassigned row.
- No match, or remaining ambiguity: preserve the original answer in the staff
  review note in the same People create request. Do not guess or create records.
- Network, permission, malformed-response and later-page failures: fail before
  creating People or Applications; do not treat an unavailable directory as empty.

Only the complete, validated directory is cached in process memory for five minutes.
Every Airtable page is fetched with `cache: 'no-store'`: pagination cursors are
temporary and must never be retained in the Next.js fetch cache. Concurrent reads
share a complete refresh; cold starts simply load the directory again. Snapshots
are scoped to the token/base/table configuration. Live schema checks bypass this
snapshot. An expired snapshot is never served after a failed refresh.

If a later page returns `422 LIST_RECORDS_ITERATOR_NOT_AVAILABLE`, discard every
record and cursor from that traversal and restart from page one once. A second
cursor error, unrelated 422, or other failure still stops before People or
Application writes. Failed and partial traversals are never cached.

The optional `AIRTABLE_COUNTRIES_TABLE` setting accepts the directory name or ID; the default
matches the configured base, so no environment change is required there. The
production Airtable token must have read access to this table.

Unrelated select-option fallback behavior stays in place for Gender and Country
of Birth, with original answers saved atomically in the same note. Current Country
is no longer a select candidate, so a refused Country of Birth value does not also
remove a valid linked Current Country. Unexpected column-type errors now fail
rather than discarding a correctly resolved link.

## Checks and diagnostics

`npm run test:airtable` now validates the directory schema, the People link target,
the derived Jurisdiction lookup wiring, and every supported country against fresh
reference data. Metadata compatibility alone did not catch the old write-shape
mismatch. The live check needs both metadata and reference-record read permissions;
see [schema check setup](airtable-schema-check.md). No write scopes are needed.

Staff-review diagnostics use operation `create_person_review_fallback` for both
country-mapping and refused-select fallbacks, with flat primitive arrays: `omittedFields`,
`airtableErrorTypes`, and `omissionStatuses`. This avoids nested objects becoming
`[Object]` in Sentry. Names, email addresses and submitted demographic values remain
in Airtable, not diagnostic metadata. Country-directory failures retain only
HTTP status and a bounded Airtable error type, never response text or cursors.
Profile-review alerts describe an answer requiring staff review, not a failed
application or a removed answer. Directory-read failures do fail the submission.

## Existing profiles and rollout

This fix does not backfill or overwrite existing profiles. Staff can find affected
records by filtering for the review marker plus a saved Current Country answer
and an empty structured country link. Confirm the preserved answer resolves
uniquely using the same rule, restore the link, and verify Jurisdiction. Mark the
review resolved only after every omitted field in the note is restored; retain
the original note as an audit trail. Never recreate the application or upload its
CV again merely to correct this profile field.

Returning-applicant profile updates remain a separate policy issue (#48). Tests
must not write real applicants. Deploy in coordination with the team and perform
an authorized synthetic new-applicant test before claiming production write
verification. Unit/API tests use mocked writes; live checks only read metadata
and country-reference data.

Reverting the code restores the previous fallback behavior. Directory records
and schema are unchanged, and no migration or record deletion is required.
