# Global Encounters Opportunity Board

A Next.js 15 / React 19 job board application designed to run as an **iframe within the.ismaili website**. Displays volunteer/job opportunities from Airtable with filtering, job details, and an application form.

## Tech Stack

- **Framework**: Next.js 15, React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Airtable API (jobs, people, applications tables)
- **Deployment**: Vercel (https://ge-opportunity-board.vercel.app/)
- **Embedding**: iframe with postMessage communication to parent site

## Project Structure

```
/
├── App.tsx                 # Main application component (job list, filters, details panel)
├── types.ts                # TypeScript interfaces (Job, Person, Application, FilterOptions)
├── constants.ts            # HOST_ORIGIN config, mock job data
├── host-origin.json        # Parent origin configuration {"HOST_ORIGIN": "..."}
│
├── app/
│   ├── page.tsx            # Next.js page (renders App)
│   ├── layout.tsx          # Root layout with fonts, metadata
│   ├── globals.css         # Global styles
│   └── api/
│       ├── jobs/           # GET /api/jobs - fetch jobs from Airtable
│       ├── applications/   # POST /api/applications - submit application
│       └── upload/         # File upload endpoint
│
├── components/
│   ├── JobCard.tsx         # Job listing card in sidebar
│   ├── JobDetails.tsx      # Full job details with share/apply buttons
│   ├── ApplyModal.tsx      # Application form modal
│   └── Filters.tsx         # Multi-select filter dropdowns
│
├── lib/
│   ├── airtable.ts         # Airtable API: getJobs(), submitApplication()
│   └── utils.ts            # Helper functions (splitBullets, parseDuration, etc.)
│
├── public/
│   ├── resize-child.js     # Iframe height sync script (runs in iframe)
│   └── img/                # Logo, pattern background images
│
└── Parent Scripts (reference only - installed on the.ismaili):
    ├── parent-script-original.txt  # Minimal parent script (resize only)
    └── script.txt                  # Debug parent script with full message handling
```

## Iframe Communication

The app runs inside an iframe on `the.ismaili`. Communication uses `postMessage`:

### Messages from Iframe → Parent

| Message Type | Purpose |
|-------------|---------|
| `resize-iframe` | Request parent to resize iframe height: `{ type, height }` |
| `opportunityboard:get-parent-url` | Request parent's URL for deep linking: `{ type, id }` |
| `opportunityboard:copy` | Request clipboard write (share button): `{ type, id, text }` |
| `opportunityboard:modal-open` | Notify parent to lock scroll when modal opens |
| `opportunityboard:modal-close` | Notify parent to unlock scroll when modal closes |

### Messages from Parent → Iframe

| Message Type | Purpose |
|-------------|---------|
| `opportunityboard:parent-url` | Response with parent URL: `{ type, id, url }` |
| `opportunityboard:copy-result` | Clipboard result: `{ type, id, ok, error }` |

### Deep Linking

Jobs can be deep-linked via `?job=<airtable-record-id>` in the parent URL. The iframe:
1. Checks its own URL params
2. Checks `document.referrer`
3. Asks parent via `opportunityboard:get-parent-url` message

### Host Origin Configuration

Set in `host-origin.json`:
```json
{"HOST_ORIGIN": "https://the.ismaili"}
```

Used by `resize-child.js` and `App.tsx` to target postMessage correctly.

## Airtable Integration

### Environment Variables

```
AIRTABLE_TOKEN=pat...           # Airtable personal access token
AIRTABLE_BASE_ID=app...         # Base ID
AIRTABLE_GEROLES_TABLE=tbl...   # Roles/Jobs table
AIRTABLE_JOBS_VIEW="Roles Posted"  # View to filter published jobs
AIRTABLE_PEOPLE_TABLE=tbl...    # People table
AIRTABLE_APPLICATIONS_TABLE=tbl...  # Applications table
```

### Key Airtable Fields (Roles Table)

- `Role Title`, `Programme / Functional Area`, `Team/Vertical`
- `Location / Base`, `Work Type`, `Role Type`
- `Start Date`, `Duration (Months)`, `Duration Categories`
- `Purpose of the Role copy`, `Key Responsibilities`
- `10. Required Qualifications`, `Preferred Qualifications`
- `Estimated Time Commitment copy`, `Languages Required`

### Application Flow

1. User fills form in `ApplyModal.tsx`
2. Submits to `POST /api/applications`
3. `lib/airtable.ts` → `submitApplication()`:
   - Finds or creates Person record by email
   - Creates Application record linked to Person and Job
   - Uploads CV attachment if provided

## Key Features

- **Search**: Full-text search across role title, team, programme area, location
- **Filters**: Programme Area, Team, Work Type, Role Type, Duration, Time Commitment
- **Job Cards**: Sidebar list sorted by start date (soonest first)
- **Job Details**: Full description with share link and apply button
- **Share**: Copies deep link via parent clipboard (postMessage)
- **Apply Modal**: Multi-step form with personal info, education, CV upload

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run start        # Start production server
```

### Testing Locally

The app works standalone but share/deep-link features require iframe context. Use `host-test-with-script.html` for local iframe testing.

## Parent Script Installation

For the parent site (the.ismaili), install one of:

1. **Minimal** (`parent-script-original.txt`): Handles `resize-iframe` only
2. **Debug** (`script.txt`): Full message handling with debug overlay

The parent page needs:
```html
<iframe
  id="division-fixtures-iframe"
  src="https://ge-opp-board.the.ismaili/"
  style="width:100%;border:0;"
  height="600"
  loading="lazy"
  allow="clipboard-read; clipboard-write"
></iframe>
```

## Common Tasks

### Add a new filter field
1. Add to `FilterOptions` in `types.ts`
2. Add to `selectedFilters` initial state in `App.tsx`
3. Add filter logic in `filteredJobs` memo in `App.tsx`
4. Add dropdown in `components/Filters.tsx`

### Modify job card display
Edit `components/JobCard.tsx`

### Modify job details display
Edit `components/JobDetails.tsx`

### Modify application form
Edit `components/ApplyModal.tsx`

### Change Airtable field mappings
Edit `lib/airtable.ts` - look for `AirtableJobFields` type and the field mappings in `getJobs()` and `submitApplication()`

## Workflow

- **Commit changes once finished**: After completing each change or fix, commit it immediately with a descriptive commit message.
