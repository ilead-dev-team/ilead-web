# iLead web

Production Next.js App Router application for the iLead program at Rwanda Coding Academy. Backend business rules and authorization remain in the Express API. Requirements live in `ilead-platform-docs`; the `ilead-ui-ux` repository remains a simulated design reference and is not modified by this implementation.

## Run locally

Use Node 24 (minimum 22.13), `npm ci`, copy `.env.example` to `.env.local`, then `npm run dev`. Open http://localhost:3000. Run the backend separately on port 4000 and set its WEB_ORIGIN to http://localhost:3000. No Docker is needed. Do not migrate or seed a shared database merely to start the web app.

API_ORIGIN is a server-only origin, normally the Render API URL in Vercel. The browser calls relative `/api/v1` paths through a Next rewrite. Never put an access/refresh token, API secret or mailbox credentials in NEXT_PUBLIC_ variables, browser storage or frontend source. Set the backend's WEB_ORIGIN and fixed mailbox callback to the deployed web origin and `/mailbox/callback`. Remote production API origins require HTTPS. Changing the build-time rewrite target requires a new build.

## Implemented slice — W1.10

| Route                           | Purpose                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/login`                        | Login, bounded silent refresh, role-safe return destination; no sign-up                                            |
| `/forgot-password`              | Neutral recovery request confirmation                                                                              |
| `/reset-password?token=…`       | Password confirmation, one-use link errors, success only after backend acknowledgement; query scrubbed after mount |
| `/invite/:token`                | Live invitation lookup, locked email/role, class where required, acceptance and role routing                       |
| `/dashboard`                    | Basic live summary cards for staff; no invented stats when the academic year is missing                            |
| `/register-roundtable`          | Facilitator gate, live curriculum dropdowns, name checking and registration                                        |
| `/my-roundtable`                | Basic current roundtable/lesson view                                                                               |
| `/mailbox`, `/mailbox/callback` | Coordinator connection, one-time OAuth completion, disconnect with explicit unconfirmed-provider guidance          |
| `/people/recovery`              | Coordinator request list, idempotent reset-email issuance and delivery feedback                                    |

These are a foundation, not the complete program/report UI. Full dashboards, configuration, session/entry/report/feedback screens, history/issues and notification/push controls remain later tasks. Account-menu password change remains later shell work; its API already exists.

## How requests and sessions work

A form validates with React Hook Form/Zod, then TanStack Query calls the shared API client. The browser sends HttpOnly cookies through the same-origin rewrite. Express verifies the current account, role and live refresh family, performs the transaction and returns safe JSON. Protected content is withheld until `/auth/me` succeeds; frontend routing is not a replacement for backend authorization.

One refresh promise is shared inside a tab. Where Web Locks is supported, tabs serialize refresh and recheck the session after acquiring the lock, avoiding simultaneous rotation of a shared refresh cookie. Browsers without Web Locks retain per-tab coordination only; multi-tab races remain a compatibility limitation to test. Public login/reset/invitation requests never auto-refresh. A protected 401 may refresh/retry once; network failures do not automatically retry uncertain mutations. Requests have a sixty-second timeout and display server-waking feedback after five seconds. Failed forms retain typed values; backend success is never simulated in production.

Login/acceptance clears old query-cache state before role routing. A Facilitator without a roundtable goes to registration; staff go to the dashboard. Only an explicit per-role list of safe internal return routes is accepted. Logout revokes the backend family and clears the cache after success. Session validation also runs on window focus. No tokens are persisted in localStorage; it stores only the theme.

The theme script applies saved light/dark choice before first paint, with light as first-visit default. Tokens and supplied logo assets come from the approved UI reference. Supporting copy on muted surfaces uses foreground tokens to meet contrast checks. Forms have labels, described errors, live feedback and keyboard focus; a skip link and reduced-motion behavior are included.

All pages send no-referrer/noindex headers. Reset query codes and OAuth callbacks are scrubbed from the current URL after mount; invitation URLs remain bearer links. Hosting/proxy access logs must redact invitation tokens and reset/OAuth query values. Do not add third-party analytics to account pages. Tokens may remain in provider/browser infrastructure; URL scrubbing does not erase external logs. No real OAuth credentials or deployment was configured here.

## Checks

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (9 logic cases).
- `npm run test:e2e`: 10 headless browser cases with explicit API response substitutes. On Windows uses installed Edge; CI installs Chromium. Includes theme persistence, desktop/mobile layout, keyboard skip link, light/dark axe checks, form failures, privacy/role routing, callback/disconnect and registration.
- `npm run test:backend-browser`: 3 browser journeys through the actual sibling Express handlers and Next rewrite. Requires `../ilead-backend` with dependencies installed. The opt-in harness uses the backend's transactional database/provider substitutes; no PostgreSQL or Gmail connection. It verifies login/logout cookies, invitation activation and emailed reset-token consumption. Dashboard responses are substituted because program setup is outside these auth checks. This optional cross-repository check is not part of standalone CI.
- Runtime `npm audit --omit=dev`: zero advisories at implementation time. Full audit reports five high entries in the development-only Next ESLint plugin → fast-glob → micromatch → braces chain (GHSA-vfj7-8cjw-p6xm). No patched braces release was available from the registry; do not force an unrelated framework downgrade. Revisit the tooling dependency before release; never process untrusted patterns with it.

CI runs install, lint, type checking, unit checks, build and standalone browser checks. Local checks do not prove a clean Linux CI installation or hosted deployment; inspect PR checks. Live database migrations/concurrency/rollback, Gmail consent/delivery, actual devices, production proxy/log redaction and full UAT remain acceptance gates. Do not call this slice production verified.

Framework setup follows the official [Next backend-for-frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend) and [Tailwind Next setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs). The dependency lockfile pins the installed package graph.

## Delivery recovery · 18 October 2026

Original PR #1 was closed without merging. This branch recovers the preserved, tested commits `81b79dd` and `0b5635c` onto current bootstrap main; it does not execute or copy the rewritten remote feature head. Before recovery documentation and CI hardening, comparison with `0b5635c` showed only three inherited `.gitignore` lines. Application source, package scripts, dependency lockfile and ESLint configuration matched that known-safe commit exactly.

CI checkout now sets `persist-credentials: false`, alongside read-only workflow permissions, so subsequent build/test scripts do not inherit checkout's Git credential. Required reviews and passing checks still need actual branch protection activation; these workflow settings alone do not enforce merge gates. Safe recovery is a repository delivery repair, not real database, Gmail or deployment acceptance.

## W2.08 first operations slice: issues

The /issues workspace connects registered Facilitator submission/history and Coordinator resolution to the existing Express issue endpoints. Sponsors are redirected before issue data is requested; backend role/ownership checks remain authoritative. Input is validated with React Hook Form/Zod, response dates/shapes are checked before display, and query keys include account and role. Status filters reset pagination; errors, empty lists, retry and server-waking states are explicit. No optimistic success or automatic lesson correction is simulated. Failed submissions/resolutions retain typed content; forms clear only after a validated backend acknowledgement. Resolution retries use the backend's idempotent operation.

The UI uses the approved theme tokens, accessible labels/status messages, wrapped text and mobile layout. Shared primary-button hover now darkens rather than fades the button: the earlier opacity hover fell below text contrast requirements. The issue page passes light/dark axe checks, including the hovered submit button. Screenshots under ignored artifacts were visually inspected.

Checks for this slice: 12 logic tests; the original ten account browser cases and four issue browser cases (Facilitator failure/success/history, Coordinator failed-note preservation/resolution, pagination/filter reset, Sponsor redirect with zero issue requests). Browser checks substitute API responses explicitly; they do not prove real PostgreSQL/provider/end-to-end integration. Production source always uses the real API client. Configuration, roundtable-management and session-entry screens remain W2.08 work; report builder/feedback screens remain W2.09. No Docker or live database writes.

## W2.08 curriculum editing

`/curriculum` lets Coordinators and Sponsors edit lesson titles, with fixed lesson numbers and levels. Each save sends only a trimmed title (1–200 characters) to the existing Express endpoint. Failed saves retain text; success requires a validated server acknowledgement. Successful writes invalidate all curriculum query caches, including the registration dropdown. Facilitators are redirected away from the editing screen; Express remains responsible for authorization.

The screen provides loading, retry, field validation and per-lesson save feedback. Tests cover title boundaries, role return routes, failed-save preservation, successful reload, mobile overflow and light/dark accessibility. Browser API responses are explicit test substitutes, not real PostgreSQL acceptance. Activity-type and section-template settings, roundtable management and session entry remain W2.08 work. No Docker or database writes were used.

## W2.08 roundtable management and history

`/roundtables` gives Coordinators and Sponsors paginated search, class/level/status filters and sorting. `/roundtables/:id` shows current/next lesson, completion state, level-filtered completed lessons and attendance history. Enrollment baseline lessons are labelled Before registration rather than given invented dates. The existing Facilitator `/my-roundtable` now uses the same history view for the session-owned roundtable ID. Sponsors receive no edit or lifecycle controls.

Coordinators and owning Facilitators can edit name, slogan and class only; progress fields are never sent. Backend similarity checks remain authoritative. Failed saves retain input and successful validated acknowledgements refresh roundtable caches. Coordinator trash actions require confirmation, keep the name reserved and detach the Facilitator; `/roundtables/trash` displays the server restore deadline. Restore failures remain visible, and the backend enforces the 30-day window and original-Facilitator eligibility. Lifecycle success refreshes roundtable and dashboard caches. There is no permanent-delete control or automatic network retry.

Checks for this slice: 17 logic tests and 19 browser cases, including filter paging, trash confirmation/cancellation, blocked/successful restore, own detail editing with failed-name preservation, baseline/session history, light/dark accessibility, mobile overflow and Sponsor read-only/trash restrictions. Screenshot inspected. Browser API responses are explicit substitutes; real PostgreSQL, provider and deployment acceptance remain pending. No Docker or live database writes. Session-entry screens remain the next W2.08 slice.

## W2.08 activity and section settings

Coordinator-only `/settings/activities` and `/settings/sections` connect to the existing Express configuration endpoints. Activity types support creation, renaming, numeric positions and active/inactive state; historical records are retained. Custom sections support title/kind on creation, later renaming and archive/restore through the availability checkbox. Kind and system flags are read-only after creation, and system sections have no archive control. The backend still enforces roles, uniqueness and protected-system rules.

Lists request 20 records per page, with state filters that reset paging. Input limits match backend constraints. Failed requests retain input; writes validate the returned record before showing success and invalidate account-scoped list caches. New activity/section forms clear only after acknowledgement. No optimistic writes or automatic network retries are used.

Verification includes 16 logic tests and 19 browser cases, including duplicate errors, activity edits/position/deactivation, create, custom section archive/restore, system protections, filter paging and denied Sponsor routes with zero settings requests. Activity light/dark axe and mobile overflow checks and section light axe checks use explicit API substitutes. Screenshots were visually inspected. Real database acceptance, roundtable management and session-entry screens remain pending. No Docker or live database writes.

Formatting for all files changed in this settings slice passes. The optional repository-wide Prettier check flags 41 unchanged baseline files; those unrelated files were not reformatted.

After integrating the merged settings slice, the combined suite contains 19 logic tests and 22 browser cases. Both settings and roundtable routes remain included.

## W2.08 session management

Coordinator-only `/sessions`, `/sessions/new` and `/sessions/:id` connect list, create, edit, cancel and reopen operations to the existing Express APIs. Lists support status/date filters and pagination. Date ranges are validated before fetching. Activity options load across pages; historical inactive activities remain editable on their existing session. Notes and selections survive failed writes. Creation disables repeat submission after acknowledgement while navigating to the new session.

Cancellation requires a reason and confirmation; reopening also requires confirmation. Cancelled sessions hide the edit form. The backend enforces term/year coverage, date uniqueness, date locking and the entry/report cancellation guards. The UI does not remove entries, invent progress or retry uncertain writes automatically. Successful acknowledgements refresh session and dashboard caches.

Tests cover calendar failure recovery, creation navigation, retained inactive activities, metadata edits, blocked cancellation with preserved reason, successful cancellation/reopening, filter page reset, invalid date ranges and Coordinator-only route access. Light/dark axe and mobile overflow checks passed; screenshot inspected. Browser APIs are explicit substitutes. No Docker or live database writes. Remaining session work: paginated bulk entry editor, academic-year/term filters and report links/building. Real database/provider/deployment acceptance remains pending.

Integrated session-management validation: 22 logic tests and all 26 browser cases passed after bringing in the merged roundtable workspace. Lint and changed-file formatting passed. The initial route-helper import was corrected; stale generated routes were refreshed.

## W2.08 bulk attendance and lesson entries

Held-session details now open a Coordinator-only entry editor. Rows come from the backend eligibility query, including historical saved entries needed for correction. Untouched rows stay pending. Attendance uses Met/Did not meet; Met rows choose an existing curriculum level/lesson rather than typed lesson names. Search, class/current-level and Only pending filters reset pagination. Drafts are keyed by roundtable ID and survive page/filter changes. The draft summary includes hidden rows and offers per-row discard.

Save sends only changed rows, with a maximum of 100 in one atomic backend request. Did not meet never sends lesson fields. Non-next/cross-level choices show expected and selected lessons and require explicit confirmation; skipped lessons remain incomplete. Server-requested confirmation also requires another user action. Structured row errors, including already-completed lessons, preserve all drafts. Malformed acknowledgements preserve drafts too. Valid success refreshes entry lists, sessions, roundtable progress/history and dashboard caches. Uncertain network failures are not retried automatically. Cancellation controls are withheld while drafts remain; cancelled sessions never mount the editor.

Drafts live only in memory for the mounted session page, not browser storage. Page/filter changes preserve them; leaving the route discards them. Copy explicitly asks users to save before leaving; browser reload/close gets a native unsaved-change warning. Same-app navigation has no custom interception. The backend remains authoritative for duplicates, progress recomputation, completion and notification delivery. This UI does not claim those rules were verified against a real database.

Checks include 26 logic tests and 30 browser cases after integration, with entry-specific pagination/filter draft preservation, failed atomic saves, touched-row payloads, non-next review, structured row errors, malformed acknowledgements, server warnings, cancelled-session exclusion, light/dark axe, mobile overflow and no duplicate React keys. Screenshot inspected. Browser APIs are explicit substitutes. No Docker or live database writes. Academic-year/term filters and report building remain next; real PostgreSQL/provider/deployment acceptance remains pending.

Hosted CI caught an existing shared-button contrast failure during the immediate switch to dark mode: color interpolation temporarily produced a 3.14:1 contrast ratio on Log out. Shared buttons now change theme colors immediately, avoiding unreadable intermediate foreground/background combinations. Accessibility assertions remain enabled.

## Session academic-year and term filters

The Coordinator session list reads configured academic years and their terms from the existing academic API. Calendar choices load across all 20-record pages and validate IDs, dates and term numbers before display. Choosing a year exposes only its terms, clears the previous term and resets session paging. Changing a term resets paging too. Clear calendar filters removes only year/term selections; status and applied date filters remain. Current-year labels are informational, with All academic years as the initial scope.

Calendar lookup has loading, failure/retry and empty-setup feedback. Session browsing remains available when calendar lookup fails. Failed refreshes preserve existing choices rather than silently broadening the filter. Requests carry cancellation signals, so leaving the view can cancel an unfinished lookup. No calendar records are created or modified by these filters.

Verification covers paginated calendar lookup and abort propagation, malformed response rejection, parent-year/term scoping, paging resets, clear-filter semantics, failed lookup/retry, no invented options for empty calendars, light/dark accessibility and mobile overflow. Browser API responses are explicit substitutes, not real PostgreSQL acceptance. No Docker or live database writes. Report building remains next.

Calendar-filter validation: all 28 logic tests and 33 browser cases passed locally, along with lint, type checking and changed-file formatting. Mobile screenshot inspected.

## Report authoring and delivery foundation

Staff Reports navigation opens paginated status/search/archive views and report details. Coordinators see permitted live working reports; Sponsors receive read-only sent snapshots. Sponsor response parsing rejects DRAFT/FINAL records before rendering, including list responses; it never falls back to live content. The backend remains authoritative for snapshot privacy and first-read notifications. Facilitators are redirected before report requests.

A held session links its existing report or lets its creator create the initial report with mandatory/preselected sections. Unsaved entry changes disable creation. The draft author can edit narrative text, bullet lead-ins/sentences and custom tables, add one-off sections, and remove/reorder optional sections. Summary stays first and mandatory sections have no removal control. Progress tables are read-only; session entry corrections and an explicit refresh generate their lesson rows. Existing section IDs are preserved; client-controlled metadata flags and temporary IDs are not sent. Failed saves retain local content; only validated server acknowledgement clears it.

Save report is explicit in this slice. Unsaved edits disable confirmation and regeneration. Confirm locks saved content as Final; Send to Sponsor requires a separate confirmation and uses the backend snapshot/notification workflow. Failures retain the previous state. Authors can reopen for rework, with Sponsors keeping the last sent snapshot. Other Coordinators can take over drafts after confirmation. Regeneration warns before replacing progress/highlights content. Archived reports have no editing/lifecycle controls. Frontend action checks are repeated before requests, while backend ownership/state checks remain authoritative.

Content preview renders text, bullets and tables safely as React content; it is not yet an institutional DOCX-layout preview. Drafts remain in memory only, with a native reload/close warning and save-before-leaving guidance; same-app navigation is not intercepted. The editor remounts when opening another report so drafts cannot migrate between reports. Automatic saving, library section selection/save-to-library, comments/change requests, version-history UI, export downloads, archive/unarchive actions and the document-fidelity preview remain follow-up work. Manual save is clearly labelled; this is not complete report acceptance.

Verification covers author create/edit/failure/confirm/send/reopen, takeover, generated-section confirmation, custom tables and bullet edits, mandatory/progress protections, archived read-only state, Sponsor privacy rejection and Facilitator exclusion. Browser APIs are explicit substitutes; no real notifications were sent, no Docker was used and no live database writes occurred. Real PostgreSQL/provider/deployment acceptance remains pending.

Report-foundation validation: 33 logic tests and all 39 browser cases passed locally, plus a focused rerun of optional-section move/remove and custom-table checks. Lint, strict TypeScript and changed-file formatting passed. Mobile full-page and focused custom-table screenshots were inspected.

## Report comments and change requests

Report details load discussions on demand through Show comments and feedback, or automatically for an authenticated `#comments` link. Root comments and direct replies use separate 20-record pages. Coordinators can anchor a new comment to a report section. Labels distinguish private Coordinator discussions from Sponsor-visible comments; missing historical section titles have an explicit earlier-version label. Text renders as plain React content.

