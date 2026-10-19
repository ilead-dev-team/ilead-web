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
