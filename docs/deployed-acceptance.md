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
- Coordinator session create/edit/cancel, report rework, Facilitator detail changes/issues and Sponsor change-request resolution passed in the follow-ups below. These checks cover the stated journeys, not every configuration or failure condition.
- Confirm browser download handoff and visual Word pagination with a functioning capture/download connection.
- Complete physical-device push acceptance after frontend acceptance, as agreed.

## Live mutation follow-up — 24 October 2026

The existing synthetic Coordinator account completed these actions through the deployed browser UI against the real staging API and database:

| Journey            | Observed result                                                                                                                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create session     | Created the 2026-10-28 session with a staging-only note and WeLead activity; the detail page showed Held, the configured year/term and one pending roundtable.                                                                                                                                |
| Edit and save      | Changed the note and added WeOut; the detail summary reflected both activities and the saved note, with “Session saved.”                                                                                                                                                                      |
| Cancel             | Entered a clearly marked test cancellation reason and confirmed. The returned page showed Cancelled, zero pending entries, retained notes/activities/reason, no entry editor and “Cancelled sessions cannot have reports.” The record was retained; no entries or report were created for it. |
| Rework sent report | Reopened the existing QA report from Sent v2 to Draft, changed the opening summary, explicitly saved, confirmed Final and sent it again. The returned page showed Sent v3, the revised summary and “Report sent to Sponsors.”                                                                 |
| Preserve history   | Opened sent version 2 after publishing version 3. Its original summary remained visible, while the current report displayed the new summary. The version list retained versions 1, 2 and 3.                                                                                                   |

After signing in as the synthetic Sponsor, the same report opened as Sent version 3 with the revised summary and no author editing controls. Its first-read date updated to 2026-10-24. Both role sessions were signed out after testing.

DOM records and screenshots are saved under ignored `artifacts/deployed-browser/`, including the cancelled session, author sent version 3 and Sponsor received version 3. This is live mutation evidence, not a new fixture-test count. No application code was changed during this pass.

The automation's generic date fill updated the native value without updating the controlled form state. The accessible date setter successfully submitted the same date. This was an input-method limitation; it did not establish an application defect.

Browser Word download waiting again timed out and detached the automation connection; the page was recovered in a fresh tab of the same browser. HTTP export integrity from the earlier pass still stands, but browser handoff is not certified. The packaged Word renderer also failed because the bundled runtime contains no LibreOffice `soffice.exe`; no page images were generated, so Word pagination remains unverified. Docker and the user's desktop office software were not used.

## Remaining role journeys — 25 October 2026

Using the existing synthetic accounts and QA roundtable, the following deployed browser journeys passed against the staging API/database:

- The Facilitator changed the slogan and saved it. The summary reflected the new slogan; iChoose lesson 1 Choices, next lesson 2 Growth and attendance history stayed unchanged. No level or lesson editing controls were offered.
- The Facilitator raised one marked Other issue explaining that this was an acceptance check and no progress change was requested. The saved issue appeared in the open list. The synthetic Coordinator resolved it with an explanatory note; the open list became empty and the resolved history retained the issue. On a fresh Facilitator login, the Resolved filter showed the same issue, Coordinator identity and resolution note. The saved slogan and unchanged progress also persisted across login.
- The synthetic Sponsor confirmed one marked change request on sent version 3. The report changed to Changes requested with one open request. The author saw archive disabled while the request was open.
- The author reopened the report, saved a clarification identifying its synthetic staging data, and explicitly resolved the request. The count became zero while the report remained Draft. Confirming and sending were separate actions; sending published version 4.
- The Sponsor then opened version 4 with the clarification, a new first-read date and zero open requests. Both public requests appeared as resolved. The existing private Coordinator discussion was absent.

Secret-free DOM observations and screenshots are retained in ignored `artifacts/deployed-browser/`. These are real UI observations; no runtime code changes or additional fixture-test totals are claimed. The synthetic issue and feedback records are retained as history. No actual lesson correction, external email, physical push delivery, document pagination or forced network-failure recovery was tested by this pass.

