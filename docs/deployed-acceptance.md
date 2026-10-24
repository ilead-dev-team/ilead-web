# Deployed acceptance — 23–24 October 2026

Target: https://ilead-web.vercel.app, using the existing synthetic staging journey accounts and populated report/roundtable. No Docker or production data cleanup was used.

## Regression and deployment

Merged main `0e85b7e` completed the hosted `verify` job successfully:134 logic tests and238 browser cases passed. Vercel reported a successful deployment for that commit. These automated browser cases use fixtures and are separate from the live observations below.

## Live browser observations

| Role        | Verified through the deployed UI                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinator | Signed in; current-year dashboard showed one active roundtable, one held session and one sent report. Opened the approved version2 report, populated institutional document, version1/2 history and private/resolved public feedback.             |
| Sponsor     | Signed in; published-only dashboard/report library; no session navigation or report editing control. Opened the sent report and resolved public feedback without the existing private Coordinator discussion. Sent history listed versions1 and2. |
| Facilitator | Signed in to own roundtable; actual lesson1 completion, next lesson2 and attendance history. Opened issue form/list without sending a new issue. A direct attempt to open `/reports` returned to `/my-roundtable`.                                |

DOM observations were saved under ignored `artifacts/deployed-browser/`. Screenshot capture and browser download waiting failed in the automation connection; the documented DOM interface recovered navigation. Consequently, browser download handoff and new visual screenshots are not certified by this pass. No report was reopened, edited, sent or archived during this browser pass. Earlier staging API mutation evidence remains a separate result.

## Repeatable deployed API check

`scripts/check-deployed-acceptance.mjs` logs in through the deployed frontend's `/api/v1` proxy using only `@journeys.example.test` synthetic accounts. Supply the ignored account file, prior populated-journey evidence file and an ignored output directory as its three arguments. Credentials and cookies remain in memory and never enter evidence.

The script checks identity/role, inbox/reminders, own roundtable/progress, staff dashboards, published report visibility, private comment exclusion, sent snapshots and Word/Excel exports. It verifies Facilitator restrictions and Sponsor administration/write restrictions. Sponsors are permitted to read session data by the API contract; that is distinct from their UI navigation. The denied session-write check uses an existing date to prevent accidental creation even if a permission guard regresses.

Successful request records and durations are checkpointed without secrets. Exports are saved in the ignored output directory with MIME, ZIP signature and size checks. These HTTP assertions do not replace UI journeys, document rendering or physical push acceptance.

The completed run passed40 request checks:13 Coordinator,17 Sponsor and10 Facilitator, with six exports. The first harness attempts used the wrong comment-visibility field and incorrectly expected Sponsor session reads to be forbidden; both assumptions were corrected against the existing API contract before this successful run. Credentials/cookies were excluded from all evidence. The initial Coordinator Word and Excel files were also opened as ZIP archives: integrity checks and expected Word/workbook XML succeeded. This establishes package integrity, not rendered pagination.

## Follow-ups

- Word exports through the deployed frontend proxy took roughly57–89 seconds in the earlier measured runs; Excel and ordinary reads were much faster. The existing local Word-export regression passed in904ms after local loopback permission was granted. A subsequent direct API profile completed in6.4 seconds (headers4.9 seconds), and a repeat proxy profile completed in4.2 seconds (headers3.5 seconds), both without content encoding. The slowdown is intermittent; these measurements do not establish a persistent proxy/compression defect. Preserve the timing evidence and repeat under cold-start/load conditions before claiming consistent launch-ready export performance. No speculative caching/compression change was made.
- Finish deployed create/edit/save/cancel/rework journeys through the UI; this pass read the previously populated staging records.
- Confirm browser download handoff and visual Word pagination with a functioning capture/download connection.
- Complete physical-device push acceptance after frontend acceptance, as agreed.
