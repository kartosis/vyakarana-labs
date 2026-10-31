# Vyākaraṇa Labs — Engineering, Testing, Security and Delivery Protocol

> The standard every change must meet, from a one-line content fix to a new AWS service. It adapts the publicly
> documented practices of large engineering organisations (Microsoft's Security Development Lifecycle, Google's
> engineering-practices and SRE guidance, Meta's published continuous-deployment practice), OWASP ASVS / WSTG /
> API Top 10, NIST SSDF and SLSA to this project's stack and its **$0 AWS budget**.
> Plan of work: `docs/ROADMAP.md`. Current state of each item: §11.

## 0. Principles

| Principle | Meaning here |
|---|---|
| **Everything as code, reviewed** | App, content, data, infra, CI, policies, dashboards, runbooks: all in git, all through PRs |
| **Shift left** | The cheapest check that can catch a defect runs first (editor → pre-commit → PR → merge → staging → prod) |
| **Build once, promote** | One immutable, attested artifact goes staging → prod; prod never rebuilds |
| **Reproduce, then fix** | Every bug fix starts with a failing test that reproduces it |
| **Small changes** | PRs reviewable in < 30 min; one concern each; feature flags for unfinished work |
| **Least privilege** | Every identity (CI role, Lambda, learner) gets only what its job needs; nothing can widen its own access |
| **Source of truth for Sanskrit** | Primary texts (LSK, Kāśikā, Mahābhāṣya, Vākyapadīya) via the pinned dataset; content claims are checked, not trusted |
| **Measure** | SLOs, error budgets, DORA metrics, performance and a11y budgets enforced in CI |
| **Blameless learning** | Every incident or escaped defect gets a short postmortem and a guarding test |

## 1. Ways of working

### 1.1 Source control
- **Trunk-based**: `main` always releasable; short-lived branches `type/short-name` (≤ 2 days).
- **Branch protection on `main`**: PR required · all required checks green · ≥ 1 approval (owner) · conversation resolution · linear history (squash merge) · no force-push / deletion · admins included.
- **Commit messages**: Conventional Commits (`feat:`, `fix:`, `content:`, `infra:`, `test:`, `docs:`, `ci:`); enables changelog automation.
- **CODEOWNERS**: owner required on `infra/**`, `.github/**`, `services/api/src/vl_api/{auth,app}*`, `scripts/build-*.sh`.
- **Secrets never in git**: push protection + gitleaks pre-commit and CI.

### 1.2 Pull requests
| Element | Requirement |
|---|---|
| Size | ≤ ~400 changed lines of code (content/data PRs may be larger if generated) |
| Description | What and why · linked issue · **test evidence** · screenshots (UI, both themes, mobile) · a11y note · security note · rollback note |
| Review checklist | Correctness · tests reproduce/guard · names and comments · errors handled · security (input, authZ, secrets) · performance · a11y · i18n (Devanagari/IAST) · docs/ADR updated |
| Agents | AI-written PRs get an independent reviewer pass (separate agent, no shared context) before the owner's review — as done for every course module |
| Merge | Squash; title becomes the changelog line |

### 1.3 Definition of Ready / Done
- **Ready**: problem statement, acceptance criteria (Given/When/Then), affected surfaces, test approach, security/a11y impact noted.
- **Done**: acceptance criteria met · tests at the right layers · CI green · docs updated · deployed to staging and verified · feature flag state decided · no new a11y/perf budget breaches · PROGRESS log updated.

### 1.4 Design docs and ADRs
- **Design doc** (1–3 pages) before anything touching auth, data model, infra, or more than one service: context, goals/non-goals, options, decision, risks, test plan, rollout/rollback.
- **ADR** for every lasting decision (`docs/adr/NNNN-title.md`, status Proposed → Accepted → Superseded).

## 2. Environments and promotion

| Env | Purpose | How created | Data | Access |
|---|---|---|---|---|
| **Local** | Develop | `pnpm dev`, `astro preview`, moto for API | Fixtures | Developer |
| **CI ephemeral** | PR checks | GitHub-hosted runners | Fixtures, moto, stubbed Cognito | Workflow token, no AWS |
| **Staging** | Integration with real AWS | Terraform `envs/staging` (`vl-stg-*`), deployed on every merge | Synthetic test users only; wiped nightly | OIDC role bound to `environment:staging` |
| **Production** | Learners | Terraform `envs/prod`, promoted artifact | Real; minimal PII (email) | OIDC role bound to `environment:prod` + owner approval |

**Promotion**: `build` job → artifacts (site `dist/`, `vl-api.zip`, vidyut WASM) + SBOM + **build provenance attestation** → deploy to staging → staging gates (§3) → manual approval → prod deploy of the **same digests** → prod smoke → synthetic monitoring.
**Feature flags**: `config.json` toggles (exists for accounts) extended to `features: {discussion, certificates, analytics…}`; flags default off in prod until UAT sign-off; removed within 2 releases of full rollout.
**Canary (optional, $0)**: CloudFront continuous deployment (staging distribution receiving a header-selected or small weighted share) before full promotion of risky front-end changes.

## 3. CI/CD pipeline and quality gates

### 3.1 Stages

| Stage | Trigger | Must pass (blocking) | Advisory (reported) | Target time |
|---|---|---|---|---|
| **Pre-commit** (local, `lefthook` or `pre-commit`) | commit | format, lint on staged files, gitleaks, YAML/JSON validity | — | < 10 s |
| **PR — fast lane** | PR open/update | lint (ESLint, ruff, actionlint, shellcheck, tflint, markdownlint), typecheck (tsc, astro check, mypy strict), unit + property tests (engine, API domain, islands), content/data checks, build, CSP budget | coverage delta | < 6 min |
| **PR — full lane** | same, parallel | Playwright E2E (3 browsers + mobile) under prod CSP, axe on all page types × themes, visual regression, Lighthouse CI budgets, bundle/WASM size, contract tests + Schemathesis fuzz, CodeQL, Semgrep, dependency review (new vulns/licences), Checkov/Trivy IaC, policy-as-code (IAM), `terraform plan` (read-only role) posted to PR | mutation score (nightly), ZAP | < 15 min |
| **Merge queue** (when PR volume grows) | merge | re-run fast lane on the merged result | — | — |
| **Post-merge: build** | push `main` | build artifacts once; SBOM (CycloneDX); provenance attestation; upload | — | < 8 min |
| **Deploy staging** | after build | Terraform apply (staging) → deploy artifacts → **staging smoke** → **staging E2E (real Cognito, OTP)** → ZAP baseline → header/TLS checks → k6 smoke load | ZAP full (nightly) | < 20 min |
| **Promote prod** | owner approval | Terraform apply (prod) → deploy same digests → prod smoke (read-only) → CloudFront invalidation → synthetic check | — | < 10 min |
| **Nightly** | schedule | full E2E matrix vs staging, ZAP full + API scan (authenticated), link check, dataset re-verification, mutation testing, dependency audit, drift detection (`terraform plan -detailed-exitcode` on prod with read role) | Scorecard | — |
| **Weekly** | schedule | k6 load/soak in staging, backup-restore drill (staging), Prowler + Access Analyzer report, Lighthouse on prod | — | — |

### 3.2 Pipeline hygiene (supply-chain security, SLSA-aligned)
- Third-party actions **pinned to full commit SHA**; Dependabot keeps them current.
- `permissions: {}` at top level; each job requests only what it needs (`contents: read`, `id-token: write` only on deploy jobs, `pull-requests: write` only on the plan-comment job).
- No `pull_request_target`; fork PRs never get AWS credentials; OIDC trust policies restrict `sub` to `repo:kartosis/vyakarana-labs:environment:<env>` and `aud` to `sts.amazonaws.com`.
- `timeout-minutes` on every job; `concurrency` per ref; deploys not cancellable mid-apply (`cancel-in-progress: false` for deploy).
- **Every shell step uses `shell: bash`** (gives `-eo pipefail`; review finding #16).
- Artifacts carry checksums; deploy verifies attestation (`gh attestation verify`) before applying.
- Toolchains pinned (`.nvmrc`, `packageManager`, `uv.lock`, Terraform `required_version`, provider lock file, vidyut commit, wasm-pack version).
- Caches keyed by lockfile hashes; never cache secrets.
- OpenSSF Scorecard action on schedule; aim ≥ 8/10.

### 3.3 Required status checks on `main`
`web` · `e2e` · `api` (Linux + Windows) · `terraform` · `codeql` · `security-scans` · `dependency-review` · `lighthouse` · `visual`. A red required check blocks merge; a flaky test is quarantined (§4.4), never "re-run until green".

## 4. Test strategy

### 4.1 Pyramid and ownership
| Layer | Share | Where | Speed |
|---|---|---|---|
| Static analysis | — | every file | seconds |
| Unit + property | ~70 % | engine, API domain, island logic | ms |
| Integration / contract | ~20 % | API + moto, islands + DOM, content pipeline | seconds |
| E2E (browser, staging) | ~10 % | critical journeys only | minutes |
| Manual (exploratory, UAT, pentest, SR) | targeted | before releases | hours |

### 4.2 Coverage targets (enforced as ratchets — never decrease)
- Engine: lines ≥ 95 %, branches ≥ 90 %, mutation score ≥ 80 % (Stryker).
- API: handlers and repo ≥ 90 % lines, ≥ 85 % branches; domain mutation ≥ 75 % (mutmut).
- Islands: ≥ 80 % lines on logic modules.
- Content: 100 % of sūtras and quotations verified against the pinned dataset; 100 % of typed sandhi answers machine-checked.

### 4.3 Test data
- Fixtures versioned in `tests/fixtures`; factories for API items; **no production data** outside prod, ever.
- Staging test users `e2e-<run-id>@test.<domain>`; created and deleted by the suite.
- Golden files for paradigms/derivations reviewed by a human before acceptance.

### 4.4 Flaky-test policy
Retries allowed only in E2E (max 2) with trace capture; any test failing ≥ 2 % over 7 days is quarantined (tag + issue + owner) and fixed or deleted within a week.

## 5. Test catalogue by layer

### 5.1 Static analysis
| Tool | Scope | Gate |
|---|---|---|
| `tsc --noEmit` (strict), `astro check` | engine, web (incl. `.astro` templates — catches the SutraFolio `level` type error) | block |
| ESLint + `typescript-eslint`, `eslint-plugin-jsx-a11y`, `eslint-plugin-security`, `no-unsanitized` | TS/TSX | block |
| Prettier / `ruff format --check` | all | block |
| ruff (incl. bandit `S` rules), mypy `--strict` | API | block |
| actionlint, shellcheck, yamllint, markdownlint | workflows, scripts, docs | block |
| `terraform fmt -check`, `validate`, tflint (aws ruleset) | infra | block |
| cspell (+ Sanskrit/IAST dictionary) | content, UI copy | advisory |

### 5.2 Unit tests
- **Engine**: golden tests from LSK/Kāśikā examples (exists, 338); each sandhi rule has positive, counter-example and boundary cases; review counter-examples (saṃrājitā, tadnāma, h(14)+l) added.
- **API domain**: scoring, streak/day boundaries across time zones and DST, FSRS state transitions, plausibility checks, leaderboard week keys.
- **Lib (web)**: auth state machine (pending → confirmed → refreshed → expired), API signing (OAC body hash), config loading, storage wrappers.
- **Edge function**: `rewrite.js` (directory index, trailing-slash redirect, `//` collapse, query preservation, `/api/` passthrough).

### 5.3 Property-based and fuzz tests
| Target | Property |
|---|---|
| Transliteration | `deva → slp1 → deva` and `iast → slp1 → iast` round-trip for all valid strings; NFC/NFD inputs equal; no throw on arbitrary Unicode |
| Sandhi engines | Never throw; result non-empty; every alternative cites a sūtra; joining is deterministic; unrelated prefixes/suffixes unchanged |
| Pratyāhāra | For every start slot and later it-marker, members = slice of the Śivasūtra list (start slot honoured) |
| API models | Hypothesis: arbitrary JSON → 4xx never 5xx |
| HTTP API | **Schemathesis** from `openapi.yaml`: all endpoints, negative data, auth on/off |
| Regexes on user input | ReDoS check (e.g. `recheck` / `safe-regex`) |

### 5.4 Content and data tests (the project's distinctive layer)
- `check-sutras.py` (deva, pada, LSK/SK numbers, vṛtti) and `check-sources.py` (quotes verbatim) **in CI** against a vendored, pinned extract of the dataset.
- Exercise checker (exists): typed answers ⊆ engine forms; every correct optional form accepted.
- Schema validation of all YAML/MDX frontmatter (zod, exists).
- Citation coverage: every `<SutraFolio>`/`<SutraRef>` resolves; every Voice quote exists and is `verified: true` or visibly marked.
- Link check (internal anchors, external links weekly), sitemap only contains `open` modules (review #13).
- Glossary consistency: technical terms spelled one way (IAST lint list).
- **Human gate**: independent reviewer agent per module + named Sanskrit reviewer sign-off before a module opens.

### 5.5 Component tests (islands)
Vitest + `@testing-library/preact` + happy-dom for: SandhiPad (modes, options, URL sync, untouched notes), Steps (navigation, Devanagari splitting), ShivaBoard (selection, start slot), PrakriyaStepper (loading/unavailable/ready states with a mocked module, variants, rule links), PracticeSession (grading incl. avagraha/space-insensitive, timing, retry), ReviewSession (pending queue, retry), SignIn (all branches incl. unconfirmed resend, `next` origin check), Dashboard (export/delete errors). Keyboard interaction and ARIA states asserted.

### 5.6 Integration tests (API)
- Real router + request models + JWT verifier (test JWKS) + repo + FSRS on **moto** DynamoDB (exists, 22 tests → extend).
- Fault injection: fail the Nth DynamoDB call → idempotent retry yields correct totals (review #1).
- Concurrency: two parallel session posts with the same request id → one effect.
- Time: freeze clocks around midnight in learner time zones; week rollover for leaderboard.
- Windows runner in the matrix (review #15).

### 5.7 Contract tests
- `services/api/openapi.yaml` is the contract; CI fails if a handler's response does not validate against it.
- Generate TS types for `lib/api.ts` from the spec; a drift check fails the build.
- Consumer-driven cases for each island's API calls.

### 5.8 End-to-end (Playwright, `@playwright/test`)
Migrate the existing `.cjs` scripts to the test runner (projects, retries, traces, HTML report as artifact, sharding).
Projects: Chromium, Firefox, WebKit, Pixel 7 (Chrome), iPhone 14 (WebKit), 200 % zoom, `prefers-reduced-motion`, `forced-colors`.

| ID | Journey | Env |
|---|---|---|
| E2E-01 | Guest reads a lesson; script switch Deva/both/IAST persists; theme toggle persists | CI |
| E2E-02 | Course navigation: rail, prev/next, only open modules linked | CI |
| E2E-03 | Every tool: inputs in Devanagari, IAST, HK, SLP1; shareable URL restores state | CI |
| E2E-04 | Derivation tool: WASM loads under prod CSP; table; derivation; variants; unavailable fallback | CI |
| E2E-05 | Sign-up → OTP → signed in → `next` honoured (same-origin only) | CI (stub) + staging (real) |
| E2E-06 | Sign-in existing user; wrong code; expired code; resend; abandoned sign-up resumed | CI + staging |
| E2E-07 | Practice session → results → progress, streak, cards, leaderboard updated | CI + staging |
| E2E-08 | Retry after network failure mid-save → no double counting | CI (fault) + staging |
| E2E-09 | Review session → FSRS schedule; failed final save → retry works | CI + staging |
| E2E-10 | Guest progress merges on sign-in; mark-as-read while signed in syncs to second device | CI + staging |
| E2E-11 | Settings: script, daily goal, leaderboard opt-out removes public row immediately, pseudonym change | CI + staging |
| E2E-12 | Token refresh after expiry; 503 during refresh keeps session; logout clears cookie and access token | CI + staging |
| E2E-13 | Export data contains exactly the user's records; delete account removes all user records and LB rows | staging |
| E2E-14 | Security headers and CSP on every route; no CSP violations in console; no mixed content | CI + staging + prod smoke |
| E2E-15 | 404 page; trailing-slash redirects; `//host` paths do not redirect off-site | staging |
| E2E-16 | Offline / slow 3G: lessons readable; practice queues and recovers | CI |

### 5.9 Visual regression
Playwright `toHaveScreenshot` for each page type × {light, dark} × {Deva, IAST} × {1440, 390} (fonts self-hosted, animations off, fixed date); threshold 0.1 %; baselines updated only via PR with reviewer approval. Devanagari conjunct rendering (क्ष, ज्ञ, र्च्य, ᳵ ᳶ) in a dedicated specimen page.

### 5.10 Accessibility (WCAG 2.2 AA)
- Automated: axe on every page type × theme (exists, 46 × 2) **plus** states (dialogs open, errors shown, derivation open); Lighthouse a11y ≥ 100.
- Scripted keyboard: every journey in §5.8 completed with keyboard only; focus visible, order logical, no traps; skip link.
- Manual each release: NVDA + Firefox (Windows), Narrator + Edge, VoiceOver (macOS Safari, iOS), TalkBack (Android); 200 %/400 % zoom and reflow at 320 px; forced colours (Windows contrast themes); reduced motion; `lang="sa"` / `sa-Latn` pronunciation behaviour.
- Content: alt text, table headers/scope, heading hierarchy, link text, Sanskrit marked up with `lang`.

### 5.11 Performance
| Budget | Target | Tool |
|---|---|---|
| LCP (4G, mid phone) | ≤ 1.8 s | Lighthouse CI (lab), Cloudflare Web Analytics (field) |
| INP | ≤ 200 ms | web-vitals in E2E + field |
| CLS | ≤ 0.05 | Lighthouse CI |
| JS on reading pages | ≤ 50 KB gz | size-limit |
| Fonts | ≤ 150 KB | size-limit |
| vidyut WASM | ≤ agreed budget (record first CI size), lazy-loaded only on the tool | CI size check |
| API p95 (warm) | ≤ 300 ms; cold start ≤ 1.5 s | k6 + CloudWatch |

### 5.12 Load, stress, soak (staging, within free tier)
k6 scenarios: browse (static, CloudFront), 50 concurrent practice sessions, review bursts, leaderboard reads; ramp to the provisioned DynamoDB capacity to observe throttling, retries and alarms; 1-hour soak weekly. Pass: error rate < 0.5 %, p95 within budget, no unbounded retries, alarms fire when expected.

### 5.13 Resilience
Fault injection in integration/E2E: DynamoDB throttling, Lambda timeout, 5xx from `/auth/refresh`, Cognito unavailable, partial page load (WASM 404), clock skew ± 5 min. Expected: user-visible message, retry with backoff, idempotency, no data loss.

### 5.14 Infrastructure tests
- `terraform validate`, tflint, Checkov/Trivy config, **policy-as-code** (Conftest/OPA): no IAM statement lets a CI role modify `vl-github-*`; PassRole restricted; S3 public access blocked; encryption on; log retention set; CloudFront TLS ≥ 1.2, HSTS, OAC only.
- `terraform test` (mock providers) for module invariants (CSP length ≤ limit, behaviours ordering, OAC on API origin).
- IAM Access Analyzer `validate-policy` on every generated policy JSON.
- Drift detection nightly; post-apply smoke (headers, routes, Function URL not reachable directly).

### 5.15 End-to-end with GitHub + AWS (real cloud)
| Check | How |
|---|---|
| OIDC trust | From a PR (no environment) the deploy role **cannot** be assumed; from `environment:staging` only the staging role; from `environment:prod` only after approval |
| Least privilege | Attempt forbidden actions from the deploy role in staging (create unrelated role, attach AdministratorAccess, modify `vl-github-*`) → must be denied |
| Plan role | Can read state, cannot write/delete it |
| Lambda Function URL | Direct calls without CloudFront OAC signature → 403 |
| S3 | Direct object URL → denied; only CloudFront OAC |
| Cognito | Real OTP sign-in via staging test mailbox (SES receipt rule → S3 for `@test.` subdomain, $0; a custom email sender trigger would need a paid KMS key) |
| SES | DKIM aligned; bounce/complaint handling configured |
| Alarms/Budgets | Synthetic breach in staging → SNS email received |
| Rollback | Re-deploy previous artifact; Lambda alias rollback; verify in < 15 min |

### 5.16 Cross-browser / device matrix
Windows 11: Chrome, Edge, Firefox · macOS: Safari, Chrome · iOS: Safari · Android: Chrome · (Baseline 2024 features only, newer ones behind `@supports`). Devanagari input methods: Windows Sanskrit/Hindi keyboard, Google Input Tools, macOS Devanagari QWERTY; IAST via composed and decomposed diacritics.

### 5.17 SEO, content and legal
Sitemap/robots correct (no drafts), canonical URLs, Open Graph, structured data for courses, 404 status codes, no broken links; privacy policy matches actual data flows; licences and third-party notices present; cookie-free claim verified (no cookies except the auth refresh cookie on `/api/v1/auth`).

### 5.18 Observability tests
Structured logs contain request id, no PII/tokens (log-scrubbing unit test); metrics emitted (EMF); every alarm has a runbook link and has been triggered once in staging; dashboard per SLO.

## 6. Security programme (SDL-aligned)

### 6.1 Lifecycle
| SDL phase | Activity here | Artifact |
|---|---|---|
| Requirements | Security & privacy requirements per feature (ASVS L2 mapping) | issue template field |
| Design | **Threat model** (STRIDE per data flow, abuse cases), design review for auth/data/infra changes | `docs/security/threat-model.md` |
| Implementation | Secure defaults, SAST (CodeQL, Semgrep, bandit), secrets scanning, dependency policy | CI gates |
| Verification | DAST (ZAP), fuzzing (Schemathesis, property tests), authN/authZ suites (§6.2–6.3), IaC policy, **penetration test** | reports in `docs/security/` |
| Release | Final security review checklist, incident response plan, `SECURITY.md` + `security.txt` | sign-off record |
| Response | Vulnerability intake, triage SLA (Critical 24 h, High 7 d, Medium 30 d), advisories | GitHub private reporting |

### 6.2 Authentication test cases (ASVS V2/V3, Cognito EMAIL_OTP + token-handler cookie)
| ID | Case | Expected |
|---|---|---|
| AUTHN-01 | Brute-force OTP (many wrong codes) | Cognito lockout/throttle; UI generic error; no code oracle |
| AUTHN-02 | Reuse a consumed OTP | Rejected |
| AUTHN-03 | Expired OTP | Rejected; resend offered |
| AUTHN-04 | Resend flood | Rate-limited; no email bombing of third parties (per-address and per-IP limits) |
| AUTHN-05 | Account enumeration via sign-up vs sign-in responses and timing | Indistinguishable messages; constant-ish timing |
| AUTHN-06 | Unconfirmed account recovery | Resend confirmation works; state survives reload (review #5) |
| AUTHN-07 | JWT tampering: `alg:none`, wrong `kid`, bad signature, wrong `iss`, wrong `client_id`/`aud`, `token_use=id`, expired, future `iat`, clock skew | All 401 |
| AUTHN-08 | Refresh cookie flags | `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`; never readable by JS |
| AUTHN-09 | CSRF on cookie endpoints (`/auth/refresh`, `/auth/logout`) from another origin | Blocked (SameSite + required `X-VL-Auth`/signed body + Origin check) |
| AUTHN-10 | Logout | Refresh token revoked server-side (Cognito `RevokeToken`); old cookie unusable; access token cleared |
| AUTHN-11 | Refresh with revoked/rotated token | 401 → clean sign-out; 5xx → keep session, retry later (review #18) |
| AUTHN-12 | Session fixation / swapping | New tokens per sign-in; cookie set only after successful OTP |
| AUTHN-13 | Access token storage | sessionStorage only, short TTL; never logged; cleared on tab close |
| AUTHN-14 | Open redirect after sign-in (`next=//x`, `/\x`, `https:x`, encoded variants) | Stays on site (review #6) |
| AUTHN-15 | Account deletion | Requires fresh auth; removes Cognito user and all records |
| AUTHN-16 | Email change / case-folding (`A@x` vs `a@x`) | Single account; no takeover |

### 6.3 Authorization test cases (ASVS V4, OWASP API Top 10)
| ID | Case | Expected |
|---|---|---|
| AUTHZ-01 | **BOLA/IDOR**: user B requests A's progress, cards, sessions, export by any id/key manipulation | Impossible: every query keyed by token `sub` only |
| AUTHZ-02 | Mass assignment: extra fields in PATCH `/me` (e.g. `points`, `isAdmin`, `sub`) | Rejected (pydantic `extra="forbid"`) |
| AUTHZ-03 | Admin endpoints without `admin` group | 403/404 |
| AUTHZ-04 | Leaderboard privacy: opted-out users never appear; pseudonym only | Verified after opt-out without further activity (review #4) |
| AUTHZ-05 | Review submission for cards the user doesn't own / not due / duplicated | 400 (review #8) |
| AUTHZ-06 | Score inflation: replayed or forged sessions | Idempotent; plausibility limits; bounded points per day |
| AUTHZ-07 | Unauthenticated access to every `/api/v1/*` except public (leaderboard, health) | 401 |
| AUTHZ-08 | Direct Lambda Function URL / S3 access bypassing CloudFront | Denied (OAC) |
| AUTHZ-09 | Cloud: CI roles cannot escalate; Lambda role only its table/index and logs | Policy tests + live denial tests in staging |
| AUTHZ-10 | Future discussion/notes: users edit/delete only their own content; moderators scoped | Per-feature suite |

### 6.4 Input, client and platform security
- **XSS**: no `innerHTML`/`dangerouslySetInnerHTML` with user data (lint rule); future user content sanitised server-side and rendered as text; consider Trusted Types (`require-trusted-types-for 'script'`) once compatible.
- **CSP**: strict hashes (exists), `wasm-unsafe-eval` only; add `report-to` endpoint (staging) to collect violations; `frame-ancestors 'none'`.
- **Headers**: HSTS (preload when ready), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (deny all unused), COOP/CORP; verified by test.
- **Injection**: DynamoDB expressions parameterised (review grep in CI); no `eval`; regexes ReDoS-checked.
- **Unicode**: normalise (NFC) before comparison; reject control characters in names; homoglyph-safe pseudonyms.
- **Rate limits / abuse**: per-user caps on sessions, reviews, reports; Cognito limits for OTP.
- **Dependencies**: Dependabot + `dependency-review-action` (block High/Critical and disallowed licences), `pnpm audit`, `pip-audit`, OSV-Scanner, SBOM (Syft/CycloneDX) + Grype on artifacts.
- **Secrets**: none in the app; GitHub variables only for non-secret ids; push protection + gitleaks.
- **Cloud posture**: CloudTrail (management events), IAM Access Analyzer (external + unused access), Prowler CIS scan weekly, S3 Block Public Access account-wide, root MFA, no access keys for humans (Identity Center).

### 6.5 DAST and penetration testing
- **ZAP baseline** (passive) on every staging deploy; **ZAP full + API scan** (authenticated as a staging test user, OpenAPI-driven) nightly.
- **Manual penetration test** before launch and after major auth/data changes, following OWASP WSTG: information gathering, configuration (headers, TLS via testssl.sh, CloudFront behaviours, cache poisoning via unkeyed headers), identity/authN/session (§6.2), authZ (§6.3 with two accounts), input validation, error handling, business logic (scoring, streaks, leaderboard), client-side (DOM XSS, CSP bypass, postMessage), API (OWASP API Top 10), cloud (leaked-credential tabletop for each role).
- Output: findings with CVSS-style severity, reproduction, fix PR, retest evidence → `docs/security/pentest-YYYY-MM.md`.
- After launch: `security.txt`, private vulnerability reporting, hall of thanks (no paid bounty at $0).

### 6.6 Privacy
Data inventory (email, Cognito sub, progress, sessions, cards, settings, pseudonym); purpose and retention per item; export and delete tested (E2E-13); no analytics cookies; logs free of email/tokens; privacy page generated from the inventory and reviewed each release.

## 7. User acceptance testing (UAT)

### 7.1 Personas
| Persona | Profile | Focus |
|---|---|---|
| **New learner** | No Sanskrit; reads IAST | Primer, script switch, first sandhi lessons, practice |
| **Intermediate student** | Knows Devanagari, some Pāṇini | Sūtra folios, derivations, tools, reviews |
| **Scholar / teacher** | Reads LSK and Kāśikā | Accuracy of sūtras, vṛttis, quotes, translations, citations |
| **Screen-reader user** | NVDA/VoiceOver | Every journey non-visually |
| **Mobile learner** | Android, slow network | Reading, practice, offline behaviour |
| **Returning user** | Second device | Sync, streaks, reviews |

### 7.2 Scripted scenarios (Given / When / Then), one set per feature
Examples (full set lives in `docs/uat/scenarios.md`):
- UAT-01 *Given* a new visitor, *when* they open the course and switch to IAST, *then* every Sanskrit word on every page shows IAST and the choice persists.
- UAT-07 *Given* a signed-in learner, *when* they complete a lesson's practice with 8/10, *then* results show 80 %, the lesson shows "practised", and due reviews appear the next day.
- UAT-12 *Given* the scholar, *when* they open any sūtra page, *then* text, word split, anuvṛtti, LSK number and vṛtti match their printed LSK (edition differences flagged on the page).
- UAT-15 *Given* a learner who opts out of the leaderboard, *when* they check the leaderboard, *then* their pseudonym is gone immediately.

### 7.3 Exploratory testing
Time-boxed charters (60–90 min) per area: "Explore the sandhi tool with unusual inputs (pluta, avagraha, Vedic signs, mixed scripts)"; "Explore sign-in edge cases across two tabs and two devices"; "Explore the course on a 320 px screen at 200 % zoom". Session notes + bugs logged.

### 7.4 Content acceptance
Each module before opening: reviewer agent report + fixes, then a named Sanskrit reviewer checks every example against LSK/Kāśikā, every translation and gloss, every exercise key; sign-off recorded in PROGRESS.

### 7.5 Beta and exit criteria
10–30 beta learners for two weeks via a feature flag; in-app "report an error"; weekly triage.
**Exit**: no open Sev-1/Sev-2; task success ≥ 90 % on scripted scenarios; SUS ≥ 80; zero unresolved content-accuracy reports older than 7 days; a11y manual audit passed; owner sign-off.

## 8. Release management and operations

### 8.1 Versioning and changes
SemVer for `@vl/engine`; date-based release tags for the site (`2026.11.0`); changelog generated from Conventional Commits (release-please); release notes for learners on a `/changes` page.

### 8.2 Rollout and rollback
- Feature flags for incomplete features; progressive exposure for risky front-end changes (CloudFront continuous deployment).
- **Rollback** in < 15 min: re-deploy previous artifact (kept 30 days); Lambda published versions + alias switch; S3 object versioning on the site bucket; DynamoDB changes are **expand → migrate → contract** only, so the previous code always works with the current data.

### 8.3 Backups and disaster recovery
| Asset | Method | RPO | RTO |
|---|---|---|---|
| Code, content, infra | GitHub (+ local clone) | 0 | 1 h (redeploy) |
| DynamoDB | Scheduled export to S3 (or PITR if its small cost is accepted — decision in an ADR) | 24 h | 2 h |
| Cognito users | Re-creatable by email sign-in; export of user list weekly | 7 d | 4 h |
| Terraform state | S3 versioning (exists in bootstrap) | 0 | 30 min |
Restore drill monthly in staging.

### 8.4 SLOs and error budgets
| SLI | SLO (30 days) |
|---|---|
| Static page availability (CloudFront 2xx/3xx) | 99.9 % |
| API success rate (non-4xx) | 99.5 % |
| API latency p95 (warm) | ≤ 300 ms |
| Sign-in success (OTP delivered and accepted) | 99 % |
Error budget policy: when a budget is spent, feature work pauses for reliability work until it recovers.

### 8.5 Monitoring, incidents, postmortems
Alarms (≤ 10 free): API 5xx, Lambda errors/throttles, DynamoDB throttles, CloudFront 5xx rate, Cognito failures, Budgets. Synthetic checks every 30 min (scheduled workflow). Incident runbooks in `docs/runbooks/` (site down, API errors, sign-in failing, cost alarm, credential leak, content error reported). Blameless postmortem within 5 days for any SLO breach or data issue: timeline, impact, root causes, action items with owners.

## 9. Metrics
| Metric | Source | Target |
|---|---|---|
| DORA: deployment frequency | deploy workflow runs | on demand (≥ weekly) |
| DORA: lead time for changes | PR open → prod | < 1 day |
| DORA: change failure rate | rollbacks / hotfixes per deploy | < 15 % |
| DORA: time to restore | incident timeline | < 1 h |
| CI health | median duration, flake rate | fast lane < 6 min, flakes < 2 % |
| Quality | escaped defects per release, content-error reports | trending down |
| Security | open vulns by severity, mean time to fix | 0 Critical/High open |

## 10. Checklists

### 10.1 PR checklist (in the PR template)
- [ ] Linked issue and acceptance criteria met
- [ ] Failing test first for a bug; tests at the right layers
- [ ] Screenshots (light/dark, mobile) for UI; axe clean
- [ ] Input validation, authZ by `sub`, no secrets, no new `innerHTML`
- [ ] Sanskrit content: sources cited; checkers pass; reviewer agent run
- [ ] Docs/ADR/PROGRESS updated; rollback note

### 10.2 Release checklist
- [ ] All required checks green on the release commit; staging E2E + ZAP baseline green
- [ ] Changelog and learner notes; feature flags reviewed
- [ ] Migrations expand-only; rollback artifact available
- [ ] Owner approval in the `prod` environment
- [ ] Post-deploy smoke + synthetic green for 30 min

### 10.3 Launch checklist
- [ ] P1–P7 exit criteria met (ROADMAP)
- [ ] Threat model current; pentest High/Critical fixed; ASVS L2 evidence
- [ ] SLO dashboards + alarms tested; runbooks written; backup restore drilled
- [ ] Privacy policy matches data inventory; licences and notices
- [ ] Performance budgets met on real devices; manual a11y audit passed
- [ ] SES production access; DKIM; domain and TLS; HSTS
- [ ] `security.txt`, `SECURITY.md`, private vulnerability reporting enabled

## 11. Current state vs target (2026-10-30)

✅ in place · 🔶 partial · ☐ missing

| Area | Item | State | Notes |
|---|---|---|---|
| Repo | Branch protection, required checks | ☐ | `main` unprotected (API: 404) |
| Repo | LICENSE, SECURITY.md, CODEOWNERS, PR/issue templates | ☐ | |
| Repo | Dependabot, CodeQL, secret scanning + push protection | ☐ | public repo, all free |
| CI | Engine typecheck + tests | ✅ | 342 tests |
| CI | Site build, typecheck (tsc), CSP budget | ✅ | `astro check` missing (🔶) |
| CI | ESLint/Prettier | ☐ | |
| CI | axe (46 pages × 2 themes) | ✅ | violations reported as `::error` annotations |
| CI | Account e2e (stubbed Cognito, prod CSP) | ✅ | `accounts.cjs` + `accounts-edge.cjs` (review #5, #6, #18, deletion errors) + `integrity.cjs` (review #1, #9: retries, reloads, outbox); plain scripts → migrate to `@playwright/test` |
| CI | Derivation e2e | ✅ | rāma, ramā, gaurī, lakṣmī under the production CSP |
| CI | Cross-browser / mobile E2E, visual regression, Lighthouse, size budgets | ☐ | |
| CI | API ruff + strict mypy + pytest (moto) | ✅ | 35 tests incl. fault injection (lost response, failure before commit, concurrent change); Ubuntu and Windows |
| CI | Contract tests / Schemathesis | ☐ | `openapi.yaml` planned |
| CI | Content checks (sūtras, quotes) | 🔶 | run locally only; vendor dataset extract |
| CI | Exercise checker | ✅ | |
| CI | Terraform validate; PR plan | ✅ | pipefail on every step, Lambda built before plan (review #16, #17); `rewrite.test.mjs` for the CloudFront function |
| CI | Workflow policy (`scripts/check-workflows.mjs` W1–W6) | ✅ | pipefail everywhere, permissions declared, Lambda before plan, deploy gated on green ci; actionlint/shellcheck still ☐ (P2) |
| CI | IaC scanning, policy-as-code, Access Analyzer | 🔶 | policy-as-code ✅ (`infra/terraform/tests/test_iam_policies.py`); Checkov/Trivy and Access Analyzer ☐ (Access Analyzer needs AWS credentials: P4) |
| CI | SAST/SCA/secrets/SBOM/provenance | ☐ | |
| CI | Actions pinned by SHA, minimal permissions | 🔶 | `permissions: contents: read` at top; actions on tags |
| CD | Staging environment | ☐ | |
| CD | Build-once promotion, approvals | 🔶 | deploy runs only after a green ci run on main and deploys that commit; still rebuilds (build-once ☐); approvals = `prod` environment reviewers (owner) |
| CD | WASM build (vidyut) | ✅ | cached composite action |
| Security | Threat model, ASVS mapping, pentest | ☐ | |
| Security | Review findings #1–#19 | 🔶 | all 19 + P3s fixed (exit review by a fresh agent pending) — PROGRESS §10 |
| Ops | Alarms, Budgets | 🔶 | in Terraform, never deployed |
| Ops | SLOs, synthetic checks, runbooks, backups/DR | ☐ | |
| UAT | Personas, scenarios, beta | ☐ | |
| Content | Reviewer agent per module | ✅ | done for every module so far |
| Content | Named human Sanskrit reviewer | ☐ | owner to nominate |

## 12. References (public)
- Microsoft Security Development Lifecycle — https://www.microsoft.com/en-us/securityengineering/sdl
- Google engineering practices (code review) — https://google.github.io/eng-practices/
- Google SRE books (SLOs, error budgets, postmortems) — https://sre.google/books/
- OWASP ASVS — https://owasp.org/www-project-application-security-verification-standard/
- OWASP Web Security Testing Guide — https://owasp.org/www-project-web-security-testing-guide/
- OWASP API Security Top 10 — https://owasp.org/API-Security/
- NIST SSDF (SP 800-218) — https://csrc.nist.gov/pubs/sp/800/218/final
- SLSA — https://slsa.dev/
- OpenSSF Scorecard — https://securityscorecards.dev/
- DORA research — https://dora.dev/
- AWS Well-Architected, Security Pillar — https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html
- WCAG 2.2 — https://www.w3.org/TR/WCAG22/