The backend computes visibility: draft/final comments are private, private threads stay private after sending, and replies during rework can remain private. The client never submits a visibility flag. Sponsor parsing rejects an entire root/reply response containing private data or an incorrect parent reference. The backend remains the authorization boundary, including published snapshots and filtered reply counts. A Sponsor viewing the last published snapshot may temporarily be unable to post while the live report is reopened; the server error preserves their message.

Sponsors enter a required reason, review it, then explicitly confirm Flag for changes. Coordinators explicitly confirm resolution of an open change request. Validated acknowledgements refresh discussion and report caches, so counts and effective status come from the backend rather than a guessed local transition. Failed writes and malformed acknowledgements keep messages and confirmation intent. Mutations are not optimistically applied or retried after uncertain network failures. Archived discussions remain readable with all write controls withheld.

Reply drafts survive root pagination, but all drafts are memory-only and scoped to report, account and role. A reload/close warns about unsent messages; same-app navigation has no custom interception. Save messages before leaving. Browser tests use explicit API substitutes; actual persistence, filtered database reads and notification delivery still need isolated PostgreSQL/provider acceptance. No Docker or live database writes are used. Automatic report saving, library insertion/save-to-library, version history, exports, archive/unarchive actions and the institutional document preview remain separate follow-up work.

Feedback validation: all 36 logic tests and 45 browser cases passed locally, including six feedback cases for retained root/reply drafts, section payloads, paging, required flag confirmation, resolution failure/success, Sponsor private-response rejection, archived controls, blocked live-rework posting and malformed acknowledgements. Mobile light/dark axe and overflow checks passed; screenshot inspected. Lint, strict TypeScript, production build and formatting for changed files passed.

