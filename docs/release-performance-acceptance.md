# Release performance acceptance

## Purpose and current gate

Qualify the deployed Word download flow using the existing synthetic staging
Coordinator and report. PR49 merged as `162a1c4`; PR48 merged afterwards as
`9bbee12`. GitHub reported a successful Vercel deployment for `9bbee12` on
26 October 2026. The Render dashboard showed backend `ba40fac` live on a Free
instance. These deployment observations do not certify browser download behavior.

Earlier deployed API evidence recorded three sequential current downloads in
9.000/18.432/22.173 seconds, two concurrent current downloads in 29.717/20.331
seconds, and historical v4 in 31.138 seconds. All succeeded, but provider cold
state was uncontrolled. Keep confirmed cold-start acceptance open until a
measured first request is correlated with provider startup evidence. The run below
now establishes one cold login-then-download sample; full release performance
acceptance remains partial.

## Observed result — 26 October 2026

The harness waited from 05:37:32 to 05:53:32 UTC without sending HTTP requests.
Its first attempt failed locally in 106ms; a separate public configuration probe
identified sandbox DNS failure (`ENOTFOUND`). No HTTP response was received.
That result is a runner failure, not an application performance failure.

The network-enabled retry began at 05:54:40 UTC with an additional idle argument
of zero because the preceding quiet interval had already completed. Preserve both
evidence files together; zero alone does not establish inactivity.

| Measured action                        | Result                  | Completion time |
| -------------------------------------- | ----------------------- | --------------- |
| First login through deployed frontend  | HTTP 200                | 26.337s         |
| First current export, ticket plus file | HTTP 200, valid package | 6.187s          |
| Warm current export, ticket plus file  | HTTP 200, valid package | 4.426s          |
| Historical v4, ticket plus file        | HTTP 200, valid package | 3.633s          |
| Logout                                 | HTTP 204                | 1.147s          |

Render's application logs showed `Running 'npm start'` at 07:54:53 South Africa
time and a new hibernation-instance process running `node dist/server.js` at
07:54:55. It logged `API listening` at 07:55:03.355 (05:55:03.355 UTC), inside the
measured login interval. The new instance suffix was `hgkjg`, different from the
earlier `v8brq`. This correlates an actual service startup with the request after
inactivity, rather than inferring a cold start only from slow timing.

Login plus the first export took approximately 32.5 seconds, excluding human
navigation and browser rendering. All requests met the current app deadlines.
All three files passed full ZIP CRC checks and document XML parsing, contained
the expected synthetic summary, excluded the known private QA discussion and
retained four embedded font files. Their extracted document text matched across
current and historical v4, as expected for the presently published v4 report.
These are package/content checks; no new visual document rendering was performed.

Ignored local evidence is in `artifacts/idle-download-acceptance-oct26/` and
`artifacts/idle-download-acceptance-oct26-network-retry/`, including timing,
downloaded files, hashes, integrity results and the provider correlation note.
The harness deliberately reports provider state as unconfirmed automatically;
the separate observed Render logs supply that correlation for this run.

During startup-log review, Render also emitted
`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` and `ERR_ERL_FORWARDED_HEADER` at 07:55:06.
The messages concern proxy/client-IP configuration in the rate limiter. Requests
still succeeded, and no causal performance claim is made. Track this as a
separate backend deployment follow-up; proxy trust and spoofing protections need
review before changing any setting. No backend configuration was changed here.

Validation of the new harness: syntax, changed-file ESLint, Prettier and whitespace
checks passed. Missing arguments, an invalid idle duration and output outside
ignored artifacts were rejected before network access. The successful live run
used the initial harness; subsequent local hardening sanitizes JSON parse errors,
checks the grant shape and makes logout failure produce a failing exit status.
Those defensive changes passed the local checks; the live run was not repeated.

## Repeatable idle-start check

Run from the web repository root:

```powershell
node scripts/check-idle-downloads.mjs ../ilead-backend-brevo/artifacts/deployed-journey-accounts.json ../ilead-backend-brevo/artifacts/deployed-journey-evidence.json artifacts/idle-download-acceptance-oct26 960
```

The inputs are the existing ignored synthetic-account and journey-evidence files.
The optional final argument is idle seconds, defaulting to 960 (16 minutes).
Zero is useful for a warm check, but cannot establish idle or cold behavior.
Outputs must stay beneath this repository's ignored `artifacts/` directory.

| Stage                | Purpose and measurement                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quiet interval       | Sends no HTTP requests for the requested interval. Do not open the deployed app or run API probes during this interval.                                                               |
| First login          | Calls the actual frontend `/api/v1/auth/login` proxy with the existing synthetic Coordinator, within the app's 60-second request budget. This measures the startup-sensitive request. |
| First current export | Obtains the scoped ticket through the frontend proxy, then transfers Word directly from Render. Records ticket time, download headers, body completion and combined action time.      |
| Warm current export  | Repeats the current export to compare with the first export.                                                                                                                          |
| Historical v4        | Obtains a separate version-bound grant and checks the historical filename and file transfer.                                                                                          |
| Logout               | Revokes the test session and records cleanup success.                                                                                                                                 |

Each export must complete within the existing 120-second action budget, including
ticket issuance. This is the current application deadline, not a newly agreed
latency service-level objective. Ordinary login/ticket requests retain 60-second
budgets. Requests are not automatically retried. A timeout or unexpected status
fails the run; failures remain in checkpointed evidence.

Successful transfers require HTTP success, the Word MIME type, ZIP signature,
the exact allowed CORS origin and a version-specific historical filename.
Saved files have SHA-256 hashes for later integrity checks. A ZIP signature alone
does not validate the entire archive: separately inspect the ZIP, document XML,
embedded fonts and expected content before accepting file integrity.

`results.json` records timings, statuses and file metadata. It excludes request
bodies, cookies, passwords and authorization grants. Files stay in ignored local
artifacts. No report is edited or published. Login/logout still create and revoke
a normal synthetic session.

## Interpretation and remaining coverage

[Render documents](https://render.com/docs/free#spinning-down-on-idle) that Free
web services spin down after 15 minutes without inbound traffic and take about a
minute to spin back up. A quiet harness does not prove a quiet service: another
browser, scheduler or external request could keep it awake. Correlate the first
request's UTC timestamp with Render application startup logs or equivalent
provider evidence. A slow response alone does not prove a cold start.

Login wakes the service before the export in this scenario. Therefore this run
qualifies the login-then-download journey after inactivity; it does not separately
qualify an already authenticated user's first export after service sleep, access
token renewal, or a database cold start. Those paths need their own observation.

HTTP tests do not exercise browser CORS enforcement, download handoff, loading
copy, cancellation, failure/retry controls or physical network conditions. Keep
the actual UI current/historical download checks separate. Do not claim a
guaranteed latency, Microsoft Word rendering acceptance, or a percentile from
these small samples.
