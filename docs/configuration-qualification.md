# Activity and section configuration qualification — W3.08h

Backend PR #31 was verified merged at `394fa26`; this web slice starts from web main `98a80d7`. It qualifies `/settings/activities` and `/settings/sections` against the existing Express contracts. No backend, schema, dependency, credential or deployment change is included.

## Writes and recovery

A save verifies the returned ID and every submitted value. Section edits must retain their key, kind, automatic source, mandatory/preselected/system flags and position. System sections cannot be archived. Creation must acknowledge the requested name/title/kind and safe defaults before the form is cleared. Malformed or mismatched replies cannot display success.

Known API rejections retain editable fields. Network errors, request timeouts, server errors and unverified replies retain and lock the draft. **Check saved records** performs GET requests only, reading the unfiltered catalog in pages of 100. Recovery checks page identity, totals, row counts and duplicate IDs; it has a 60-second and 20-page budget. Partial, changing, oversized or failed reads keep the draft locked and the check retryable. Normal catalog browsing remains paginated at 20 records; the recovery budget does not impose a server catalog limit.

For an edit, the original record and its immutable identity must be present. The last read values appear separately from the retained draft. A successful check restores focus and allows explicit comparison, saving or discarding; it does not claim the earlier write succeeded. Discard uses the last checked values and refreshes the list. For an uncertain addition, a matching name/title is reported without claiming that this request created it. The input and section kind remain intact until an explicit retry or discard. Backend uniqueness remains authoritative: there is no new idempotency key or promise of duplicate prevention.

Only one record/addition can be edited at a time on this screen. Finish or discard it before switching records, list pages or filters. Immediate in-flight guards also prevent two submits before React rerenders. Background focus/reconnect reads are disabled to avoid moving a locally edited row out of the current page. Drafts and guards are mounted-screen state; leaving/reloading the route can still discard them, and another Coordinator can edit concurrently. A read followed by a write is not atomic and does not add optimistic concurrency control.

## Reads, feedback and accessibility

Confirmed writes and list refreshes have separate outcomes. A failed refresh leaves the confirmed acknowledgement visible and offers **Retry refreshing records**, which sends no POST/PATCH. Configuration cache invalidation also covers session activity choices and the report section picker on their next read. Failed cached reads show a labelled old snapshot with writes disabled. A failed later page still offers Previous; read errors do not prevent choosing another filter when there is no draft.

Local field errors are associated through `aria-invalid`/`aria-describedby` and focus the first invalid field. Pending, uncertain, saved and refresh-failure states are explicit. Maximum-length unbroken titles wrap at 320px. Both themes use approved tokens, with keyboard, overflow and axe checks in the browser suite.

## Evidence and limits

`tests/configuration.test.ts` exercises acknowledgement matching, protected identities, uncertainty classification and complete paginated read-back rejection/recovery. `e2e/configuration.spec.ts` covers both modes, lost create/edit replies, failed/missing recovery records, a created record beyond the first recovery page, mismatched replies, confirmed-write/failed-refresh separation, duplicate submissions, role restrictions, field focus, failed-page recovery and light/dark mobile accessibility. Exact local/hosted totals belong on the PR.

These are logic and explicit browser/API-substitute checks. They do not establish connected PostgreSQL/browser acceptance, deployed same-origin cookies, real provider/device delivery, workload budgets or owner UAT. No Docker, live database mutation, mail/push send or deployment was performed for this slice. W3.08 remains open for remaining screen qualification; W3.09 cloud SQL/HTTP evidence is recorded separately in backend PR #31, with hosting/OAuth setup still required.
