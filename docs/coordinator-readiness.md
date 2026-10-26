# Coordinator rollout: UI cleanup and release evidence

## What changed

The 26 October review prioritized structure and concise information over adding
more panels or tables. The changes retain the approved colors, typography,
light/dark themes, existing routes and backend permissions.

| Surface                            | New structure                                                                                                                                                                                                                          | Behavior retained                                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared workspace                   | Short pages start below the header consistently. The standalone page's automatic vertical margins no longer center them beside the tall sidebar. Mobile navigation uses registered sidebar theme utilities.                            | Role-specific navigation, focus containment, logout and theme selection.                                                                                     |
| Academic years                     | Current-year summary and actions share a header area. Saved years use responsive columns; term summaries and the three term editors use available horizontal space. Repeated year/term headings and nested fieldset boxes are reduced. | Date validation, exactly three terms, review before write, explicit current-year selection, conflict handling and retained edits.                            |
| Activity types and section library | Compact name/status/type summaries with Edit actions. Editors open on demand; the add form sits beside the records on wide screens. Filters have a sensible width; individual records use separators instead of full bordered panels.  | Save/discard, ordering, system-section restrictions, explicit uncertain-save reconciliation, duplicate-submit blocking and paging/filter locks during edits. |
| Account recovery                   | Responsive name/status/action entries replace the wide queue table. Email, request timestamps and delivery history live in the existing details view and confirmation dialog.                                                          | Stored recipient, reviewed send, idempotency keys, role/session checks, delivery errors, paging and pending-send protection.                                 |
| People                             | A responsive directory shows name, role/class and expandable details. Email and account metadata are no longer stacked into a table cell.                                                                                              | Search, role filters, pagination, registration state and existing invitation flows.                                                                          |
| Curriculum                         | Lesson editors use responsive columns with simple separators rather than a full card for every lesson.                                                                                                                                 | Fixed levels/numbers, title validation and retained/uncertain edits.                                                                                         |
| Issues                             | Independent issues share a responsive grid with lighter separators.                                                                                                                                                                    | Role visibility, resolution controls, retained input and history.                                                                                            |

Tables remain for column comparisons such as attendance, progress, sessions,
report lists and invitation delivery tracking. Dense nested cards are not required
for every independent item. Details are hidden visually until requested, not
removed from the authorized API response; this is presentation, not a change in
data access permissions.

## How to inspect the new interactions

- In Activity types or Section library, choose Edit. Focus moves to the name
  field. Unsaved or uncertain edits prevent closing that editor; save or discard
  before closing. Closing returns focus to its Edit action.
- In People, expand View details to inspect the email and account metadata.
- In Account recovery, View details opens the existing request URL. Sending
  still requires reviewing the stored recipient and confirming; opening details
  does not send email.
- In Academic years, Add/Edit opens the date form. Review changes remains a
  separate step from confirmation, and setting the current year is still explicit.

## Validation and deployment boundary

The six `release-layout.spec.ts` journeys cover academic years, activities,
sections, recovery, People and Curriculum with populated fixtures at 390, 768 and
1440 pixels in both themes. They check no document overflow, consistent heading
placement, desktop columns, concise recovery presentation and expandable People
details. Screenshots and accessibility scans supplement the geometry checks.
These are local fixture-backed observations, not live database acceptance.

The complete 246-case browser suite passed against the webpack production build,
including existing save, permission, recovery, navigation and export journeys.
All 140 logic tests passed. Changed-file ESLint, Prettier, strict TypeScript,
production compilation and whitespace checks passed. The six new layout journeys
produced 36 populated viewport/theme screenshots; representative desktop, mobile
and theme captures were inspected. No new live report or account mutations were
performed during these fixture-based checks.

The initial development runs exposed contrast defects that were corrected. Some
development navigation checks stalled while destination routes compiled. Those
partial runs were stopped and replaced by the complete passing production run;
they are not included in the 246 passing result. Some older fixtures do not mock
the notification badge and log refused connections to an absent local API; the
browser suite still passed. These local fixture warnings are not evidence of a
deployed backend outage.

Ignored evidence: `artifacts/readiness-production-browser.log`,
`artifacts/readiness-production-tests/`, `artifacts/readiness-build.log`,
`artifacts/readiness-logic.log` and `artifacts/readiness-lint.log`.

The earlier deployed startup/download evidence and repeatable script are now
included in [release performance acceptance](release-performance-acceptance.md).
The companion backend proxy fix is
[backend PR38](https://github.com/ilead-dev-team/ilead-backend/pull/38); its local
667-test suite and hosted `check`/`postgres` jobs passed before this document was
prepared. Merge, deployment and live hosting-path qualification remain separate
from those passing checks. No migration or new secret is required.