## Report section library integration

The draft author can browse available section templates from the report editor, in pages of 20, and add an optional template once per report. Lookup starts only after Browse section library. Loading, empty and retry states do not replace report edits. Mandatory, already-included and unavailable templates cannot be added; the report's 30-section limit still applies. Added sections start with empty content matching their type. Library titles and types stay locked; automatic highlights can be refreshed through the existing session-data action after saving.

New library sections send `templateKey` when the report is saved; existing sections keep their server `id`. Client metadata flags and temporary IDs are omitted. The backend validates availability, locked metadata, uniqueness, ownership and report state. Removing an optional section makes that template selectable again.

The custom-section form has an explicit Save section structure to library checkbox. Without it, Add custom section only changes the local report draft. With it, the existing section-template API creates a reusable title/type, and only a valid acknowledgement adds the new section to the draft. Templates save no narrative content and are never preselected. Failed or malformed responses retain the form. Library creation and report saving are separate operations: discarding report changes does not undo a successfully created library template. No distributed rollback or automatic retry after uncertain writes is claimed. Save report persists the new section's actual content.

Only an unarchived draft's current Coordinator author receives these controls. Sponsor, non-author and archived views do not mount the picker or fetch library choices. Browser verification uses controlled API responses, not live persistence acceptance. No Docker, real notification delivery or live database writes. Report autosave, version-history/export UI, archive actions and the institutional document preview remain follow-up work.

