# Main review preparation

HJeandedieu is the confirmed trusted owner. Every changed file requires code-owner review once main protection is active. GitHub does not allow self-approval: owner-authored PRs need another trusted code owner. Do not weaken this requirement to make a PR mergeable.

Private main protection is currently blocked by the organization Free plan (HTTP 403). This CODEOWNERS file alone does not prevent merges or direct pushes. Repository Actions defaults have been set read-only and Actions PR approvals disabled; those settings are not merge gates.

Activation policy, verification helper and exact checks are in the backend repository: docs/production/main-protection-setup.md and scripts/protect-main.mjs. An eligible organization plan and reviewed owner files on main are required before activation. Backend requires check; production web requires verify; docs/UI have no current automated test workflow and must not be described as test-gated.

Review the exact final SHA and the whole diff, especially workflows, scripts, manifests, dependencies and new executable files. Passing CI is not proof of malware absence. Investigate unexpected pushes/closures through GitHub audit logs and account access. No account or notification preference is changed by these files.
