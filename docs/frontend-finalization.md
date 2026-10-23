# Frontend finalization

## First pass: shared workspace shell

Reference: platform design system05 and UI_UX/DESIGN_HANDOFF.md. The production app, not the simulated reference pack, was changed.

- Match approved top-bar geometry:76px desktop and68px mobile. Keep controls in one row at320px without document overflow.
- Group role-filtered navigation into Program and Administration, with outlined local icons and a visible active destination. Desktop sidebar232px, tablet190px; use the existing keyboard-contained mobile dialog below768px.
- Make the sidebar sticky and independently scrollable; retain full access when the viewport is short. Use32px desktop and16px mobile horizontal content spacing.
- Keep theme, notification, account/password and logout controls accessible. Compact mobile controls retain accessible names. The account panel stays within the viewport.
- Rename Connected mailbox navigation to Program email to match shared Brevo delivery; the destination and server behavior are unchanged.
- Use existing theme tokens for surfaces, borders, active state and focus; honor reduced motion. No API, role permissions, credentials or backend changes.

## Evidence

14 focused browser tests passed, including drawer keyboard containment, focus return, role visibility and axe checks for all three roles in both themes. Added explicit header-height, horizontal-overflow and control-bounds assertions at320/390/768/1440px. Desktop/light and mobile/dark screenshots were inspected. All134 frontend logic tests passed. Full-project ESLint, typecheck, production build, changed-file formatting and whitespace checks passed.

These browser checks use API fixtures. They verify frontend behavior and accessibility at the tested states, not live-provider delivery or physical-device push.

## Second pass: populated dashboards

The overview now appears before the filter form, following the approved welcome band / four cards / filters / two-column modules hierarchy. Coordinator and Sponsor primary actions lead to their permitted session/report destinations. Supporting card text explains actual counts without fabricated trends. Donut charts now show a visible total while retaining numeric legends.

The filter form uses four desktop columns, two tablet/mobile columns where space permits, and one column below380px. Roundtable selection keeps adequate width. Draft and applied filters, invalid dates, retained selections, download blocking and server authorization are unchanged.

Visual inspection caught an existing global anchor color overriding primary button-link text. Removing that generic color allows the button utility's approved foreground token to apply; ordinary links retain their separate existing rule. A regression check verifies different foreground/background colors on the Create session action. Other new assertions ensure overview cards precede filters and the action points at the actual creation route. Dashboard fixtures now supply unread-count and reminder responses, preventing unrelated absent-backend errors during screenshots.

Validation: all10 dashboard browser tests and all134 frontend logic tests passed; changed-file lint, formatting and whitespace checks passed. Screenshots were inspected at desktop and390px in both themes. These remain fixture-backed UI checks, not deployed acceptance or physical push verification.

## Third pass: roundtables and linked issues

Staff roundtable browsing now uses a semantic table with current level, Facilitator and status columns. The table scrolls inside its own keyboard-focusable panel on narrow screens. Progress rings show the actual completed lesson count for the current level, including zero and all16 lessons; accessible labels include the level and count. Coordinator lifecycle controls retain their existing authorization checks.

Own/detail screens now group progress, last/next lessons and recorded histories into consistent panels, with the Facilitator view limited to820px. Registration groups identity fields and the curriculum starting point while preserving name-conflict input retention. Linked issue pages use the same spacing and narrow Facilitator layout. Existing requests, permission checks and mutation behavior remain in place.

Validation: all38 affected account, roundtable and issue browser tests and all134 frontend logic tests passed. Type generation, TypeScript, changed-file ESLint/formatting, whitespace checks and the production build passed. New browser coverage checks progress boundaries, Sponsor action visibility,320/390px document overflow and table scrolling, and light/dark accessibility. Desktop/light and mobile/dark list screenshots were inspected. An initial light-theme table-heading contrast failure was corrected before the passing rerun.

These checks use API fixtures. Deployed populated journeys and physical-device push acceptance remain separate work.

## Fourth pass: sessions and lesson entry

The session list now uses a semantic table with date, status, academic calendar, held activities, entered/total roundtables and report state. Changes requested remains distinct from Sent. A named keyboard-focusable scrolling panel keeps the wide comparison table inside mobile viewports. New session is a primary action; date/calendar filters and create/edit/cancel panels use consistent token-based surfaces and spacing.

Lesson entry retains its responsive fieldsets and existing draft state. A sticky save bar now shows the number of roundtables with unsaved changes and keeps the existing save action available while scrolling. Existing confirmation dialogs, failed-save retention, cross-page drafts, read-only reconciliation and lifecycle locks remain unchanged.

Validation:24 existing session/entry browser cases passed, including new sticky-bar assertions in the draft-retention case. The new table regression passed separately after correcting primary-link contrast; it checks entered totals, changes-requested status, held activities,320/390px containment, and light/dark axe checks. All134 logic tests passed. Desktop/light and mobile/dark table screenshots were inspected. Browser checks use fixtures; deployed acceptance remains pending.

## Fifth pass: report browsing and builder ergonomics

Report browsing now follows the reference table hierarchy: session/calendar, author, status, version, read state and open change requests. Read, Not read yet and Not sent derive from stored timestamps. The named keyboard-focusable table region scrolls within mobile viewports. Existing role-filtered queries and Sponsor response validation are unchanged.

The builder now provides section jump links targeting mounted editors and a sticky save/discard bar with save state. This preserves existing draft state, five-second/blur autosave, failed-save recovery, mandatory sections and explicit confirm/send flow. Library, archive, feedback and version-history panels share consistent theme-token spacing and surfaces. Printable report content and export behavior are unchanged.

Validation:31 of33 report browser cases passed initially; two autosave cases encountered duplicated status text introduced by the new save bar. That was corrected and all6 autosave/document cases passed on recheck. All134 logic tests passed. Type generation/TypeScript, changed-file lint, formatting and whitespace checks passed. The new report-list coverage checks delivery/read labels,320/390px scrolling and both-theme accessibility; builder coverage checks section targets and the sticky save bar.

The final production build passed. Both new layout cases passed again, and desktop/light and mobile/dark list screenshots were inspected. This pass improves report navigation and saving; a simultaneous wide-screen editor/preview workspace and deployed populated journeys remain for the final layout/regression pass. Fixture checks do not establish live deployment acceptance.

## Ordered remaining passes

1. Deployed dashboard acceptance alongside the remaining role journeys; continue shared page-heading consistency on subsequent screens.
2. Roundtable registration, own/detail/list views and issue flows: implemented and locally verified in the third pass; include in deployed regression.
3. Session lists, creation/cancellation and bulk lesson entry: fourth-pass layouts locally verified; include in deployed regression.
4. Report library, builder, final/send flow, sent document reading, feedback and version history.
5. People/invitations, recovery, calendar, curriculum and program settings.
6. Notifications and shared email status, then public account/error/expired-link states.
7. Full responsive/light-dark/keyboard/error-state regression, deployed three-role browser journeys and visual export inspection.
8. Physical-device push acceptance after frontend completion, as requested by the owner.

This first pass is a shared-shell improvement, not a claim that every page is finalized or flawless. Do not count fixture tests as deployed end-to-end qualification.
