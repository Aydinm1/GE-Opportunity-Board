# Case Study: GE Opportunity Board

## Project Snapshot

- **Role:** Product + Full-Stack Engineer (owner)
- **Product:** Community job board + application intake platform
- **Context:** Embedded experience inside `the.ismaili` with Airtable-backed operations
- **Stack:** Next.js, React, TypeScript, Airtable, Tailwind

## Problem

Global Encounters needed a lightweight, maintainable system to publish opportunities and manage applicants without adding heavy operational overhead.

### What GE needed

- A job board for their community
- Streamlined applicant intake
- Internal referral support

## Users

- **Candidate:** discover opportunities, evaluate role fit, submit a complete application quickly
- **Hiring/Admin Team:** publish and maintain roles, track candidates in a single operational system
- **Referrals:** refer candidates into the same pipeline with clear context

## Constraints

- Non-technical admins needed to manage jobs easily
- Fast timeline
- Minimal ops burden
- Attachment support (CV/resume)
- Embed constraints (cross-origin iframe + host page scripts)

## Process

### 1) Stakeholder Discovery

- Mapped goals and bottlenecks across recruiting/admin workflows
- Identified key outcomes:
  - reduce manual back-and-forth
  - standardize applicant data capture
  - keep admin workflows in familiar tooling (Airtable)

### 2) Competitive Teardown

- Borrowed patterns:
  - searchable job list + clear detail panel
  - obvious application call-to-action
  - strong form completion cues
- Avoided patterns:
  - over-complex multi-step onboarding that increases drop-off
  - admin-heavy custom backoffice for early versions
- Why:
  - speed-to-value and maintainability were more important than feature breadth in v1

### 3) Design Iteration (Figma -> Feedback -> Final)

- Started with list/details/apply flow
- Iterated on embedded behavior and viewport constraints
- Reworked modal-based apply UX into in-pane apply flow to improve iframe reliability and completion usability

### 4) MVP Scope

- Published jobs page with filters/search
- Application form with attachment support
- Airtable-backed admin pipeline
- Internal referral path (data model + workflow direction documented for expansion)

## Outcomes

### What shipped

- Airtable-powered job listing and filtering experience
- Full application submission flow with CV/resume attachment handling
- Embedded iframe integration with parent-child messaging for sizing and utility actions
- Production hardening around cross-origin messaging and deploy hygiene

### Deployment/Hosting

- Next.js app deployed as a standalone service and embedded in host page
- Parent page integration handled via `postMessage` contract + host script

### Impact (qualitative)

- Reduced back-and-forth for candidate intake
- Created a single source of truth for roles + applications
- Enabled non-technical admins to operate content through Airtable

### Timeline Notes

If you want this case study to be resume/interview-ready, add:
- Launch date
- Major iteration dates (for example: modal-to-in-pane apply refactor)
- Any available conversion or operational metrics
