# Vyākaraṇa Labs — Roadmap: what remains

> **Status 2026-10-30 · paused by the owner.** This file is the plan; `docs/PROGRESS.md` is the log and the resume point;
> `docs/QUALITY.md` is the engineering, testing, security and delivery protocol every item below must pass.
> Each phase has **exit criteria**: a phase is done only when all are met and recorded in PROGRESS.

## 0. Where things stand

| Area | State |
|---|---|
| **Course** | Primer (3) + Saṃjñā (6) + Ac-sandhi (6) + Hal-sandhi (5) + Visarga-sandhi (3) = **23 lessons, LSK 1–114**, all open, reviewed by independent agents against the ashtadhyayi.com dataset |
| **Exercises** | **231 practice items + 135 review cards**; every typed sandhi answer machine-checked by the engine |
| **Engine** (`packages/engine`) | Transliteration, Śivasūtras/pratyāhāra, savarṇa, vowel / consonant / visarga sandhi with sūtra traces; **338 Vitest tests** |
| **Tools** | Pratyāhāra builder, sound classes, transliteration pad, sandhi (all three kinds), **Derivation** (vidyut-prakriyā WASM) |
| **Accounts** (M3) | Cognito email-OTP sign-in, token-handler cookie, progress, sessions, FSRS reviews, streaks, leaderboard, export, delete — **code complete, never deployed** |
| **Infra** | Terraform: bootstrap (state, OIDC roles), site, api, auth, data, email, guardrails modules; `terraform validate` green |
| **CI** | ci.yml: engine typecheck + tests, site build + typecheck, CSP hash budget, axe (46 pages × 2 themes), account e2e, derivation e2e, API ruff + pytest, Terraform validate / PR plan; deploy.yml dormant |
| **Open problems** | **CI red** (axe step after M6) · **external code review: 19 findings + P3s confirmed, none fixed** (PROGRESS §10) · not deployed |
| **Missing foundations** | Branch protection, PR flow, LICENSE, SECURITY.md, CODEOWNERS, Dependabot, CodeQL, secret scanning, SBOM, staging environment, real-AWS E2E, threat model, ADRs (planned, not written) |

## 1. Phases at a glance

| # | Phase | Size | Depends on | Exit criteria (summary) |
|---|---|---|---|---|
| **P0** | Restore green CI | S | — | `main` green; derivation e2e passes; its annotations read and checked |
| **P1** | Code-review remediation | L | P0 | All P1/P2 findings fixed with a reproducing test each; P3s fixed or ticketed |
| **P2** | Engineering foundations | M | P0 | Branch protection + required checks; repo hygiene files; supply-chain scanning on |
| **P3** | Test program build-out | L | P2 | Every layer in QUALITY.md §5 has its suite in CI at the stated gate |
| **P4** | Staging environment + real-AWS E2E | M | P1, P3, owner's AWS setup | Staging deployed from CI; full E2E (incl. OTP sign-in) passes against it |
| **P5** | Security review + penetration test | M | P4 | Threat model done; ASVS L2 checklist passed; pentest findings fixed |
| **P6** | First production deployment | S | P5 | Prod live behind the subdomain; smoke + synthetic monitoring green; rollback drilled |
| **P7** | UAT + beta | M | P6 | UAT exit criteria met (QUALITY.md §7) |
| **P8** | Remaining v1 features | XL | P6 | M5 community, certificates, Darśana track, analytics |
| **P9** | Content waves (LSK 115 → 1000+) | XL, ongoing | P6 | Each module: lessons + exercises + review + sign-off |
| **P10** | Launch hardening | M | P7 | Launch checklist (QUALITY.md §10) all ticked |

Sizes: **S** ≤ 1 session · **M** 2–4 sessions · **L** 5–10 · **XL** many.

---

## P0 — Restore green CI

1. Make `apps/web/e2e/a11y.cjs` emit each violation as `::error title=axe::<page> <rule> <target>` (CI logs and artifacts are on blob storage this sandbox cannot read; annotations are readable via `gh api repos/kartosis/vyakarana-labs/check-runs/<job id>/annotations`).
2. Fix the violation(s) on `/tools/prakriya/` (suspects: empty header `<td>`, button accessible names, contrast of `.prakriya-th-sa`).
3. Confirm `e2e/prakriya.cjs` passes; read its `::notice` output (rāma table, rāmaḥ derivation); check vidyut's step rendering (rule codes, changed terms, empty terms after lopa).
4. Independent reviewer agent on the Derivation tool (page copy, accessibility, rule links, licence credit).

