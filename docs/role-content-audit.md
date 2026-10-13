# Published role content audit

Audited all 12 published roles in the configured Airtable jobs view on October 13, 2026. This report separates source-data issues from application formatting. No Airtable records were changed.

## Cross-role findings

- All 12 records lack Role Overview, Weekly Time, and Team/Vertical values. Five HR records also lack responsibilities, qualifications, languages, location/work type, and start dates.
- Three records share the exact HR Assistant, Camps title. Confirm whether these are distinct openings; add the distinguishing information or unpublish duplicates.
- Three substantive roles have Location / Base but no Work Type; the old UI hid those locations.
- Three roles select Other for required qualifications. Only the Marketing Team Lead provides Other Required Qualifications.
- Five substantive roles contain the digital-tools Specify below instruction, and National Coordinator also includes a specific-systems Specify below instruction. These are intake prompts, not applicant-facing content.
- The PMO Deputy Lead has weekly hours in Languages Required. The app cannot safely infer the actual language requirements.
- The field Point form of essential skills, education & experience is currently displayed under Preferred Qualifications. Content Creation Lead explicitly says a qualification is a must there. Required versus preferred intent needs clarification from role owners.
- Five substantive roles have start dates before the audit date. Confirm whether these are still intended dates; do not infer that these openings must be closed.
- The onsite Candidates role puts programme/travel instructions into Location / Base, and its zero-month duration is grouped as 0–3 months. Its actual seven-day programme length is only in responsibilities.
- The Airtable Role Type field description says do not display on Opp Board, but the app displays and filters it. Resolve the outdated description versus current product intent.

## Formatting fixes in this change

- Text lists split on line breaks, never commas. Existing multi-select arrays preserve their options and commas.
- Required and preferred qualifications omit Other and trailing Specify instructions, append provided custom text, and remove duplicate bullets. Missing specific requirements are not invented.
- Location / Base is always shown when supplied. Work Type appears as supporting text when different, and is the fallback when location is absent.
- Responsibilities already used newline-only splitting. No parser should guess which lines are subheadings or rewrite the content.

## Every published role

| Role | Record | Findings / source-owner action |
| --- | --- | --- |
| Project Coordinator - GE Programme Management Office (PMO) | `recwizEXNnoZzW8y8` | Digital-tools authoring instruction leaks into required qualifications; Start date 2026-01-26 has passed; confirm; Overview, weekly hours and Team/Vertical are blank |
| HR Partner, Heritage Journeys - GE People & Culture (HR) | `recSFl9qJ6BYDoFTC` | Incomplete listing: no responsibilities, qualifications, location, work type, languages, start date, overview, or weekly hours; Overview, weekly hours and Team/Vertical are blank |
| HR Assistant, Camps - GE People & Culture (HR) | `recEW6Q7AsFgsQ7gx` | Incomplete listing: no responsibilities, qualifications, location, work type, languages, start date, overview, or weekly hours; Three published records have this same title; clarify distinctions; Overview, weekly hours and Team/Vertical are blank |
| HR Assistant, Camps - GE People & Culture (HR) | `rec4RJnWY5XadUaPo` | Incomplete listing: no responsibilities, qualifications, location, work type, languages, start date, overview, or weekly hours; Three published records have this same title; clarify distinctions; Overview, weekly hours and Team/Vertical are blank |
| HR Assistant, Camps - GE People & Culture (HR) | `recmPV7xU5D1KXCBV` | Incomplete listing: no responsibilities, qualifications, location, work type, languages, start date, overview, or weekly hours; Three published records have this same title; clarify distinctions; Overview, weekly hours and Team/Vertical are blank |
| HR Partner, Camps - GE People & Culture (HR) | `recPycnO9tPzSc2gv` | Incomplete listing: no responsibilities, qualifications, location, work type, languages, start date, overview, or weekly hours; Overview, weekly hours and Team/Vertical are blank |
| Team Lead, Marketing and Communication - GE Camps | `reccltdtc4TfwK2JL` | Location exists but Work Type is blank (location previously hidden); Other selected with custom text supplied; Start date 2026-09-30 has passed; confirm; Overview, weekly hours and Team/Vertical are blank |
| Content Creation Lead  - GE Communications & Stewardship | `rec5NcSYqe3tElvFe` | Digital-tools authoring instruction leaks into required qualifications; Must-have education/software skill is currently presented as preferred; role owner must confirm placement; Responsibilities mix category headings with individual tasks; author should flatten to one complete action per line; Overview, weekly hours and Team/Vertical are blank |
| Deputy Lead - Project Management Office - GE Programme Management Office (PMO) | `receqBInKQGVjt2Mi` | Location exists but Work Type is blank (location previously hidden); Digital-tools authoring instruction leaks into required qualifications; Weekly hours entered in Languages Required; move/correct source field and supply actual languages; Start date 2026-10-12 has passed; confirm; Responsibilities include a redundant section-title line; Overview, weekly hours and Team/Vertical are blank |
| Candidates - Camps Leadership Programme - GE Camps | `recV51UHdoW2K7Czy` | Other selected without custom required qualifications; Location contains travel/programme instructions; replace with concise location and put instructions in role details; Seven-day programme is represented as 0–3 months; confirm desired duration wording; Overview, weekly hours and Team/Vertical are blank |
| Arts Resource Hub Coordinator - Global Arts Initiatives | `recVbHRKXcfgnSdJZ` | Location exists but Work Type is blank (location previously hidden); Other selected without custom required qualifications; Digital-tools authoring instruction leaks into required qualifications; Start date 2026-10-05 has passed; confirm; Overview, weekly hours and Team/Vertical are blank |
| National Coordinator – Centre for Arts - Global Arts Initiatives | `recPPneXZgF21DEH6` | Specific-systems authoring instruction leaks into preferred qualifications; Start date 2026-10-04 has passed; confirm; Overview, weekly hours and Team/Vertical are blank |

## Ownership

Application formatting fixes can ship independently. Role owners must confirm content corrections, publication status, duplicate openings, qualification intent, and dates. Update the Airtable role intake form with the companion field-entry guide before asking contributors to complete missing records.
