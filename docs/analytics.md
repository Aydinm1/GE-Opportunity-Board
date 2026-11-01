# Board analytics

PostHog measures traffic and application conversion. Sentry continues to handle
errors. The browser SDK is configured explicitly for the event contract below.

## Production setup

1. In your existing US PostHog project, enable **Settings → Project → Web analytics
   → Enable cookieless tracking** and save. This setting is required: PostHog
   otherwise ignores cookieless events. Verify it remains enabled before rollout.
2. Add the following public values to the production build environment, using
   the project token supplied by the owner (starts `phc_`):

   ```dotenv
   NEXT_PUBLIC_POSTHOG_ENABLED=true
   NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<public project token>
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   ```

   A sample is in `.env.analytics.example`. The real token is saved only in the
   ignored local `.env`, with collection disabled there. Public tracking tokens
   are intended for browser code; private management keys are not.
3. Rebuild and deploy through the team's normal production workflow. The
   integration requires a production build on `ge-opp-board.the.ismaili` with
   the enable flag and valid project configuration. Local/dev/preview hosts do
   not send events, even if the public flag is set. EU projects can use
   `https://eu.i.posthog.com`; never switch the host without the matching project.
4. In PostHog **Activity**, verify a production board visit and one role view,
   then inspect the properties. Do not create production applications solely
   for analytics verification without authorization.

Rollback: set `NEXT_PUBLIC_POSTHOG_ENABLED=false` and rebuild/redeploy. These
variables are embedded at build time; editing only runtime values is insufficient.
Missing/invalid configuration disables analytics without affecting the board.

## Event contract

| Event | Meaning |
| --- | --- |
| `$pageview` | Once per board document, including when jobs fail to load |
| `role_viewed` | First visible details exposure for each role per document |
| `application_started` | First form edit/file selection per role per document |
| `application_submission_confirmed` | Browser received the API's `{ok:true}` response |
| `tor_clicked` | Accepted external link/upload download action, not proof of opening |

