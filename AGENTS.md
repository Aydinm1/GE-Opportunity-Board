# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router entrypoints and API routes (`app/api/*`).
- `components/`: Client UI components (`JobCard`, `JobDetails`, `ApplyModal`, `Filters`).
- `lib/`: Shared logic and integrations (`airtable.ts`, `utils.ts`, `api-response.ts`).
- Root files: `App.tsx` (main client shell), `types.ts` (shared types), `constants.ts` (config constants).
- Static assets: `public/` (served files). Build output appears in `.next/`.

## Build, Test, and Development Commands
- `npm run dev`: Start local development server (Next.js).
- `npm run build`: Create production build and run type checks.
- `npm run start`: Serve the production build locally.

Example:
```bash
npm install
npm run dev
```

## Coding Style & Naming Conventions
- Language: TypeScript + React function components.
- Indentation: 2 spaces; prefer concise, typed helpers in `lib/` for shared behavior.
- Naming:
  - Components: `PascalCase` (`JobDetails.tsx`)
  - Variables/functions: `camelCase`
  - Constants: `UPPER_SNAKE_CASE` where applicable
- API handlers should keep route code thin and move reusable logic into `lib/`.
- No ESLint/Prettier config is currently committed; keep formatting consistent with surrounding code.

## Testing Guidelines
- No formal test framework is configured yet (`npm test` is not available).
- Minimum validation before PR:
  - `npm run build` passes
  - Manual smoke test of key flows: jobs fetch, filtering, job details, application submission.
- When adding tests, colocate as `*.test.ts(x)` near source or under `__tests__/`.

## Commit & Pull Request Guidelines
- Follow current history style: short, imperative, scope-focused messages (for example, `Fix modal iframe height feedback loop`).
- Keep commits logically grouped; avoid mixing refactors and behavior changes without clear reason.
- PRs should include:
  - What changed and why
  - Risk/rollback notes for API or Airtable-related changes
  - Screenshots or short clips for UI updates
  - Manual verification steps run locally

## Security & Configuration Tips
- Required secrets live in `.env` (Airtable tokens/base/table IDs); never commit secrets.
- Sanitize and validate request data in API routes, especially upload and application endpoints.

## Iframe Integration Notes
- This app is embedded as an iframe at `https://the.ismaili/globalencounters/opportunities`.
- Parent-side reference script in this repo: `parent-script-original.txt`.
- Child-side resize script used by this app/embedding flow: `public/resize-child-v2.js`.
- When changing modal height, postMessage behavior, deep links, or share links, validate both:
  - Standalone app behavior
  - Embedded iframe behavior on the parent page
