# GE Opportunity Board

End-to-end full-stack product I built to help teams publish opportunities and collect applications through a clean, embedded experience.

Live context: this app is embedded as an iframe on `https://the.ismaili/globalencounters/opportunities`.

## What I Built

I designed and shipped a production-ready opportunity platform that:
- Fetches and normalizes role data from Airtable
- Supports search/filtering and deep-linking to specific jobs
- Handles full application submission, including CV/resume attachments
- Works reliably inside a cross-origin iframe environment
- Balances UX quality with integration constraints from a host site

## My Ownership

I owned this project across engineering and product:

- Product definition:
  - Scoped the candidate journey (discover -> evaluate -> apply)
  - Prioritized low-friction apply flow and quick job switching
  - Iterated UX based on real embed constraints
- Frontend engineering:
  - Built responsive job list/details/apply flows in React + TypeScript
  - Implemented state persistence patterns (selected job, apply drafts, URL sync)
  - Refactored modal-based apply UX to in-pane flow for iframe reliability
- Backend/API engineering:
  - Built Next.js API routes for jobs and applications
  - Implemented Airtable integration with schema-tolerant writes and attachment uploads
  - Added defensive error handling and clear API response shaping
- Platform/integration:
  - Implemented child-to-parent iframe resizing via `postMessage`
  - Hardened cross-origin messaging behavior and reduced origin mismatch failures
  - Migrated styling from Tailwind CDN to local PostCSS build for production safety
- Delivery/operations:
  - Investigated production console warnings and separated app issues from host/GTM/vendor issues
  - Maintained deployment-safe changes with build validation

## Skills Demonstrated

### Computer Science / Engineering
- Full-stack system design (UI, API, data integration)
- Type-safe React architecture and state management
- API contract design and robust error handling
- Data modeling/mapping between Airtable schemas and app domain models
- Cross-origin iframe communication and browser platform debugging
- Build/tooling migration (Tailwind CDN -> PostCSS pipeline)

### Product Management
- Translating ambiguous UX pain points into concrete implementation plans
- Making scope and tradeoff decisions under integration constraints
- Prioritizing reliability and user flow over purely aesthetic solutions
- Driving iterative improvements with stakeholder-facing outcomes
- Communicating root-cause analysis across app, host page, and third-party scripts

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS (local PostCSS build)
- Airtable REST + Airtable content API

## Architecture Overview

```text
Client (App.tsx + components/*)
  -> GET /api/jobs
      -> lib/airtable.ts (read role records from Airtable)

Client (ApplyView.tsx)
  -> POST /api/applications
      -> lib/airtable.ts
          1) upsert person by normalized email
          2) create application record
          3) upload CV/resume attachment via Airtable content API

Iframe Integration
  public/resize-child-v2.js
  -> postMessage({ type: 'resize-iframe', height }) to parent
```

## Key API Endpoints

- `GET /api/jobs`: fetch and normalize published job records
- `POST /api/applications`: submit person + application + optional attachments
- `POST /api/upload`, `GET /uploads/[...path]`: legacy local upload/serve support

## Environment Setup

Create `.env`:

```bash
AIRTABLE_TOKEN=pat_xxx
AIRTABLE_BASE_ID=app_xxx
AIRTABLE_GEROLES_TABLE=GE Roles
AIRTABLE_JOBS_VIEW=Public
AIRTABLE_PEOPLE_TABLE=People
AIRTABLE_APPLICATIONS_TABLE=Applications
AIRTABLE_APPLICATIONS_PERSON_FIELD=Person
```

## Run Locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Repo Structure

```text
app/
  api/
  uploads/[...path]/
components/
lib/
public/
App.tsx
tailwind.config.js
postcss.config.js
parent-script-original.txt
```

## Case Study and Engineering Docs

- Case study: `docs/case-study.md`
- Airtable schema: `docs/airtable-schema.md`
- API reference: `docs/api.md`
- Architecture overview: `docs/architecture.md`