Common properties are `is_embedded` and `viewport` (`mobile`/`desktop`, using
the app's 1024px breakpoint). Role events include the public `role_id` and
`role_title`; TOR clicks also include `tor_source` (`link`/`upload`).

Pageviews are independent of role navigation. Deep-link resolution and viewport
detection finish before role tracking, and details must intersect the viewport
in a visible document. Hidden mobile details do not count. Opening or hydrating
an application does not count as starting it. Form edits are detected without
reading the field name/value, and the honeypot is excluded.

Views/starts are deduplicated in document memory. Submission confirmations use
the existing retry key only as an in-memory deduplication key; it is never sent.
Manual retries retain the normal application behavior. Reloading creates a new
document, so this does not promise cross-reload submission-event deduplication.

## Privacy and limitations

- Cookieless mode, `person_profiles: 'never'`, and no `identify()`/persistent IDs.
- Autocapture, replay, pageleave capture, exceptions, performance capture,
  heatmaps, surveys, web experiments, and feature flags are disabled. The
  deferred SDK import uses the `module.no-external` build, which cannot load
  remote replay/toolbar/extension scripts.
- The final SDK `before_send` hook drops unapproved events, unknown properties,
  person updates, and identifying SDK fields. It preserves the cookieless
  ingestion marker and sentinel ID required for server-side audience estimates.
- No form contents, applicant identity, search text, filenames, document links,
  submission keys, diagnostic IDs, or URL queries/fragments are recorded.
  Only the referrer's origin is retained. Embedded traffic generally reports
  the parent site as referrer; original parent campaigns are not inferred.
- PostHog still receives the network request and uses its cookieless server hash
  mechanism to estimate visitors. This is not a claim of legal compliance or
  an exact count of humans. See [PostHog's cookieless documentation](https://posthog.com/tutorials/cookieless-tracking).
- Daily visitor estimates can merge similar users on shared networks and split
  the same person across days/devices. Do not add daily uniques and label that
  total “monthly unique people.” IP-based geography and bot enrichment are
  unavailable in this mode.
- Blocking analytics, network failures, and daily identity changes affect
  counts/funnels. Browser confirmations can undercount saved applications if
  the response was lost; Airtable remains the source of truth.
- Analytics is asynchronous and optional; importing or sending failures cannot
  block navigation, TOR access, or submission. No reverse proxy or parent-site
  changes are introduced in this version.

## Create the Board overview dashboard

The [Board overview dashboard](https://us.posthog.com/project/702314/dashboard/2287812)
is created in the US project with all ten insights. Its saved queries and
one-hour same-role funnel settings have been verified; rerunning the installer
created no duplicates. Collection still requires production deployment and the
enable flag. The public tracking token cannot create dashboard tiles.

In PostHog, select **Dashboards → New dashboard**, name it **Board overview**, and
add the following insights. Default to the last seven days and daily intervals.
For a breakdown, choose an **event property**, not a person property.

| Insight | Event | Calculation / breakdown |
| --- | --- | --- |
| Daily estimated visitors | `$pageview` | Unique users per day |
| Board pageviews | `$pageview` | Total count |
| Visitors by viewport | `$pageview` | Daily unique users; `viewport` |
| Embedded versus standalone | `$pageview` | Daily unique users; `is_embedded` |
| Most-viewed roles | `role_viewed` | Total count; `role_title` |
| TOR clicks by role | `tor_clicked` | Total count; `role_title` |
| Application starts by role | `application_started` | Total count; `role_title` |
| Submission confirmations by role | `application_submission_confirmed` | Total count; `role_title` |
| Role view to application confirmation | `role_viewed` → `application_started` → `application_submission_confirmed` | Ordered funnel; one hour |
| Application start to confirmation | `application_started` → `application_submission_confirmed` | Ordered funnel; one hour; includes direct application links |

For both funnels, use the custom aggregation expression
`concat(distinct_id, ':', toString(properties.role_id))` so one role's view/start
cannot convert another role's submission. This counts visitor/role pairs, not
only people. The full query definitions are in
`integrations/posthog/board-overview.mjs` and can also be used by PostHog's
dashboard tooling. Add the limitations above to the dashboard description.

### Optional repeatable installer

Preview all ten definitions without sending any requests:

```bash
npm run setup:analytics-dashboard
```

An administrator can create/resume the dashboard using the provided installer.
Keep a scoped private management key in an ignored `.env.posthog-admin` file
on their own machine; never paste it into chat, commit it, or put it in a
`NEXT_PUBLIC_` variable. Needed scopes are dashboard read/write and insight write.

```dotenv
POSTHOG_APP_HOST=https://us.posthog.com
POSTHOG_PROJECT_ID=<numeric project ID from your PostHog URL>
POSTHOG_PERSONAL_API_KEY=<private management key>
```

```bash
node --env-file=.env.posthog-admin scripts/posthog-dashboard.mjs --apply
```

The installer reuses only a dashboard carrying its management tag and skips
already-created managed insights. It does not overwrite unrelated dashboards or
change the project's cookieless setting. After setup, revoke the temporary key.
The installer has mocked API tests and was verified with scoped management
access against the US project. The public tracking token remains insufficient
for dashboard creation.

## Validation

Run `npm test` and `npm run build`. Browser smoke checks should use a synthetic
project token and intercept every PostHog/application request; production host
URLs may be routed to a local production build to exercise the hostname gate.
Inspect the actual outgoing SDK payloads and verify no PostHog cookies or
local/session-storage identifiers. Cover desktop/mobile, standalone/embedded,
initial deep links, hidden mobile details, retries, blocked analytics, empty/error
jobs, filtering, and external/uploaded TOR actions.
The SDK intentionally filters headless/automated browsers; a visitor-path smoke
test must emulate normal browser markers while intercepting all analytics traffic.
