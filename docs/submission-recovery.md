# Application completion and retry behavior

The application form sends a submission key. A successful POST returns exactly
`{ "ok": true }`; Airtable IDs, record fields, and temporary download URLs are
internal details. Form behavior and entered drafts are unchanged on errors.

## Completion and recovery

People lookup errors fail the request. The legacy Email Address query is used
only after an empty normalized-email lookup or a specific missing-field error;
permission, connection, and rate-limit failures are not treated as absence.

For an existing submission key, the saved application's People and role links
must match the current applicant and role. Its saved answer must also match the
submitted answer after normalizing whitespace. A conflict returns 409 without
writing to the other application's record or creating a new People record.
Completed and in-flight caches also check a fingerprint of the validated request,
including its CV bytes; an incompatible request cannot reuse another result.

If a matching application already has a CV, retry returns success without another
upload. If its CV is missing, retry uploads to that same application. An upload
or verification failure remains an error, and is never cached as success. If the
upload committed but its response was lost, the next fresh lookup can discover
the saved CV and finish without uploading it again.

The [Airtable upload endpoint](https://airtable.com/developers/web/api/upload-attachment)
writes attachments and returns record fields keyed by field ID. For that response,
the app reads the known application back uncached and verifies `CV / Resume` by
name. It does not guess a field ID from an arbitrary attachment array. Legacy
responses identifying the target attachment directly are also accepted. The old
best-effort PATCH is removed so a stale array cannot overwrite uploaded files.

## Schema and diagnostic failures

All application fields currently written are required: person/role links,
submission key when provided, Status, Source, and the application answer. An
unknown-field error fails visibly; no field is stripped and retried. The existing
People demographic review-note fallback, linked-country resolution, and
`create_person_review_fallback` diagnostics are preserved. Published-role and CV
validation still run before submission recovery.

Airtable diagnostics retain operation, HTTP status, safe error type, and a known
field name where identifiable. Raw response bodies, transport causes containing
request URLs, and JSON parser snippets are not propagated. Console logs and Sentry
also sanitize quoted values, email addresses, bearer values, and message URLs,
and bound diagnostic messages. Sentry source frames are preserved for debugging;
request query strings are removed. This is a targeted privacy safeguard, not a
guarantee that arbitrary future free-text metadata cannot contain personal data.

## Deliberate limits

- This PR addresses #43 A–D and F, plus stricter lookup-failure handling from E.
  Cross-instance duplicate People/application prevention and shared limits remain
  with #45. A read followed by a create is still not atomic across instances.
- Request fingerprints live in process memory. Across cold starts, the existing
  record's links, answer, and CV presence are checked; this does not persist a full
  payload fingerprint or compare existing CV bytes. No new Airtable field or
  shared service is introduced. Retry recovery relies on the submission key the
  form already supplies.
- Returning applicants' People data is not updated; identity/update policy remains
  in #48. No existing records are automatically merged, deleted, or backfilled.
- The minimal response removes the old `result` property. The shipped form reads
  HTTP status only. Any external consumer relying on that property must adapt.
- Reverting this PR restores the previous behavior. There is no data migration.
  Keep issue #43 open until its remaining concurrency work is resolved.
