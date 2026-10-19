# Checking Airtable compatibility

Run `npm run test:airtable` from a configured checkout. This reads base metadata;
no records, options, or fields are created or modified. A nonzero exit means the
check failed: read the reported table, field, type, or missing option. Do not
weaken the contract to silence a mismatch without checking how the app writes it.

The contract covers the fields the app reads/writes in GE Roles, People, and
Applications. Required fields and incompatible types fail. Missing optional role
fields warn. Select choices are case-sensitive; text variants explicitly allowed
by the contract do not require select choices. Extra choices are accepted only
where the contract uses `contains`. Unrelated fields are ignored.

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
  `schema.bases:read` scope and access only to the configured base. Do not reuse
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

## Limits and release checks

Metadata checks do not verify formula results, field contents, write permissions,
network availability, or successful attachment uploads. API tests use mocked
Airtable responses; a green suite does not prove production writes work. On the
preview, verify a clearly marked new applicant and a returning applicant, including
Age 18–24, Female, and both countries United States. Check saved answers and CV.
Verify mobile/desktop and the actual parent embed before deployment. Any live
synthetic submission requires explicit authorization and a cleanup arrangement.

CV retry recovery, required-answer preservation under renamed fields, upload-size
boundaries, and browser error presentation receive regression tests with their
respective fixes (#43, #44, and #46), rather than accepting failing tests here.
