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