Library-integration validation: all 39 logic tests and 49 browser cases passed locally. Four library browser cases cover paging/retry without draft loss, template-key insertion, returned-ID reuse on later saves, duplicate prevention/removal, opt-in versus one-off creation, failed/malformed acknowledgement recovery, empty choices and restricted views with zero library calls. Mobile light/dark axe and overflow checks passed; screenshot inspected. Lint, strict TypeScript, production build and changed-file formatting passed.

## Report autosave

The current Coordinator author of an unarchived draft now gets report-content autosave after five seconds without edits and when a content input loses focus. Clicking an editor action button keeps that action in control; Save report remains an explicit immediate save, while structural changes still schedule the idle save. New custom-section form fields and feedback messages have their own submission flows and are not autosaved as report content. The header shows unsaved, saving or acknowledged saved content, with the latest successful save time. This supersedes the earlier manual-save-only report limitation.

Only one report save runs at a time. Each request contains a fixed section snapshot. A validated response must match the requested report, author, draft state, section identities/metadata, order and content before it can mark anything saved. If typing continues during the request, the response updates server-assigned section IDs while preserving newer local content; the next idle save sends those newer edits. Stable editor keys keep focus when temporary section IDs become permanent. Narrative fields remain usable during saves; structural and lifecycle actions wait. Confirmation, regeneration and sending remain explicit and cannot use an unsaved draft.

