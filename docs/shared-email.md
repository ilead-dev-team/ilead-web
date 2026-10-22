# Program email interface

For API responses with `scope: "PROGRAM"` and `provider: "brevo"`, email settings
show the shared sender and remove personal Connect Gmail and Disconnect controls.
Invitations and recovery refer to configured account email. Legacy Gmail UI remains.

The page explains that configuration is not proof of delivery. Disabled configuration
blocks sending and directs the Coordinator to email settings. Provider keys and
sender selection remain backend infrastructure responsibilities.

Response parsing rejects mismatched program/provider scope and reconnect states.
Browser checks cover configured and disabled shared status in light and dark modes,
refresh behavior and absence of personal OAuth controls, alongside existing account
delivery and people workflows. Run on a dedicated development port:

```sh
npx playwright test --config playwright.email.config.ts e2e/account-delivery.spec.ts e2e/people.spec.ts
```

Live acceptance still requires Brevo phone verification, approval of the outgoing
sender, backend provider credentials and deployed inbox tests. This UI does not
imply those external steps are complete.
