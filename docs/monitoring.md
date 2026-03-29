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
- Browser tunnel through `/_board` in production to reduce client-side ad-block blocking

Not used:

- Sentry auth token
- source map upload
- release creation
- session replay
- tracing
- logs

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