A failed request or malformed acknowledgement pauses automatic writes and retains the current draft, including later typing. Save report explicitly retries the latest draft; only a successful acknowledgement resumes autosave. This deliberately uses truthful Not saved / retry guidance rather than the template specification's provisional retrying label: uncertain writes are not blindly retried. Invalid local content is reported before an API request and can autosave after correction. Discard cancels a waiting idle save. Timers are cleaned up on unmount, and editor state is scoped to report/account/role.

Drafts remain memory-only, with native reload/close warnings. Same-app navigation is not intercepted and a blur save is not guaranteed to finish before leaving; wait for saved confirmation. This protects edits made within this editor while a request is pending; the existing backend has no edit-revision precondition for concurrent tabs/devices, so cross-tab conflict resolution is not claimed. Use one editor per report. Browser APIs are controlled substitutes; real PostgreSQL/provider/deployment acceptance remains pending. No Docker or live database writes. Remaining report work includes version history/export UI, archive actions and the institutional document preview.

Autosave validation: all 42 logic tests and 53 browser cases passed locally. Four autosave browser cases cover the five-second idle boundary/reset, immediate blur save, serialization during a delayed response, newer-text and keyboard-focus preservation, reuse of returned section IDs, failure pause/manual retry, malformed acknowledgements, local validation/correction and discard cancellation. Existing report fixtures now accept intermediate blur saves and assert final content; library tests explicitly substitute save failures where drafts remain unsaved. Mobile light/dark axe and overflow checks passed; saved-status and full report screenshots inspected. Lint, strict TypeScript, production build and changed-file formatting passed.

