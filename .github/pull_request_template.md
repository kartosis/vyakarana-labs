## What and why

<!-- One paragraph: the change and the reason. Link the issue or review finding (e.g. "review #8"). -->

## Evidence

- [ ] Tests added or changed first, and they failed before the fix (name them)
- [ ] CI green (engine, site build, API on Ubuntu and Windows, browser tests, Terraform)
- [ ] UI change: screenshots in light and dark, desktop and phone; axe still 0
- [ ] Sanskrit shown to learners: checked against the sources (PROGRESS §4.4); unverified items marked `verified: false`

## Risk

- **Security / privacy:** <!-- auth, IAM, CSP, personal data — or "none" -->
- **Data:** <!-- DynamoDB keys, migrations, idempotency — or "none" -->
- **Rollback:** <!-- revert this PR / redeploy previous commit / manual steps -->
