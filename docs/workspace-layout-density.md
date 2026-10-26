# Workspace layout density

Search controls should use a compact, borderless toolbar. Keep labels above their
fields, remove the field's usual trailing margin inside the toolbar, and align
actions with the input rather than the label. A search field may grow to a useful
reading width, but should not stretch across an otherwise empty bordered panel.

The Reports toolbar groups search, report status and archive filtering. People
search, invitation filtering, Roundtables search/filtering and Sessions date/year
filters use the same compact principle. Labels, routes, query parameters and
validation are unchanged.

All selects use the shared `Select` component. The control remains a native
select, preserving option selection, keyboard navigation and form integration.
A decorative, pointer-transparent chevron is centered 14px inside the trailing
edge; padding reserves room for it. It follows theme tokens and disabled state.
Windows forced-color mode restores the native arrow. Account disclosure chevrons
use the same size and rotate with their open state.

Sparse collections use the shared `compact-records` grid: notifications,
reminders, registered devices, report versions and the report section picker.
Cells begin at a useful 280px width, fit more columns where room permits and
collapse naturally to one column on phones. Simple separators replace repeated
notification, reminder, device and completed-lesson boxes. Dashboard summary lists
also use available columns. The notification popover remains a compact single
column because its width is constrained.

Dashboard Excel downloads and Coordinator reminders share a responsive utility
grid. They use simple top separators rather than separate full-width outer boxes;
on phones they return to a single readable column.

Buttons directly inside grid panels keep their content width. Multi-column data
tables remain for reports, sessions, roundtables, invitations and session entries:
these compare multiple attributes or contain coordinated input controls. Their
scroll containers continue to contain horizontal overflow on small screens.
Printable report tables and document styles are outside this UI change.

Verification includes production compilation, strict TypeScript, logic checks,
focused source lint and the complete browser suite. The Reports layout case
asserts matching search input/button top edges and heights at desktop, 320px and
390px, and checks the select arrow's inset and vertical centering. Existing browser
cases cover searching, paging, selection, disabled controls, disclosure, editing,
notifications, devices, both themes and accessibility. Fixture-backed checks do not
certify deployed data or every operating system's native option popup.

Local results on 26 October 2026: all 140 logic tests and all 246 complete browser
cases passed against the production webpack build. After visual review identified
the dashboard utility follow-up, a fresh production build and all 10 dashboard
cases passed. Strict TypeScript, focused source lint, formatting and whitespace
checks passed. Reports desktop/mobile and dashboard screenshots were visually
inspected. These results precede PR review, merge and deployed verification.

## Shared platform layout

The dashboard, administration, sessions, reports, roundtables and general workspace
screens compose `workspace-surfaces.module.css` rather than maintaining separate
page, panel and table-container rules. This keeps heading scale, vertical rhythm,
mobile padding and overflow behavior consistent. Domain-specific grids and dense
editing tables remain in their screen modules. Account entry pages and printable
report content retain their purpose-specific layouts and existing brand tokens.

The workspace header identifies the current area. Dashboard content follows this
order: welcome and primary action, summary metrics, filters, attendance/report
charts, distribution charts, operational lists, then downloads and reminders.
The existing charts, source data, role restrictions and approved colors remain.
Dates and roundtable selection sit under "More filters"; closing that disclosure
does not clear draft values. Apply and Clear keep their existing semantics, and
exports remain disabled when filters have unapplied changes. Primary filters and
actions share a row where space permits and wrap on smaller screens.

Facilitator pages use the same left alignment and spacing as other workspace
pages, with a readable width for registration and roundtable details. Sparse
collections use responsive grids; tables remain where comparing multiple fields
or entering session data benefits from aligned columns.

Shared-layout follow-up verification on 26 October 2026: the final production
webpack build and its TypeScript phase passed, all 140 logic tests passed, and
all 246 browser cases passed (5.1 minutes, two workers). Focused lint, formatting
and whitespace checks passed. Dashboard screenshots were inspected on desktop,
tablet and phone; Reports and administration screenshots were also reviewed.
The fixture suite emits expected local API proxy connection warnings for
unmocked background requests; it does not run a production backend. These
results cover the local build, not a merged or deployed release.
