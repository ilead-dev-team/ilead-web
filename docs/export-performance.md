# Word download performance investigation

## Measurements — 25 October 2026

The same synthetic staging report was downloaded using the existing authenticated endpoints. No real program records or emails were modified.

| Path/client                    | Headers | Full response | Bytes     |
| ------------------------------ | ------- | ------------- | --------- |
| Vercel rewrite / Node          | 3.616s  | 76.619s       | 1,198,582 |
| Direct Render / Node           | 2.540s  | 7.321s        | 1,198,585 |
| Vercel rewrite / curl HTTP/1.1 | 8.196s  | 73.162s       | 1,198,582 |

The Vercel stream delivered successive ~128 KiB milestones over about 7–10 seconds rather than stalling only before headers. A public 628,032-byte font took 19.614s through Vercel; health JSON took 1.341s. Compression-disabled exports were also slow in the earlier acceptance run. Five local renders of the larger 45-row synthetic document took 189–293ms. Randomized embedded-font obfuscation changes ZIP bytes between exports, so byte-for-byte identity is not expected; content and layout must be checked separately.

These results locate the observed delay in the delivery path after headers, rather than proving a database query, document-generation, browser-only or compression defect. They do not identify a particular provider's internal fault or establish cold-start performance.

## Candidate transport

Two explicit Next Node route handlers stream current and historical Word downloads from the fixed API origin. The general API rewrite is a fallback so it cannot shadow these dynamic routes. All other API calls retain the existing rewrite.

Only the access cookie is forwarded to Express; the refresh cookie and unrelated browser cookies are excluded. Express retains authentication, current-role checks, report visibility and version authorization. Report/version parameters are validated, arbitrary destinations and queries are rejected, redirects are disallowed, and responses are private/no-store. No public download token, shared artifact cache, automatic retry or longer client deadline is added. Upstream cancellation is bounded at 110 seconds and linked to caller cancellation; streaming body failures remain subject to the frontend's existing interrupted-transfer handling. Server-Timing records upstream header latency without account identifiers.

## Validation and rollout gate

141 logic tests passed, including streaming before the full body, minimal cookie forwarding, backend authorization failures, malformed parameters, cancellation and compressed-length handling. A built production server with an explicit local API substitute passed current/versioned streaming, missing-cookie denial, refresh-cookie exclusion and unchanged health fallback. The webpack production build with TypeScript and changed-file lint passed.

A Vercel preview comparison is required before treating this candidate as a performance fix. Do not merge solely because the local tests pass. No production speed improvement is claimed yet.
