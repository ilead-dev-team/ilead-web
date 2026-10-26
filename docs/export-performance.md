# Word download performance investigation

## Findings — 25 October 2026

The 1.2 MB synthetic staging report took 76.619s through Vercel using Node and 73.162s using curl HTTP/1.1; a direct Render request took 7.321s. Headers arrived in 3.616/8.196/2.540s respectively. The Vercel response continued transferring slowly after headers, rather than spending the whole time generating the report. Five local renders of the larger 45-row document took 189–293ms. A public font was also slow through Vercel. Disabling compression did not fix it.

A dedicated streaming-route experiment was built, tested locally and deployed in draft PR49. It did not improve the remote result: upstream headers took 2.298s, but only 937,067 of 1,198,584 bytes arrived by a 150-second diagnostic deadline. The experiment has been removed from the final implementation. An HTTP/2 diagnostic also reached its deadline; that result is inconclusive, not proof of a specific protocol or provider defect.

Repeated direct Render baseline downloads all completed: 17.206/73.840/33.746s sequentially and 31.309/28.651s concurrently. They remained variable. These samples support removing an unnecessary delivery hop, but do not prove a provider's internal root cause or establish production/cold-start performance. The earlier Vercel workload completed four of five requests; one concurrent request hit the 120-second deadline.

## Final implementation

| Step                 | Behavior                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover destination | Same-origin `/api/download-config` returns only the validated public `API_ORIGIN`, using the existing deployment configuration.                                |
| Authorize            | Existing cookie-authenticated API request obtains an encrypted, report/version-specific, 60-second ticket. No new secret or migration is required.             |
| Transfer             | Browser sends the ticket in an Authorization header directly to Render, with account cookies omitted. The file avoids the Vercel rewrite.                      |
| Recheck              | Render verifies ticket expiry, the original session, active account, current role and current/published/version visibility before rendering.                   |
| Hand off             | Existing MIME/ZIP verification, filename, duplicate-action blocking, cancellation and browser download handoff remain active. Failures require explicit retry. |

Tickets stay in memory and headers, never URLs or browser storage. They cannot authenticate normal API routes. Expiry is enforced by the API, not the device clock. They may be reused within their short lifetime for the same authorized report; no single-use guarantee is claimed. Direct CORS allows only the backend's existing `WEB_ORIGIN`, never wildcard or credentialed cross-origin access. The original Word renderer, editable content and all four embedded font faces are preserved. Ordinary API routing remains unchanged.

The temporary Vercel Automation Bypass was removed after the failed preview experiment; its explicitly approved ignored local file was deleted. No deployment protection was disabled.

## Rollout gate

The original PR49 CI run exhausted its 15-minute job budget: Ubuntu system-dependency downloads alone took 9m31s (24.9 MB at 43.7 kB/s). Browser tests consequently received less than five minutes. CI now runs quality checks and the complete browser suite in separate jobs. Browser dependency installation has a 15-minute limit and tests have a separate 12-minute limit within a 30-minute job. The existing required `verify` gate succeeds only if both jobs succeed; failures, cancellation and skipped jobs cannot satisfy it. Browser traces are uploaded on failure or cancellation. Report-history fixtures explicitly provide the unrelated notification badge count rather than attempting an absent local backend.

Deploy the companion backend first, then merge/deploy this web change. Existing backend `WEB_ORIGIN` and access-token secret and existing web `API_ORIGIN` are reused; no manual credential setup is needed. Keep the previous Word endpoints for compatibility. A preview page on another origin is intentionally not allowed by staging CORS.

After deployment, verify real ticket issuance, browser CORS, current and historical file integrity, expiry/retry, logout/role denial and repeated/concurrent timing. Neither the old direct-Render baseline nor fixture tests certify the new deployed ticket flow. Keep performance acceptance open until that deployed check passes. No guaranteed latency or cold-start result is claimed.

Validation of the final implementation: a clean backend run passed all 665 tests. The web passed all 140 logic tests, six affected report-history browser cases across the initial run and an isolated rerun, changed-file lint, formatting, whitespace and TypeScript, plus the supported webpack production build. The initial browser timeout occurred in its accessibility scan while the full backend suite was running; the same case passed in 6.6 seconds alone. The backend is published as PR37; deploy it before this web PR49. Final hosted checks and deployed ticket-flow qualification remain pending.