**Exit:** two consecutive green CI runs on `main`; reviewer findings fixed.

## P1 — Code-review remediation (PROGRESS §10)

One PR per group, each with a test that reproduces the finding **first** (red), then the fix (green).

| PR | Findings | Content | Tests that must exist after |
|---|---|---|---|
| **P1-a IAM** | #2, #3 | App roles on their own prefix; permissions boundary required; explicit deny of IAM changes to `vl-github-*`; PassRole limited + `iam:PassedToService`; plan role read-only on state | Policy-as-code (Conftest/OPA or Checkov custom) asserting no self-escalation; `aws accessanalyzer validate-policy` in CI |
| **P1-b Session integrity** | #1, #8, #9 | Request id + idempotency record; `TransactWriteItems` for user-scoped writes; duplicate/ineligible card rejection; conditional updates; client retry queue with the same id | Replay test (same id ⇒ same response, totals unchanged); fault-injection test (fail after N writes, retry ⇒ correct totals); 100-duplicate review test ⇒ 400 |
| **P1-c Privacy** | #4 | Opt-out and rename update existing leaderboard rows | Opt-out ⇒ row gone immediately (no further activity); rename ⇒ new name |
| **P1-d Auth UX/security** | #5, #6, #18, Dashboard P3, rewrite.js | Resend confirmation for unconfirmed users; pending state survives reload; origin-checked `next`; retryable vs fatal refresh; error feedback for delete/export; collapse `//` in rewrite | Playwright: abandoned signup resume; `next=%2F%5Cevil.example` stays on site; 503 then recovery keeps session; delete failure shows error. Unit: rewrite.js with `//example.org/x` |
| **P1-e Progress sync** | #7 | Signed-in "Mark as read" writes to the account; reconcile on restore | E2E: mark on device A ⇒ visible on device B (two contexts) |
| **P1-f API validation** | #14, mypy P3 | `limit` 1–100 else 400; strict mypy clean; mypy in CI | Parametrised tests for limit; CI mypy step |
| **P1-g Engine** | #10, #11, #12, L P3 | Start slot honoured; 8.3.25 only for rāj+kvip forms; `nām` exact; ḻ articulation | Golden tests incl. the review's counter-examples (saṃrājitā, tadnāma/tannāma, h(14)+l ⇒ [h]) |
| **P1-h Publishing** | #13 | Only `open` modules produce routes, nav, sitemap, "taught in" | Build test: a `soon` module's lesson has no route and no sitemap entry |
| **P1-i CI/IaC** | #16, #17, deploy-gating P3 | `shell: bash` (pipefail); build Lambda zip before plan; deploy only after green CI (`workflow_run` or required checks + environment) | Deliberately failing plan in a test PR turns the job red |
| **P1-j Dev env** | #15, SutraFolio level P3 | `tzdata` dependency; type allows level 1 | API tests pass on Windows runner (add `windows-latest` to the API matrix) |
| **P1-k Analytics** | #19 | Implement the Cloudflare beacon when `CF_BEACON_TOKEN` is set (script src in CSP), or remove the switch | E2E: with token ⇒ beacon present and CSP-clean; without ⇒ absent |

**Exit:** every row merged; external review re-run (or a fresh reviewer agent) finds no P1/P2.

## P2 — Engineering foundations (repo & process)

