# Iframe integration and host boundary

The board's canonical app origin is `https://ge-opp-board.the.ismaili`. Its trusted
parent is `https://the.ismaili/globalencounters/opportunities`.

## Configuration and scripts

`config/host-origin.json` is the single parent-origin source. It must contain an
HTTPS origin without a path or trailing slash. The Next.js config validates this
at startup/build time and uses it for the response headers. React imports it
through `lib/host-config.ts`.

The layout supplies `data-parent-origin` on the `/resize-child.js` script tag.
The resize script reads that attribute during execution and uses the exact origin
as its `postMessage` target. It never selects a destination from the referrer or
uses a wildcard. If configuration is absent/invalid, no resize messages are sent.
Standalone pages do not send parent messages. Script tags installed outside the
app layout must supply the same attribute if they are used for iframe resizing.

`integrations/iframe/parent-script.txt` is the separately installed parent-site
reference. Its allowlist contains the canonical child origin. For every supported
message it checks both the origin and that the source is the configured iframe's
window. Keep the parent iframe ID `division-fixtures-iframe` and its app origin
aligned with that reference. The current installed script was supplied by the
maintainer and matches this reference; this PR does not require replacing it.

## Response headers

The app config applies these headers to all route paths, including APIs/assets:

- `Content-Security-Policy: frame-ancestors 'self' https://the.ismaili`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

Framing is allowed from the same app origin or the trusted parent. Other parent
origins, including arbitrary local test hosts, are intentionally not allowed.
There is no `X-Frame-Options: SAMEORIGIN` header because that would block the
cross-origin production embed. The CSP only restricts framing; it does not add
script/font/network restrictions.

A local same-origin iframe may display the board, but it will not receive resize,
URL, or copy messages addressed to the production parent origin. Use a browser
routing harness with the production origins mapped to local responses to exercise
that cross-origin flow without widening the production allowlist.

## Verification and rollout

- Run `npm test` and `npm run build`.
- Check actual response headers on the built app for `/`, `/api/jobs`, and
  `/resize-child.js`, and on the deployment preview when accessible.
- Exercise desktop and mobile standalone behavior and trusted cross-origin embed
  resizing, parent URL/deep-link resolution, and share/copy replies. Include an
  empty referrer; it must still use the configured parent.
- Verify a different-origin parent cannot frame the board. Parent message tests
  also cover wrong-origin and wrong-window messages.
- Before production rollout, confirm these flows on the actual the.ismaili page
  and verify the final headers after any CDN/proxy processing. Local hostname
  routing is not evidence of the installed live embed's behavior.

Production deployment remains coordinated with the team. No Airtable changes or
migrations are needed. To roll back, revert the headers and script/layout change
together; reverting restores the previous messaging policy too.