## Report version history and Word downloads

Report details offer Export current report .docx plus an on-demand sent-version list with 20-record pages, loading/empty/retry states and a separate read-only snapshot preview. Viewing old content never replaces the working draft or mounts historical editing controls. Snapshot parsing requires published status and matching report/session/version IDs; bad responses never fall back to current content. Table landmarks include the selected version so current and historical previews remain distinguishable to assistive technology.

Current export is disabled while report changes are unsaved or a report write is pending. Coordinators export saved draft/final content or the latest published sent content; Sponsors always receive the permitted published snapshot, including during private rework. Selected-version export uses the companion backend endpoint `GET /reports/:id/versions/:v/export/docx` and that version's immutable snapshot. Both current and historical exports remain available for archived sent reports. Facilitators do not mount these controls.

Binary downloads use the existing API client's HttpOnly-cookie, coordinated refresh and timeout handling. Failed HTTP requests remain errors; a successful body must have the Word MIME type, nonzero size and ZIP signature before any file is offered. This catches mistaken HTML/JSON/error downloads; it is not a client malware scanner or proof of DOCX package fidelity. The backend's renderer and ZIP tests cover actual Word structure. Filenames are generated from validated report dates/version numbers, not arbitrary response-header paths. Temporary object URLs are revoked, leaving the route aborts an unfinished request, and success copy says handed to your browser rather than claiming the file was saved on disk. Network failures are not automatically retried.