| Item | Detail |
|---|---|
| Branch protection on `main` | PR required; 1 approving review (owner) or Copilot/agent review + owner; required status checks (all CI jobs); linear history; no force-push; conversation resolution; signed commits optional |
| PR template + checklist | Summary, linked issue, test evidence, screenshots (UI), a11y note, security note, rollback note |
| `CODEOWNERS` | `infra/** .github/** services/api/src/vl_api/auth*` → owner (security-sensitive paths) |
| `LICENSE` | Choose: code MIT/Apache-2.0; content CC BY-SA 4.0 (or keep all rights); third-party notices (vidyut MIT, ashtadhyayi.com data credit, fonts OFL) |
| `SECURITY.md` + `/.well-known/security.txt` | Disclosure contact, scope, SLA |
| `CONTRIBUTING.md`, issue templates | Bug, content error (sūtra/form), feature |
| Dependabot | npm, pip (uv), GitHub Actions, Terraform; weekly; grouped |
| GitHub security features | Secret scanning + **push protection**, Dependabot alerts, private vulnerability reporting, CodeQL default setup |
| Actions hardening | Pin third-party actions to commit SHA; top-level `permissions: {}` then per-job minimum; `concurrency`; `timeout-minutes` on every job; no `pull_request_target` |
| ADRs | Write ADR-0001…0006 (planned in ARCHITECTURE §16) + ADR-0007 vidyut WASM build in CI + ADR-0008 idempotency design |
| Docs refresh | ARCHITECTURE §11 CI/CD and §13 quality targets point to QUALITY.md; DEPLOY.md updated for staging |

**Exit:** settings verified via `gh api` and recorded; Scorecard (OpenSSF) baseline run.

## P3 — Test program build-out

Build the suites in QUALITY.md §5 in this order (each lands with its CI gate):
1. Static analysis gaps: ESLint (+ jsx-a11y, security plugin), Prettier check, `astro check`, mypy, actionlint, shellcheck, tflint, Checkov/Trivy config.
2. Data/content in CI: vendor a **pinned, minimal extract** of the ashtadhyayi.com dataset (only the files the checkers read) so `check-sutras.py` / `check-sources.py` run in CI.
3. Component tests for islands (Vitest + Testing Library + happy-dom).
4. Property-based tests (fast-check for engine; Hypothesis for API domain).
5. Contract tests: finish `services/api/openapi.yaml` → Schemathesis against the local handler; generate TS client types.
6. Playwright cross-browser (Chromium, Firefox, WebKit) + mobile emulation; journey suite (QUALITY.md §5.8).
7. Visual regression baselines.
8. Lighthouse CI + bundle/WASM size budgets.
9. Security scanners: CodeQL, Semgrep, gitleaks, OSV-Scanner, pip-audit, pnpm audit, SBOM + Grype, licence check.
10. Mutation testing (Stryker for engine, mutmut for API domain) — nightly, report only.

**Exit:** QUALITY.md §11 matrix shows every row ✅ or explicitly deferred with reason.

## P4 — Staging environment + end-to-end against real GitHub + AWS

Needs the owner's AWS steps (U2–U9 in ARCHITECTURE §14 / DEPLOY.md).

| Step | Detail |
|---|---|
| Terraform `envs/staging` | Same modules, `vl-stg-*` names, separate state key, smaller capacity; own Cognito pool, SES identity (sandbox is fine for test addresses), DynamoDB table, CloudFront distribution (default `*.cloudfront.net` domain, no custom DNS) |
| GitHub environments | `staging` (auto on merge to `main`), `prod` (required reviewer = owner, wait timer optional); OIDC trust restricted per environment (`sub` = `repo:kartosis/vyakarana-labs:environment:prod`) |
| Pipeline | build once → upload artifact (site + Lambda zip + WASM, with SLSA provenance) → deploy **the same artifact** to staging → staging E2E + DAST baseline → manual approval → prod → prod smoke |
| Test identities | Staging only: Cognito **custom email sender** trigger (or SES receipt rule → S3) that stores OTPs for `@test.<domain>` addresses so Playwright can complete real sign-in; never deployed to prod (Terraform flag + test asserting absence) |
| Staging E2E suite | Real sign-up/sign-in/OTP/refresh/logout, practice → progress, review scheduling, leaderboard opt-in/out, export, delete, guest merge, CSP/headers, rate limits |
| Data hygiene | Staging tables wiped nightly; test users deleted after each run |

**Exit:** staging pipeline green 5 runs in a row; prod pipeline dry-run (plan only) clean.

## P5 — Security review and penetration test