## Lesson corrections and responsive review — 25 October 2026

The synthetic Coordinator changed the existing 2026-10-21 attendance from Met/Choices to Did not meet through the deployed entry editor. After saving, the roundtable showed no completed lessons, next lesson Choices and one Did not meet history entry. Changing it to Met/Growth required the non-next lesson review and explicit confirmation. The saved history then contained only Growth, with Attitudes next; Choices was not silently completed. Finally, the entry was restored to Met/Choices and the roundtable history/next lesson returned to their original state. No report was reopened or republished during these entry corrections.

This exposed a display defect: the ring used the latest lesson number but described that number as a completion count. With only Growth recorded, it announced two completed lessons. The component now names that value `latestLesson`, adds visible “Latest lesson” copy and announces the latest completed lesson number. It does not infer missing lesson completions or make extra history requests for every list row. A regression covers zero, lesson 16 and a skipped-lesson row. This fix is local until its PR is merged/deployed; the live correction observations used the earlier deployed code.

Loaded dashboard, roundtable list, session list, report list, sent report, People, resolved issues, curriculum, shared email, activity types, section library, academic years, notifications, recovery, invitations, login, forgot-password, missing reset-token and missing-page screens were checked at 390/768/1440px in both themes: 114 DOM geometry/theme combinations across 19 surfaces, with no document-width overflow or theme mismatch. Theme state was checked from rendered DOM; screenshot painting sometimes lagged a toggle, so filename labels alone are not treated as visual proof. Representative mobile/tablet/desktop screenshots were inspected, including a separate settled light-mobile session capture. The shared email screen was also reviewed. This is viewport emulation, not physical-device qualification, and does not certify every control below the fold.

Live mobile navigation also passed Shift+Tab wrapping to the last navigation link, Tab wrapping to Close menu, and Escape dismissal returning focus to Menu. Separate fixture-backed regressions passed 44 cases across account shell, lesson entry, report autosave and roundtable pages, including failed-save retention, malformed/uncertain acknowledgements, read-only reconciliation, focus containment, narrow layouts and accessibility. All 134 logic tests passed, as did changed-file lint/formatting, whitespace checks and the production build with TypeScript. The initial local browser attempt reached an unrelated server on port 3000 and was stopped; the passing run used an isolated port/build directory.

Internet connectivity was briefly lost while opening activity settings; Chrome displayed ERR_INTERNET_DISCONNECTED. Connectivity recovered and the remaining settings/account review continued successfully. This browser/network failure is not evidence of the app's failed-save recovery. No forced live write failure was injected. Local fixture failures remain distinct from live observations. Evidence is stored under ignored `artifacts/deployed-browser/` and `test-results/`; Docker was not used.

## Merged label and export transfer follow-up — 25 October 2026

PR 45 merged as `b97f829`; its required verify check passed. The deployed roundtable list now exposes “iChoose: latest completed lesson 1 of 16”, confirming that the label change reached the live app.

New Word export measurements, using only the existing synthetic Coordinator and report:

| Target                       | Headers | Complete body | Bytes     |
| ---------------------------- | ------- | ------------- | --------- |
| Frontend proxy, first sample | 4.186s  | 76.983s       | 1,198,585 |
| Direct staging API           | 2.794s  | 4.227s        | 1,198,582 |
| Frontend proxy, repeat       | 2.802s  | 5.828s        | 1,198,582 |

The first sample spent most of its time receiving the body after successful headers. This does not prove a single provider, proxy or compression defect, and no controlled cold-start/load qualification is claimed. The actual deployed UI export reproduced “Something went wrong. Try again.” Its API client had a 60-second deadline, shorter than the observed successful HTTP transfer, and body-read failures escaped its network-error conversion.

