# Repository security and incident recovery

Run `python scripts/check-repository-security.py` before installing dependencies or opening unfamiliar branches in an editor. Run `python scripts/test-repository-security.py` to verify the guard and its CI wiring. Python 3.13 is used in CI; neither command installs packages.

The guard reads files without executing them. Exit 0 means the checked rules passed, 1 means findings need review, and 2 means the check could not complete. Findings report rule names and paths, not file contents or credentials. Review every finding; do not bypass a failed check to get a build through.

## What the guard checks

- The verified incident payload hash, disguised `.lfk` files, obfuscated JavaScript and identified remote-loader indicators.
- Folder-open tasks, enabling automatic editor tasks, and running scripts disguised as fonts.
- New package install lifecycle scripts, agent execution hooks, symlinks and local Git hooks requiring review.
- Known unreviewed automatic push helper filenames.

The check includes untracked and ignored project files, except dependency directories, build output, test artifacts, virtual environments, `.env` secrets and historical Git objects. It does not scan downloaded dependencies, investigate account sessions, or establish that Windows is clean. Treat it as a targeted guard, not an antivirus.

VS Code workspace settings disable automatic tasks. Keep unfamiliar repositories in Restricted Mode. Do not accept automatic-task prompts merely because a task is called lint, eslint, build, or setup. Inspect the command and the file it actually runs.

## CI and review

The repository-security workflow runs the guard and synthetic fixture tests with a read-only token and no persisted checkout credentials. Application CI checks the repository before installing npm dependencies. GitHub Actions are pinned to reviewed commit revisions; review and update those pins deliberately.

Make `repository-security` a required check after its workflow is merged and has run. Keep application checks required too. Require independent review of the final commit, code-owner review, fresh approval after pushes, administrator enforcement, and disabled force pushes. CODEOWNERS and passing CI alone do not enforce these restrictions. Private organization repositories require an eligible GitHub plan for branch protection; do not change visibility or billing as a workaround without the owner's decision.

Inspect workflows, editor configuration, agent hooks, package scripts, dependencies and executable assets in every review. A compromised account can modify the guard itself unless effective server-side review controls prevent it.

## If suspicious code is found

1. Stop executing the affected checkout and preserve commit IDs, hashes and authenticated push events. Inspect suspected files as data; do not run a payload to discover what it does.
2. Remove verified malicious files and launch mechanisms from every affected branch tip. Use ordinary commits with reviewable changes and verify the resulting trees. Old commits remain dangerous even after a cleanup commit; do not check out and trust them. Coordinate any later history purge with collaborators, backups, forks and GitHub Support.
3. From a separate trusted device, revoke potentially exposed GitHub tokens, sessions, SSH/deploy keys and application grants. Review organization access and audit logs. Commit author names do not identify the authenticated pusher or the person controlling an account.
4. Rotate credentials that were accessible to the affected machine: database connections, deployment/provider tokens, account-mail credentials, token-signing secrets, mailbox-encryption secrets and push keys as applicable. Plan migrations carefully: changing encryption or signing keys may invalidate sessions, stored encrypted connections or push subscriptions.
5. Run current antivirus full/offline scans. An offline scan reboots the machine; save work first. Where arbitrary downloaded code may have executed, rebuilding the device from trusted installation media gives stronger assurance than deleting the visible loader.
6. Recreate dependencies and generated artifacts on a trusted device from reviewed source and lockfiles. Inspect npm lifecycle scripts first; `npm ci --ignore-scripts` reduces initial execution, but required native builds or generators still need deliberate review before being run.

Keep incident details and credentials in a trusted private channel with the repository owner. Do not post secrets or potentially sensitive forensic records in a public issue or pull request.