| Step | Detail |
|---|---|
| Threat model | STRIDE per data flow (browser ↔ CloudFront ↔ S3 / Lambda ↔ DynamoDB / Cognito / SES); trust boundaries; abuse cases (leaderboard gaming, OTP abuse, scraping, account takeover) — stored in `docs/security/threat-model.md` |
| ASVS | OWASP ASVS 5.0 **Level 2** checklist, item by item, evidence linked |
| Automated DAST | OWASP ZAP baseline (unauthenticated) + full/API scan (authenticated with a staging test user) |
| Manual pentest | OWASP WSTG-guided, scoped to staging: authN, session, authZ (IDOR/BOLA across two test users), input handling, business logic (scoring, reviews), CSP bypass attempts, open redirects, cache poisoning via CloudFront behaviours, IAM from a leaked-credential perspective (tabletop) |
| Cloud posture | IAM Access Analyzer (external + unused access), Prowler CIS checks, CloudTrail on, S3 public-access block verified, Budgets alerts tested |
| Report | Findings with severity, fix PRs, retest evidence — `docs/security/pentest-YYYY-MM.md` |

**Exit:** no open High/Critical; Medium have dated fixes; owner sign-off.

## P6 — First production deployment

Owner: U2–U9 (AWS account + MFA, bootstrap, GitHub variables/environments, Cloudflare CNAMEs, SES production access, admin group, alarm email). Then: prod deploy from the staged artifact → smoke (pages, headers, CSP, WASM, sign-in with the owner's address) → synthetic monitor (scheduled workflow every 30 min, hitting home, a lesson, a tool, `/api/v1/health`) → **rollback drill** (re-deploy previous artifact; verify).

**Exit:** prod live; monitors green 72 h; rollback drilled and timed.

## P7 — UAT and beta

Per QUALITY.md §7: personas, scripted scenarios, exploratory charters, Sanskrit-expert content sign-off per module, 10–30 beta learners for 2 weeks, SUS survey, defect triage.

**Exit:** QUALITY.md §7.5 exit criteria met.

## P8 — Remaining v1 features (from ARCHITECTURE §15)

| Feature | Notes |
|---|---|
| Report-an-error on every sūtra/form/lesson | Highest value for content accuracy; moderation queue |
| Private notes & highlights | Per-user, export/delete covered |
| Per-lesson discussion | Needs sanitisation, rate limits, moderation, abuse reporting — security review before launch |
| Admin dashboard | Cognito `admin` group; audit log |
| Certificates | Final assessment; shareable link + verification ID; tamper-evident |
| Darśana track | Bhartṛhari / Patañjali essays with verified quotations |
| Cookieless analytics | Cloudflare Web Analytics (P1-k) |
| Conjugation tables | vidyut `deriveTinantas` in the Derivation tool |

## P9 — Content waves (LSK order)

| Module | LSK | Sūtras | Notes |
|---|---|---|---|
| Ajanta-puṃliṅga | 115–214 | 100 | rāma, hari, guru, pitṛ… with the Derivation tool embedded |
| Ajanta-strīliṅga | 215–232 | 18 | ramā, mati, nadī, dhenu |
| Ajanta-napuṃsakaliṅga | 233–249 | 17 | jñāna, vāri, madhu |
| Halanta-puṃliṅga | 250–357 | 108 | |
| (chapters 9–11) | 358–370 | 13 | |
| Bhvādi (tiṅanta) | 371–549 | 179 | lakāras; conjugation tool |
| … remaining LSK | 550 → end | | avyaya, kṛdanta, kāraka, samāsa, taddhita, strīpratyaya |

Each module follows the proven pipeline: sūtra data from the dataset → lessons with verified quotes → exercises machine-checked → independent reviewer agent → fixes → axe/visual → open.

## P10 — Launch hardening

Performance budgets met on real devices; load test passed in staging; accessibility manual audit (NVDA + Firefox, VoiceOver iOS, TalkBack); SEO checks; legal pages; incident runbooks; launch checklist (QUALITY.md §10).

---

## Owner (Kartik) actions, in order

| When | Action |
|---|---|
| P2 | Approve branch protection settings; choose licences |
| P4 | AWS account + root MFA + Identity Center admin; run bootstrap (PowerShell steps in DEPLOY.md); create GitHub environments `staging`, `prod`; set variables |
| P4 | Decide the OTP capture method for staging (custom email sender vs SES receipt rule) |
| P5 | Approve pentest scope; review threat model |
| P6 | Cloudflare CNAMEs (DNS-only); SES production access; confirm alarm email; admin group |
| P7 | Recruit beta learners; name a Sanskrit reviewer for content sign-off |
