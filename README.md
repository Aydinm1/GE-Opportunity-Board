# GE Opportunity Board

End-to-end full-stack product I built to help teams publish opportunities and collect applications through a clean, embedded experience.

This app is hosted on `https://the.ismaili/globalencounters/opportunities`.

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
- Backend/API engineering:
  - Built Next.js API routes for jobs and applications
  - Implemented Airtable integration with schema-tolerant writes and attachment uploads
  - Added defensive error handling and clear API response shaping

## Skills Demonstrated

### Computer Science / Engineering
- Full-stack system design (UI, API, data integration)
- Type-safe React architecture and state management
- API contract design and robust error handling
- Data modeling/mapping between Airtable schemas and app domain models

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

## Key API Endpoints

- `GET /api/jobs`: fetch and normalize published job records
- `POST /api/applications`: submit person + application + optional attachments
- `POST /api/upload`, `GET /uploads/[...path]`: legacy local upload/serve support

## Environment Setup

Create `.env`:

```bash
AIRTABLE_TOKEN="pat_xxx"
AIRTABLE_GEROLES_TABLE=""
AIRTABLE_JOBS_VIEW=""
AIRTABLE_PEOPLE_TABLE=""
AIRTABLE_APPLICATIONS_TABLE=""
AIRTABLE_BASE_ID=""
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
```

## Case Study and Engineering Docs

- Case study: `docs/case-study.md`
- Airtable schema: `docs/airtable-schema.md`
- API reference: `docs/api.md`
- Architecture overview: `docs/architecture.md`
