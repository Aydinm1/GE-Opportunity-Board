# Monitoring

This app uses Sentry for runtime error monitoring.

## Runtime config

Required production env vars:

```bash
NEXT_PUBLIC_SENTRY_DSN="https://<public-key>@o<org>.ingest.us.sentry.io/<project-id>"
SENTRY_ENVIRONMENT="production"
```

Optional smoke-test toggle:

```bash
NEXT_PUBLIC_ENABLE_SENTRY_SMOKE_TESTS="true"
```

If `SENTRY_ENVIRONMENT` is omitted, the app falls back to host/runtime values. For predictable alert rules, set it explicitly to `production` on the deployed site.

## What is enabled

- Client/browser error capture
- Server/API error capture
- App Router global error capture
- Browser/server/edge performance tracing with application-step spans
- Safe server failure-step metadata, retained even when tracing is sampled out
- Browser tunnel through `/_board` in production to reduce client-side ad-block blocking

Not used:

- Sentry auth token
- source map upload
- release creation
- session replay
- logs

## Tracing and privacy

The SDK is already installed. All three runtime configs use the shared
`getSentryInitOptions`; do not run the installation wizard over this configuration.
Tracing defaults to `1.0` (100%) temporarily while diagnosing low-volume production
submission failures. This includes ordinary page/API transactions, so monitor
Sentry usage and lower the rates when the investigation is complete:

```bash
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0.1"
SENTRY_TRACES_SAMPLE_RATE="0.1"
```

The public setting is built into the browser bundle: rebuild/redeploy to change
it. The private setting overrides server/edge sampling and otherwise falls back
to the public value. Missing/blank values default to 1; invalid nonblank values
fail closed to 0. A valid 0 disables new sampling. Upstream sampling decisions
can still be inherited; sampling is decided before the outcome, so sampling 10%
does not guarantee a full trace for every error. Error capture is independent.

The client creates an `application.submit` span around the actual request and
error handling. Browser trace headers are restricted to same-origin `/api/`
requests; server/edge propagation to external services is disabled. Do not add
Airtable or attachment CDNs to propagation targets. No CORS change is needed for
the same-origin application API. Production proxies must preserve `sentry-trace`
and `baggage` for end-to-end correlation.

Named steps include parse/validation, published roles, People/idempotency lookup,
country resolution, People/application creation, CV upload and fresh verification.
Only fixed step labels are recorded. The innermost failed step is attached to
server errors as `monitoring.applicationStep`. No applicant identity, answers,
submission keys, filenames or CV data are added to spans. `submitElapsedMs` now
measures the current attempt; `formAgeMs` records time since opening the form.

HTTP bodies, headers, cookies, user info, query params and local-variable capture
are explicitly disabled. Error, transaction and span hooks additionally redact
encoded query/filter fields and strip query strings, including the Airtable
`http.query` breadcrumb that previously exposed an encoded email. Trace IDs,
timing, statuses and fixed operation names remain useful. Session Replay stays
disabled; the earlier Replay work remains stashed separately.

Source-map uploads require a build-time `SENTRY_AUTH_TOKEN` with appropriate
project access, plus Sentry org/project configuration in the team's production
build. Never expose that token with `NEXT_PUBLIC_`. This PR does not provision
credentials or claim maps are uploaded by the hosting team's pipeline. Verify
readable frames and the deployed release before relying on source maps.

Verification: run unit/API tests and a production build; then check a synthetic
submission in Sentry on an authorized preview/production environment. Confirm
one browser/server trace, the expected named steps, and no personal data or
request bodies in the actual envelopes. A green local suite alone does not prove
that the host forwards headers or delivers traces to Sentry.

## Alerting

Alert emails are configured in Sentry, not in this repo.

Recommended issue alerts:

- new issue in `production`
- regression in `production`

## Saved smoke tests

The repo keeps reusable smoke tests instead of commented-out code.

Client smoke test:

- set `NEXT_PUBLIC_ENABLE_SENTRY_SMOKE_TESTS=true`
- load `/?sentry-test=1`
- click `Send Browser Test Event`

Server smoke test:

- set `NEXT_PUBLIC_ENABLE_SENTRY_SMOKE_TESTS=true`
- load `/?sentry-test=1`
- click `Trigger Server Test`

When the smoke-test flag is not enabled:

- the test buttons do not render
- `/api/sentry-test` returns `404`

This is the preferred approach over commented-out files:

- test code stays documented and runnable
- production surface area stays closed by default
- there is no need to rewrite temporary test helpers from scratch later

## Airtable schema verification

Live Airtable schema validation is separate from Sentry.

Run:

```bash
npm run test:airtable
```

This checks the live Airtable metadata API against the field contract used by the app.
