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

## Ordered remaining passes

1. Populated dashboards and shared page headings, filter density and action placement.
2. Roundtable registration, own/detail/list views and issue flows.
3. Session lists, creation/cancellation and bulk lesson entry, including retained unsaved edits.
4. Report library, builder, final/send flow, sent document reading, feedback and version history.
5. People/invitations, recovery, calendar, curriculum and program settings.
6. Notifications and shared email status, then public account/error/expired-link states.
7. Full responsive/light-dark/keyboard/error-state regression, deployed three-role browser journeys and visual export inspection.
8. Physical-device push acceptance after frontend completion, as requested by the owner.

This first pass is a shared-shell improvement, not a claim that every page is finalized or flawless. Do not count fixture tests as deployed end-to-end qualification.