The fix gives blob downloads a bounded 120-second deadline while retaining 60 seconds for ordinary API requests. Caller cancellation remains active. Body-read errors now become an actionable interrupted-transfer error; requests are not automatically replayed. The Word panel explains the possible two-minute wait and keeps duplicate export actions disabled. Tests cover the separate deadlines, failure after successful headers, caller cancellation, pending-state copy and explicit retry/download handoff.

The repeat export was saved under ignored `artifacts/export-timing-oct25/`. ZIP integrity, document XML, one progress table, all four embedded font files, expected version-4 summary/roundtable text and private-discussion exclusion passed. These are package/content checks, not rendered pagination. Browser download-manager inspection was blocked by the browser URL policy; no workaround was used. The installed WordCraft launch exposed no targetable window. Visual pagination and a live successful browser handoff after deployment remain open; the application fix does not certify either result.

Validation of the transfer fix: all 137 logic tests and all six report-history browser cases passed, including interrupted-download retry and current/versioned file handoff. Changed-file ESLint, formatting, whitespace checks and the production build with TypeScript passed. Browser cases use fixtures; no 77-second live transfer was run through the changed frontend before deployment. No backend code or infrastructure configuration was changed.

## Successful live handoff and document inspection — 25 October 2026

PR 46 merged as `b9f12ec`; its required verify job succeeded, including 239 browser cases. The updated app was tested using the existing synthetic Coordinator and sent version-4 report.

The export control was clicked at 16:48:28 UTC. The app subsequently displayed “Word file handed to your browser. Check Downloads for the file.” The expected file appeared in the local Downloads directory with a 16:48:48 UTC modification time and a size of 1,198,585 bytes: approximately 20 seconds after the click. The browser tool's download-event observer timed out, so that observer is not treated as evidence of success; the application notice and the actual saved artifact establish this result. No internal browser page or policy workaround was used.

The saved file passed ZIP integrity and document-XML checks, contained the expected version-4 synthetic summary and roundtable, and excluded private discussion. Its SHA-256 was `831ab3b214ecfff2bce4195a6e0512bfabf41f06d6f8a43844297f20c162f57c`. A preserved copy and secret-free integrity metadata are under ignored `artifacts/export-timing-oct25/`; the browser notice and screenshots are under `artifacts/deployed-browser/`.

Launching WordCraft through its verified executable path succeeded. The actual downloaded file was opened from its Recent list and inspected at 100% zoom. The shield, Carlito typography, institutional heading, summary, four-column progress table and final notes were readable without clipping or overlap; the status bar showed Page 1 of 1. The lower page area was inspected as well. The downloaded file hash remained unchanged after inspection; no editor changes were saved. This is WordCraft visual acceptance of the one-page staging sample, not Microsoft Word compatibility certification or a canonical LibreOffice render.

A separate 45-row synthetic DOCX was generated locally through the backend's existing renderer, without writing any program records. Its attempted visual inspection was not completed because the viewer's file-dialog input was unreliable. Multi-page/wrapped-row acceptance therefore remains open, as do controlled cold-start/load performance qualification and physical-device push delivery. The device permission question was presented separately; no notification permission was granted or test push sent during this pass. No runtime code was changed, and no new full regression run is claimed.

## Physical Windows push acceptance — 25 October 2026

The user approved Chrome notification permission on this Windows PC and confirmed that the real alert arrived and clicking it opened the QA report. One marked Sponsor discussion comment on the existing synthetic Coordinator report created the notification and queued push; scheduler run 40217193779 completed successfully and acknowledged the tick with HTTP 200. The visible alert used the privacy-safe title “iLead update” and body “Open iLead to view your update.” No report version or change request was created by this comment.

Cleanup passed through the deployed UI and independent authenticated staging API reads:

| Step                    | Observed result                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Disable this device     | UI showed Not enabled and no registered devices; server returned zero bindings.                                          |
| Explicitly enable again | UI showed Enabled and the named staging Windows device; server returned one binding.                                     |
| Log out while enabled   | Browser returned to login; server returned zero bindings.                                                                |
| Fresh Coordinator login | UI still showed Not enabled and no registered devices; server returned zero bindings. No silent resubscription occurred. |

