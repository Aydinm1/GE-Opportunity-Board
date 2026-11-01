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
- Per-attempt submission references in client errors, API response headers and server receipt/completion logs
- A bounded, read-only reachability probe after a browser network failure
- Source-map upload configuration for `global-encounters/ge-job-board` (requires a production build token)

Not used:

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

Source-map uploads are configured in `next.config.mjs` with the org/project and
`widenClientFileUpload: true`. They require a build-time `SENTRY_AUTH_TOKEN` with
appropriate project access. Never expose that token with `NEXT_PUBLIC_`. Maps
are deleted from the build output after upload; do not enable public browser
source maps. This does not provision credentials or prove uploads work in the
hosting team's pipeline. Check the production build's upload result and verify
readable frames on an event from that exact deployment before relying on them.

## Diagnosing failed submissions

Each POST has a new random `x-request-id`, distinct from the private idempotency
key retained across retries. The reference is recorded in diagnostics, not
displayed in the applicant interface. Network/server failures show only a brief
confirmation-and-retry message; actionable validation guidance is retained.
Only UUID-shaped incoming references and bounded hexadecimal `cf-ray` values
are accepted for logging; arbitrary header contents are discarded. These are
correlation hints, never authentication or proof of receipt.

The application API logs `Application request received` before parsing the form
and `Application request completed` with HTTP status and duration after handling
it. Every handled response, including validation and rate-limit errors, echoes
`x-request-id` and uses `Cache-Control: no-store`. Server exceptions include the
same ID, any valid incoming Cloudflare Ray ID, and the existing innermost
`applicationStep` in Sentry. Completion with 200 means our handler finished;
it does not prove the browser received the response.
The active server trace also carries `application.request_id` and, when
available, `application.edge_request_id`, including on successful requests.

Client errors record flat, privacy-safe fields under `monitoring`:

- `requestId`, `attempt`, `requestElapsedMs`
- `phase`: `awaiting_response`, `reading_response`, `http_response`, or `invalid_response`
- `responseReceived`, HTTP `status`, and `responseContentType` (`json`, `html`, or `other`)
- `serverRequestId` and `edgeRequestId` when readable and valid
- `probeOutcome`, `probeStatus`, `probeElapsedMs` on a network failure
- Existing online, visibility, form age, upload size/type and embed context

No answers, CV bytes, filenames, raw headers, response bodies, applicant
identity, or idempotency keys are added to these diagnostics. Flat fields avoid
Sentry collapsing nested values to `[Object]`. Online=true means the browser
reports a connection, not that it can reach this service.

After a network TypeError, the browser performs one uncached GET to `/api/health`,
bounded to three seconds. This endpoint only confirms app reachability; it
does not query Airtable. Probe outcomes are `reachable`, `http_error`,
`unexpected_response`, `network_error`, or `timeout`. A successful probe narrows
the observation to the POST/response path at that time; it does not establish
whether the POST was blocked, saved, or lost. A failed probe does not identify
Cloudflare, DNS, TLS, the carrier, or another provider as the cause.

The client never automatically resubmits an application. Answers, CV and retry
key stay in the current form after failure; a new manual attempt gets a new
diagnostic reference. An HTML challenge or malformed success response cannot
trigger the success screen: the client requires JSON `{ok:true}`. Form state is
in memory, so refreshing/closing the page can still lose it.

When an event recurs:

1. Read its reference, phase, status, probe result and browser/server trace.
2. Match the reference to server receipt/completion logs and any server exception.
3. Use the failed `applicationStep` if server processing failed. If no server
   evidence is available, leave receipt unknown; missing telemetry alone is not
   proof that the request never arrived.

Further tools: first verify source maps and the existing tracing above. A Sentry
uptime monitor can check production GET `/api/health` with expected JSON
`ok=true` and `service=opportunity-board`, plus a separate GET `/api/jobs` check.
These detect general availability problems, not whether multipart applications
work from a particular mobile network. Do not periodically POST synthetic
applications to production. Session Replay remains disabled: it can help with
interaction problems, but cannot reveal a browser's hidden DNS/TLS/network
failure reason and is not required for these diagnostics.

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