Merge the companion backend historical-export PR before this web change. Browser tests use controlled API responses; real PostgreSQL/provider/deployment acceptance remains pending. No Docker, live database writes or real notifications. Existing autosave memory-only/navigation/concurrent-tab limits remain. Remaining report work includes archive actions and institutional document-style preview.

History/download validation: all 45 logic tests and 58 browser cases passed locally. Five history cases cover lazy list paging/retry, published-only and identity-checked snapshots, HTTP/MIME failure without downloads, current/historical browser download events and filenames, unsaved-content blocking, empty history, archived export, Facilitator exclusion and refreshing an open list after sending a new version. Mobile light/dark axe and overflow checks passed; historical-preview screenshot inspected. Lint, strict TypeScript, production build, changed-file formatting and diff checks passed. Backend prerequisite: [historical Word export PR #20](https://github.com/ilead-dev-team/ilead-backend/pull/20), commit 8f2d41f, with 493 local tests and both exact-head hosted checks passed.

## Report archive controls

Coordinator report details now offer Archive report for sent records and Unarchive report for archived records, independently of authorship. Archiving is available only when the saved report is SENT with no open change requests. Changes-requested reports explain why archival is unavailable. Draft/final reports have no archive action, and Sponsors receive no archive or unarchive controls. The same guards run before the request; the backend remains authoritative for races, permissions and state.

Both actions require a separate confirmation and send an empty body to the existing archive/unarchive API. The review text explains that reports are retained, and that unarchiving does not reopen, resend or transfer authorship. HTTP failures and malformed acknowledgements preserve confirmation intent. Success requires the requested report/status/archive state and unchanged author/version before the cache is updated; there are no optimistic writes or automatic retries after uncertain failures. Report lists, session queries and dashboard queries are invalidated after acknowledgement, so returning to Active/Archived views reflects the new location.

Archived records retain detail, sent-version history and Word downloads while editing, reopening and discussion posting remain unavailable. If a discussion composer contains an unsent message when archival occurs, its text remains visible in a read-only recovery panel for copying/discarding; unarchiving restores the in-memory composer. Discarding this local text makes no API write. Draft messages still live only on the mounted page, not in browser storage. Archive confirmation asks users to post or copy unsent messages first.

These controls do not delete report content or snapshots, resolve change requests, or add an automatic archive job. Existing backend routes are reused without schema/migration changes. Browser APIs are controlled substitutes; real PostgreSQL/provider/deployment acceptance remains pending. No Docker or live database writes. Institutional document-style preview and previously documented navigation/concurrent-tab editing limits remain follow-up work.

Archive-control validation: all 47 logic tests and 62 browser cases passed locally. Four new browser cases cover non-author Coordinator permission, confirmation/cancellation, rejected and malformed acknowledgements, failed/successful unarchive, read-only state, preserved unsent messages, local discard, active/archived list refresh and Sponsor/open-request restrictions. Mobile light/dark axe and overflow checks passed; draft-recovery screenshot inspected. Lint, strict TypeScript, production build, changed-file formatting and diff checks passed. Backend behavior was read from the existing archive service and its tests; no backend code or runtime database was changed for this slice.

## Institutional report document preview

Current report reading, the author's expandable working preview and selected sent-version history now share an institutional document renderer. The RCA shield, licensed local Carlito faces, navy headings, metadata/date/state line and fixed progress-table proportions follow the existing backend Word exporter. Document colors are scoped to the white paper in both application themes. Font/license assets are copied unchanged from the backend; no third-party font service is contacted.

The current saved report supplies metadata and sections; a working draft supplies its live section array so reordered, unsaved content appears immediately without a preview write. Unsaved previews carry a warning and existing Word-download save guards remain. Historical rendering receives only the selected validated snapshot, labels its version and explains that the current approved styling is applied; it does not reconstruct an unrecorded historical layout version. Text is rendered as React text, never interpreted as HTML. Invalid dates or progress-table formats display a preview-unavailable message rather than a misleading document.

Narrow screens adapt the paper width and provide keyboard-accessible contained table scrolling. Use A4 page width switches to a 210mm-wide, 20mm-margin sheet inside its own horizontal scroll region. Body text, bullets and tables follow the exporter conventions; empty sections do not invent content. This is a continuous browser preview: Word pagination can differ. PDF export, print controls, signatures and approval claims are not added.

Verification: 50 logic tests passed, including Kigali date ordinals, unsent/published labels, saved versus working section order and malformed progress rejection. The initial full browser run passed all 63 cases; all seven final preview/history checks passed after the mobile table adjustment and additional draft test. Mobile light/dark accessibility and contained-overflow checks passed; desktop and mobile screenshots were visually inspected. Tests use explicit API substitutes and do not establish real PostgreSQL, Gmail or deployment acceptance. No Docker or live database writes.