The test finished with the synthetic account signed out and its device registration removed. Chrome's site permission may remain granted; this is distinct from an active push subscription. The test comment and notification remain as QA history. Secret-free DOM/screenshots and state metadata are retained in ignored artifacts. Delivery and click-through are user-confirmed; registration/cleanup are automation-observed. This qualifies Windows Chrome only, not Android or iOS, and does not establish a specific push-provider response code. No runtime code changed and no additional full regression suite was run. Multi-page document visual acceptance and controlled cold-start/load qualification remain open.

## Clear account labels and five-page report qualification — 25 October 2026

PR 47 is merged at main commit `8b53c2d`. The later Windows push evidence is carried forward in this branch rather than rewriting the already merged PR.

The frontend source audit found a raw recovery-request UUID, internal delivery error codes, uppercase recovery states and raw section-kind enums in visible copy. Recovery details now identify the account by name and request time, with actionable delivery guidance. Recovery states and section kinds have readable labels; the section library and report builder share the same kind mapping. Internal keys, route parameters and authorization comparisons remain unchanged. Meaningful dates, lesson numbers, counts and report versions remain visible. This audit covers application-generated presentation; it does not rewrite user-authored names or synthetic QA history.

With the owner's explicit override, the existing installed LibreOffice rendered the local 45-row synthetic DOCX using the packaged renderer and a temporary profile. Five page images were inspected individually. Rows 1–7, 8–19, 20–31, 32–43 and 44–45 flowed across pages, with repeated column headings, readable wrapped lesson names, no clipped or split rows and the final checkpoint following the table. No original document or database record was edited. Evidence is under ignored `artifacts/pagination-render/`. This establishes the tested LibreOffice layout, not Microsoft Word compatibility.

A controlled staging export workload ran three sequential downloads, followed by two concurrent downloads of the existing QA report through the deployed frontend:

| Sample       | Headers      | Completed body | Outcome                              |
| ------------ | ------------ | -------------- | ------------------------------------ |
| Sequential 1 | 3.052s       | 95.131s        | HTTP 200, valid ZIP signature        |
| Sequential 2 | 4.755s       | 87.035s        | HTTP 200, valid ZIP signature        |
| Sequential 3 | 3.770s       | 96.435s        | HTTP 200, valid ZIP signature        |
| Concurrent 1 | 5.508s       | 92.257s        | HTTP 200, valid ZIP signature        |
| Concurrent 2 | Not recorded | 120s deadline  | Timeout; workload did not fully pass |

A subsequent direct Render export returned headers in 2.519s and completed in 8.048s. These observations isolate a slower tested frontend transfer path, but do not prove the responsible provider or network component. No confirmed sleeping service was exercised, so provider cold-start acceptance remains open. Raw metadata is retained under ignored artifacts. The deadline is not being extended again to mask the failed concurrency result.

The compression-disabled frontend export also completed slowly: 3.004s to headers and 116.737s to the full body (HTTP 200). Removing compression did not resolve the observed delay. Further provider/network investigation remains required; no export transport redesign or claim of consistent performance is included in this change.

Validation of the presentation change: all 137 logic tests passed. Of 59 affected browser cases, 57 passed initially; the two narrow-theme cases had obsolete assertions requiring raw error codes. After updating those assertions, both passed, followed by three final failure/narrow-theme rechecks after the readable delivery label change. Changed-file ESLint, formatting, whitespace and TypeScript checks passed. The supported webpack production build passed; two local default Turbopack attempts failed while starting their CSS worker. Ignored QA artifacts are now excluded from TypeScript to prevent moved temporary build validators from entering application compilation. Hosted default-builder verification is still required. Light/dark 320px screenshots were inspected; no real email or account recovery action was sent by these fixture-backed tests.
