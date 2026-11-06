# Accounts and core workflows acceptance

## Deployed checkpoint — 6 November 2026

| Check                                                          | Result                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web proxy and direct staging API health                        | Both returned HTTP 200 and `status: ok`. Exact deployed web and API commits remain unverified.                                                                                                                      |
| Synthetic Coordinator, Sponsor and Facilitator login           | Separate Chrome sessions returned HTTP 401 `INVALID_CREDENTIALS` for all three. The core-only API run stopped at the same Coordinator response.                                                                     |
| Fixture availability                                           | A read-only query of the previously approved staging database found zero synthetic journey accounts and no report fixture. It found six other accounts, one academic year, and no roundtables, sessions or reports. |
| Deployed issue, attendance, report handoff and role boundaries | Blocked by the missing fixture. The October results in [deployed acceptance](deployed-acceptance.md) are historical evidence.                                                                                       |
| Five coordinator checks                                        | Onboarding reported complete. Hands-on confirmation deferred by the project owner.                                                                                                                                  |

The failed logins are consistent with the missing fixture. No application defect was established, and no synthetic program data was created on the environment that holds the onboarded accounts.

Three local browser integration tests passed against the Express app with isolated fixtures. They covered login and session revocation on logout, invitation acceptance with the assigned role, and one-time password reset. All 96 selected browser regressions also passed with mocked API responses, including issue handling, session attendance and progress, report review and Sponsor feedback, and role-specific screens. These results are separate from deployed acceptance.

## Resume the deployed run

1. The project owner or hosting administrator identifies an isolated deployment and database suitable for synthetic writes and records the exact web and API revisions from the provider dashboards. Prepare three synthetic users, a synthetic roundtable and a populated synthetic report with version history and a private discussion. Keep fixture credentials and IDs used by the runner in ignored artifacts.
2. Set `ILEAD_ACCEPTANCE_ORIGIN` to the approved isolated web origin. From the web repository, run `node scripts/check-deployed-acceptance.mjs <ignored-accounts.json> <prior-evidence.json> <ignored-output-directory> --core-only`. The option skips notifications and exports while retaining the existing identity, report visibility, history and permission assertions.
3. In separate browser sessions, replay issue creation and resolution, attendance and progress, and the initial report handoff and sponsor correction. While the report is a draft, verify Sponsor access is denied. After resend, check the revised version, private-comment exclusion and Facilitator denial for another roundtable and the reports workspace. Record each result against the two deployed revisions.
4. In the later coordinator round, collect individual sign-in and read-only task results for People, Roundtables, Curriculum, Sessions and Reports. Keep this separate from synthetic evidence.
