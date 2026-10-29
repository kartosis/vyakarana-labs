# PROGRESS — Sanskrit Grammar Web App (working name: *Vyākaraṇa*)

> **Single source of truth for resuming work.** Any session (human or Claude) must read this file first,
> continue at **▶ NEXT ACTION**, and update this file + push after every completed step.

---

## 0. Resume protocol (do this first, every session)

1. Read memory file `/areas/sanskrit-grammar-app.md` → user's answered decisions.
2. Attach repo: `add_repo(owner="kartosis", repo="vyakarana-labs", access="push")` → clone → `register_repo_root`.
3. Read `docs/PROGRESS.md` (this file) and `CLAUDE.md`.
4. Jump to **▶ NEXT ACTION**. Do **not** re-ask answered questions (§2). Do **not** redo research (§4).
5. After each finished step: tick §6 checklist → append to §9 log → `scripts/checkpoint.sh "<msg>"` (commit + push).
6. When a user answers questions: write answers to §2 **and** to the memory file in the same turn.

---

## 1. Status snapshot

| Field | Value |
|---|---|
| **Phase** | M3 complete + CI green (incl. e2e) — awaiting user AWS bootstrap; **M4 Ac-sandhi in progress** (engine done) |
| **Rounds answered** | 4 / 4 ✅ |
| **Repo** | `kartosis/vyakarana-labs` — **attached, push verified 2026-10-29**; working copy `/home/claude/vyakarana-labs` |
| **Last updated** | 2026-10-29 |

### ▶ NEXT ACTION
- ✅ pnpm monorepo root + `@vl/engine` (lipi: IAST/Deva/SLP1/HK; varṇa: Śivasūtras, 1.1.71 pratyāhāra incl. ṇ ambiguity, savarṇa 1.1.9–10, guṇa/vṛddhi, SK articulation table) — 81 Vitest tests green.
- ✅ Astro 7 web app builds (44 pages): tokens/layers (Manuscript), shell, header (script switch deva/both/iast + theme), CourseRail, SutraFolio, Voice (Bhāṣya/Darśana sidenotes), SutraRef, SoundGrid, Practice gate; islands ShivaBoard, SavarnaChart, LipiPad, Steps; pages home/course/lesson/sutra/sutras/tools×3/signin/sources/about/privacy/404; 9 lessons (primer 3 + Saṃjñā LSK 1–14 in 6).
- ✅ Visual QA (Playwright: desktop/mobile, light/dark, script modes) + fixes (script switch layout, step labels); **axe: 0 violations** on 11 pages × 2 themes (WCAG 2.2 AA tags).
- ✅ **M2 code**: Terraform `bootstrap/` (state bucket, GitHub OIDC, plan + deploy roles; deploy IAM scoped to `vl-*`), `modules/site` (S3+OAC, CloudFront, ES5 rewrite fn tested, strict CSP from build hashes, 403→/404.html only, 2-phase ACM), `modules/guardrails` (Budgets $0.01 alert, SNS), `envs/prod`; workflows `ci.yml`, `deploy.yml` (dormant until repo vars exist); `scripts/csp-hashes.mjs` (+ --merge previous deploy); `docs/DEPLOY.md` (PowerShell), `README.md`.
  - Verified here: HCL parses (python-hcl2); CSP tested in Chromium (0 violations, islands hydrate, 1121/1783 chars). **Not verifiable here** (terraform/Go downloads blocked): `terraform validate`/`fmt` → runs in CI and on user's PC.
- ✅ CI on GitHub green (engine, build, CSP, terraform validate ×2).
- ✅ **M3 API** `services/api` (Python 3.13, Powertools LambdaFunctionUrlResolver): Cognito access-token verify (X-VL-Auth, token_use/client_id/iss), token-handler cookie (`/auth/session|refresh|logout`, HttpOnly SameSite=Strict Path=/api/v1/auth), `/me` GET/PATCH/DELETE (+Cognito AdminDeleteUser), `/me/export`, `/progress`, `/progress/merge`, `/sessions` (plausibility 422), `/reviews/due` (LSI1), `/reviews` (py-fsrs 6), `/leaderboard/{week|current}` (GSI1, opt-out sparse). Lazy profile creation (no PostConfirmation Lambda). Never 403 (CloudFront maps 403→404 page). 22 pytest (moto) green; ruff clean; `build.sh` → 8.7 MB arm64 zip.
- ✅ M3 infra modules `data`, `email` (SES v2 identity + Cognito send policy + DKIM outputs), `auth` (Cognito ESSENTIALS, sign_in_policy EMAIL_OTP+PASSWORD, public client USER_AUTH+REFRESH, 60m/30d tokens, admin group), `api` (Lambda arm64 py3.13, Function URL AWS_IAM, OAC lambda, 2 CloudFront permissions, IAM least-privilege, 7d logs, 3 alarms → SNS); prod toggles `ses_domain` → `accounts_enabled` (validated); deploy builds API zip, writes `/config.json` from `web_config` output. terraform fmt matched (no CI warning).
- ✅ M3 terraform validated in CI (Cognito ESSENTIALS, sesv2, Function URL OAC all accepted by provider ~>6).
- ✅ M3 web: `lib/config|auth|api.ts` (Cognito fetch, sessionStorage access token + localStorage flag, OAC body hash), islands SignIn, PracticeSession (shuffle, timing, SLP1 grading, pass 60%), ReviewSession (FSRS ratings), Dashboard (stats, lessons, settings PATCH, export, sign out, delete via <dialog>), Leaderboard; pages /signin /me /review /leaderboard; header "Your progress"; **72 exercises + 39 cards** in `data/exercises/**` (zod-validated collection). 47 pages build.
- ✅ Browser e2e with stubbed Cognito/API under strict CSP: 11/11 pass (scratch script; to be moved into repo CI).
- ✅ e2e + axe in CI (`apps/web/e2e/a11y.cjs`, `accounts.cjs`) — CI run 40954206159 all green. DEPLOY.md §7 accounts (SES DKIM → prod access → `accounts_enabled` → admin group).
- ✅ M4 engine: `packages/engine/src/sandhi.ts` `vowelSandhi(first, second, {padanta, pragrhya})` → {result, alternatives, steps[{sutra, form, note}], untouched}; order 1.1.11/6.1.125 → 6.1.109 → 6.1.101 → 6.1.88 → 6.1.87 (+1.1.50/1.1.51) → 6.1.77 → 6.1.78 (+8.3.19 alt). 103 engine tests green.
- ✅ (a) `data/sutras/ac-sandhi.yaml` (13 sūtras) + Pramāṇa notes (6.1 paginated, 6.1.125 printed without नित्यम्); (b) `/tools/sandhi/` (`islands/SandhiPad.tsx`: two words, padānta/pragṛhya options, examples, junction line, "Which rule applies?" via engine `sandhiChecks`, derivation; `?a=&b=` share URL); engine `junction` + `sandhiChecks` (119 tests). Build 62 pages. Mobile CSS fixes applied, not yet re-screenshotted.
- ✅ **Resumed 2026-10-29 (S2)**: sūtra data now generated from the ashtadhyayi.com dataset — `scripts/import-sutras.py` fills deva/pada/anuvṛtti/adhikāra/lsk/sk/vṛtti (hand fields: id, kind, meaning, note); `scripts/check-sutras.py` + `scripts/check-sources.py` re-verify sūtras and quotes. samjna.yaml = LSK 1–14 (+1.1.10 SK 13, 1.1.68); ac-sandhi.yaml = **all LSK 15–61 (47)**; core.yaml = 16 cited paribhāṣā/adhikāra. 18 new verified quotes (Kāśikā, Mahābhāṣya incl. 1.1.1 maṅgala, SK saṃhitā verse, VP 1.73, 2.58, 2.104). Savarṇa lesson corrected (Kāśikā four efforts vs LSK five; 1.1.10 not in LSK); samyoga-pada lesson gains 1.4.109 saṃhitā (LSK 12). Sources page credits dataset. Folio shows adhikāra, SK, note, folds long vṛttis. 104 pages build.
- ✅ **M4 Ac-sandhi content (S2)**: engine v2 (`Alternative{form,sutra,varttika,note}`; 6.1.95 om; 6.1.127/6.1.128 unjoined; vārttika on 6.1.101; 8.4.47+8.4.53 doubling; `compound` option kills Śākalya forms; generalized pragṛhya 1.1.11/14/15) — 143 engine tests from LSK/Kāśikā examples. SandhiPad v2 (compound option, structured alternatives, upasarga/go cautions, initial props). **6 lessons** `ac-sandhi/{yan,ayadi,guna,vrddhi,dirgha,pragrhya}` covering all LSK 15–61 with verified examples, Steps derivations, Bhāṣya+Darśana voices (new verified VP 2.238, 2.188, 1.77, 2.38). **65 exercises + 39 cards** in `data/exercises/ac-sandhi/`, all sandhi answers machine-checked by `packages/engine/test/exercises.test.ts` (MANUAL list for go/suffix/8.4.46/anusvāra). Module opened. 110 pages build.
- ✅ Design polish (home path meta + tools grid, Śivasūtra board on phones, prose-list scoping, retitled lessons), web `typecheck` in CI, axe 33 pages × 2 themes = 0, account e2e 11/11, CI green.
- ✅ **Independent review** (separate agent, checked against the dataset): 18 findings, all fixed — Steps forms (kṛṣṇarddhiḥ, pra), apratyaya = "what is prescribed" (LSK), Kāśikā 6.1.78 examples, **na samāse only bars 6.1.127; 6.1.128 holds in compounds (SK: saptaṛṣīṇām)** (engine + lessons + cards), VP 2.104 = "seem to become a different word" (moved to guṇa lesson with śveto dhāvati), VP 2.58 = two compound analyses, **6.1.95 beats 6.1.101** (table + engine order), pr12 distractor, tapara note on 1.1.1, vārttika homes (śakandhvādi → 6.1.94; saṃpuṃkānām → 8.3.5; yaṇaḥ pratiṣedhaḥ → 8.2.23), VP 1.73 numbering note, 1.1.52 = substitute, āṅ senses, ellipsis, "never savarṇa". New VP 2.10 quote (ayādi lesson).
- ✅ Hal-sandhi (LSK 62–102, 41) and Visarga-sandhi (LSK 103–114, 12) sūtra data generated with hand meanings; new kind `niṣedha`; sūtra pages show "taught in / cited in / in preparation". 159 pages.
- **NEXT**: M5a Hal-sandhi engine (ścutva 8.4.40/44, ṣṭutva 8.4.41–43, jaśtva 8.2.39, anunāsika 8.4.45, 8.4.60 tor li, 8.4.55 khari ca, 8.4.62, 8.4.63, anusvāra 8.3.23/24, 8.4.58–59, tuk 6.1.73/76 …) with sūtra traces + tests from LSK examples → lessons (≈5) → exercises → open module. Then Visarga-sandhi. Then vidyut WASM.
- (history) ⏸ Paused by user 2026-10-29 mid-M4. Items 1–2 below are now done:
  1. **Fix Saṃjñā LSK numbers** (verified from ashtadhyayi.com data, §4.4): LSK 11 = **1.1.69** (we had 12), LSK 12 = **1.4.109 परः सन्निकर्षः संहिता** (missing — add to samjna.yaml + samyoga-pada lesson), **1.1.10 is not in LSK** (lsk null; savarna lesson must say LSK omits it, SK has it). Fill verified vṛttis for LSK 4, 8, 9, 11, 12. Update lskRange of savarna (10–11) and samyoga-pada (12–14) lessons + any exercises citing LSK numbers.
  2. Set Ac-sandhi `lsk` numbers from the data (15 = 6.1.77 … 61 = 6.1.128; list in §4.4) with lskVerified true, and add verified LSK vṛttis.
  3. Then (c) lessons, (d) exercises, (e) open module, as below.
- **NEXT (M4 content)**: (a) `data/sutras/ac-sandhi.yaml` (6.1.72, 6.1.77, 6.1.78, 6.1.84, 1.1.1, 1.1.2, 6.1.87, 6.1.88, 1.1.50, 1.1.51, 6.1.101, 6.1.109, 8.3.19, 1.1.11, 6.1.125; lsk null) → (b) `/tools/sandhi/` playground island (SandhiPad) → (c) 3 Ac-sandhi lessons (yaṇ & ayādi; guṇa/vṛddhi; dīrgha, pūrvarūpa, pragṛhya) → (d) exercises → (e) course.yaml ac-sandhi open → build, axe, checkpoint. Then vidyut WASM (CI wasm-pack) for prakriyā stepper.
- Checkpoint after each bullet.

---

## 2. User decisions (answered — do not re-ask)

### Round 1 — Platform (2026-10-29)
| # | Question | Answer |
|---|---|---|
| 1.1 | Cloud stack | **AWS serverless + Terraform** — CloudFront/S3, Cognito, API Gateway (HTTP API, JWT authorizer) + Lambda, DynamoDB, SES, GitHub Actions OIDC |
| 1.2 | Backend language | **Python API**; grammar engine in **TypeScript, browser-only** (trade-off accepted: server stores client-reported scores; can port key validators to Python later) |
| 1.3 | Sign-in methods | **Email one-time code only** (passwordless) |
| 1.4 | Guest access | **Lessons open to all; exercises require an account** |

### Round 2 — Teaching approach (2026-10-29)
| # | Question | Answer |
|---|---|---|
| 2.1 | GitHub repo name | **`kartosis/vyakarana-labs`** (user typed custom name) |
| 2.2 | Script display | **Devanagari primary + IAST toggle** (also a user setting) |
| 2.3 | Curriculum order | **Laghusiddhāntakaumudī (Varadarāja) order**: Saṃjñā → Paribhāṣā → Ac/Hal/Visarga sandhi → Ajanta/Halanta subanta (puṃ/strī/napuṃsaka) → Avyaya → Tiṅanta (bhvādi…curādi, ṇijanta, sannanta…) → Kṛdanta → Kāraka · Samāsa · Taddhita · Strīpratyaya. Every rule cites its sūtra + Pramāṇa link. |
| 2.4 | v1 interactive tools | **All four**: Prakriyā stepper · Sandhi playground · Form generators (declension/conjugation) · Spaced-repetition drills (FSRS) |
| — | *Default (not asked)* | Learners = English speakers new to Devanagari **and** Devanagari readers → optional **Varṇamālā primer** before LSK Saṃjñā-prakaraṇa |
### Round 3 — Tracking & community (2026-10-29)
| # | Question | Answer |
|---|---|---|
| 3.1 | Tracking depth | **Learning data + cookieless privacy-first page analytics** (no consent banner) |
| 3.2 | Motivation | **Streaks & daily goal · Public leaderboard (opt-out/pseudonym) · Completion certificates** (shareable URL + verification ID). **No XP/badges** → leaderboard ranks by reviews/lessons completed, not XP |
| 3.3 | Community | **Per-lesson discussion · Private notes & highlights · Report-an-error** on every sūtra/form/lesson |
| 3.4 | Patañjali/Bhartṛhari depth | **Bhāṣya + Darśana sidebars in every lesson + separate Darśana (philosophy) track** |
| — | *Default (not asked)* | Role-based **admin dashboard**: users, progress aggregates, discussion moderation, error-report queue |
### Round 4 — Brand & launch (2026-10-29)
| # | Question | Answer |
|---|---|---|
| 4.1 | Domain | **Subdomain of identifyragas.com** (DNS on user's Cloudflare). Default host: `sanskrit.identifyragas.com` (Terraform var; changeable) |
| 4.2 | AWS budget | **$0 — free tier only** → see §4.3 consequences (Function URL instead of API Gateway, DynamoDB provisioned ≤ 25 RCU/WCU, no WAF/KMS CMK/Secrets Manager/Route 53) |
| 4.3 | Visual direction | **Manuscript**: paper `#F6EFE2`, ink `#1E1A16`, vermilion `#B3361F`, saffron `#D98E1F` (convert to oklch tokens), serif Devanagari, palm-leaf sūtra folios, Bhāṣya/Darśana side panels; light + dark |
| 4.4 | Public name | **Vyākaraṇa Labs** |

---

## 3. Pending questions (pre-designed — ask these, don't redesign)

### Post-Round-4 engineering decision (2026-10-29)
| # | Question | Answer |
|---|---|---|
| 5.1 | Grammar engine | **Hybrid**: own **TS** for teaching pieces (Śivasūtra/pratyāhāra expansion, savarṇa, step animations, transliteration helpers) + **vidyut-prakriya via WASM** (TS wrapper) for Prakriyā stepper, form generators, sandhi validation |

*(all rounds answered — nothing pending)*

---

## 4. Research findings (done 2026-10-29 — do not redo)

### 4.1 indike.org / Pramāṇa (content references)
- **Nature**: catalogue + reader of Indian primary sources, **not tutorials**. Breadcrumb: Pramāṇa → Indian literature → Vedāṅga → Grammar.
- **`in.vedanga.vyakarana`**: 3,449 works (189 readable, ~7.6M words). Sections: Anyavyākaraṇa (other schools), Kāraka & samāsa tracts, Dhātu, Auktika, **Aṣṭādhyāyī**, Pāṇinīya Khilapāṭha, **Prakriyāgrantha**, **Vyākaraṇadarśana**, Prākpāṇinīya, Pāli, Prākṛta. Notable: Liṅgānuśāsanas (Hemacandra, Vāmana, Śākaṭāyana…), Kārakacakra, Bhaṭṭoji Dīkṣita, Nāgeśa, Kāśikā, Kātyāyana's vārttikas, Paspaśā.
- **`…astadhyayi`**: Pāṇini, c. 500–350 BCE, Gandhāra; 3,951 passages / 9,314 words; text from **GRETIL** (Aryendra Sharma's Kāśikā edition), licence **CC BY-NC-SA 4.0**; 8 adhyāyas × 4 pādas; 65 commentaries listed (Mahābhāṣya, Kāśikā, Bhāṣāvṛtti, Durghaṭavṛtti…); texts within: Śivasūtra, Pratyāhārasūtra; translations: Vasu (EN), Böhtlingk (DE).
- **URL scheme** (use for citation chips):
  - Sūtra: `https://indike.org/pramana/in.vedanga.vyakarana.astadhyayi.{a}.{p}.{s}` (e.g. `.1.1.1`)
  - Adhyāya: `…astadhyayi.{1-8}`
  - Commentaries: `…astadhyayi!mahabhasya`, `…!kasika`, `…!varttika`, `…!bhasavrtti`, `…!durghatavrtti`
  - Śivasūtra: `…astadhyayi.sivasutra`; Pratyāhārasūtra: `…astadhyayi.pratyaharasutra`
  - Translations: `…astadhyayi~en-vasu`, `…~de-bohtlingk`
  - API docs: `https://indike.org/pramana/about/api` (read by path, search, cite, export, stats, read-only SQL); licences: `/about#sources`
- **Chapter page format**: IAST only (no Devanagari, no translation), hyphenated compounds, `||` terminator, e.g. 1.1.1 `vṛddhir ād-aic ||`, 1.1.2 `adeṅ guṇaḥ ||`, 1.1.3 `iko guṇa-vṛddhī ||`. Pāda sizes in Adhyāya 1: 1.1=45, 1.2=73, 1.3=93, 1.4=110.
- **`…linganusasana-hemacandra`**: Hemacandra (1088–1173 CE), 131 passages, 8 sections: puṃliṅga 16, strīliṅga 34, napuṃsaka 24, puṃstrī 12, puṃnapuṃsaka 30, strīklība 6+6, svatantra/paraliṅga 3; method = gender by stem-final, mnemonic lists, verse rules + prose gloss; e.g. *nalastutattasaṃyuktakaruyāntaṃ napuṃsakam*. Source scan: *Haim Liṅgānuśāsanam*, ed. Chunilal Panalal, 1905 (public domain).
- **`…darsana`**: catalogue of 178 works (24 readable): Vākyapadīya (Bhartṛhari, c. 480 CE), Sphoṭasiddhi (Maṇḍana Miśra, 710), Vaiyākaraṇabhūṣaṇasāra (Kauṇḍabhaṭṭa, 1635), Śabdakaustubha (Bhaṭṭoji), Sphoṭavāda (Nāgeśa), Pāṇinidarśana (Sāyaṇa Mādhava). No explanatory prose.
- **Content decision**: original pedagogy + own translations; sūtra text keyed from public-domain originals (Devanagari + IAST) to avoid NC lock-in; every rule → citation chip deep-linking to Pramāṇa. Patañjali content from **Paspaśāhnika**; Bhartṛhari from **Vākyapadīya, Brahmakāṇḍa** (cite by kāṇḍa.verse).

### 4.2 Design guidelines (adopt all)
- **web.dev AI-agent UX**: semantic `<button>`/`<a>` (no div-buttons; if unavoidable `role`+`tabindex`); `<label for>` on every input; no transparent "ghost" overlays; `cursor:pointer` on actionables; interactive targets > 8 px² (use ≥ 24 px); stable layout (actions keep position); audit accessibility tree; **WebMCP** tools as progressive enhancement (origin trial).
- **utilitybend tokens**: 3 tiers `--p-*` primitives (oklch) → `--s-*` semantic → `--c-*` component (always with semantic fallback); components never use primitives; exceptions only with comment. `@layer tokens, atoms, molecules, organisms, pages`. `color-scheme: light dark` on `:root` + `<meta name="color-scheme">`; `light-dark()` only at semantic tier; dark mode also adjusts shadow opacity, image brightness, border contrast; `accent-color` from theme; style queries `@container style(--density: compact)` with `:where([data-density])` fallback; `<dialog>`/`popover` + `@starting-style` + `transition-behavior: allow-discrete`; speculation rules; `prefers-reduced-motion` (drop decoration, keep state changes); theme toggle = system default, works without JS; critical features need fallback ≤ 50 lines; Baseline target in CLAUDE.md.
- **Chrome visual-design guides**: contrast 4.5:1 text / 3:1 large + UI boundaries; never colour-only state; `forced-colors` fallbacks with system colours; tints via `color-mix(in oklab, …)` (≤ 30 % lightness shifts); `line-height` unitless; `rem` fonts; ≤ 80ch; no justify; `text-wrap: balance` (headings) / `pretty` (paragraphs) — never on `*`; `clamp()` fluid type; **`font-size-adjust: from-font`** for Devanagari/Latin mixing & fallbacks; `text-box: trim-both cap alphabetic` for badges/buttons; `::selection`, `accent-color`, `scrollbar-color` (no transitions on it); `:user-invalid`; `<select>` + `appearance: base-select`; gradients `in oklab`; masks for paper texture; `contrast-color()` with RCS fallback.
- Local copy of the Chrome guides was cloned to scratch (ephemeral) — re-clone if needed: `git clone --depth 1 https://github.com/GoogleChrome/modern-web-guidance` (public; works via git proxy).

### 4.3 Verified platform facts (2026-10-29 — drive the $0 design)
- **Cognito** ([pricing](https://aws.amazon.com/cognito/pricing/)): **Lite & Essentials = 10,000 MAU free, does not expire**; **passwordless email OTP + passkeys need Essentials** (Lite has neither) → use **Essentials**. Emails go through **SES, billed separately** (≈ $0.10 / 1,000) → only non-zero line item; minimise with 30-day refresh tokens.
- **API Gateway** free tier = **12 months, new customers only; none on the post-July-2025 Free plan**; HTTP API then $1.00/M ([AWS Builder: $0 API on Lambda](https://builder.aws.com/content/3KlRhfU9w7K79H2be1uFAjiX62N/run-a-real-api-for-dollar0-a-month-on-lambdas-always-free-tier)) → **replace with Lambda Function URL behind CloudFront (`/api/*`)**.
- **Lambda** always free: 1M req + 400k GB-s/mo. **DynamoDB** always free: 25 RCU + 25 WCU + 25 GB — **provisioned mode only** (on-demand not covered). **CloudWatch**: 10 alarm metrics free. **SNS**: 1,000 email notifications free.
- **CloudFront OAC → Lambda Function URL** ([docs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)): Function URL `AuthType=AWS_IAM`; OAC signing `always`; **POST/PUT must send `x-amz-content-sha256` = hex SHA-256 of body** (browser: `crypto.subtle.digest`); OAC overwrites `Authorization` → send Cognito JWT in a custom header (e.g. `X-VL-Auth`) forwarded by an origin request policy; Lambda verifies JWT (JWKS cached). Same-origin `/api/*` → **no CORS**.
- **vidyut-prakriya** ([docs.rs](https://docs.rs/vidyut-prakriya), [GitHub](https://github.com/ambuda-org/vidyut), Arun Prasad / Ambuda): **MIT**; ~2,000 Aṣṭādhyāyī rules; excellent subanta, tiṅanta, kṛdanta, taddhitānta; moderate samāsa; weak accent; **every derivation step carries its sūtra code** (e.g. `1.3.1`, `7.3.84`) with intermediate terms in **SLP1**; **compiles to WASM with a `wasm` bindings module**; ~50k words/s. Sibling crates: vidyut-lipi (transliteration, already has WASM build), vidyut-sandhi, vidyut-cheda, vidyut-kosha. → Candidate derivation core for Prakriyā stepper + form generators (user decided "TS engine in browser"; WASM + TS wrapper keeps that contract). Data licence for its Dhātupāṭha not confirmed — check `vidyut-data` before bundling.

### 4.4 Source checks for content (2026-10-29)
- **Pramāṇa coverage gap**: pāda **1.1 lists only 1.1.1–1.1.45** (standard 75); `…astadhyayi.1.1.71` → client error. Adhyāya 1 other pādas: 1.2=73, 1.3=93, 1.4=110 (complete). → citation chip = sūtra URL if available, else **pāda URL** (`…astadhyayi.1.1`); always also link our `/sutra/a.p.s/`. Manifest: `data/pramana.json`.
- **LSK numbering verified** via sanskritdocuments.org learning_tools pages (LSK vṛtti shown per sūtra; note that site's 1.1.x refs are sometimes off by one): LSK **1 = 1.3.3** हलन्त्यम् ("उपदेशेऽन्त्यं हलित्स्यात्। उपदेश आद्योच्चारणम्। सूत्रेष्वदृष्टं पदं सूत्रान्तरादनुवर्तनीयं सर्वत्र॥"), **2 = 1.1.60** अदर्शनं लोपः ("प्रसक्तस्यादर्शनं लोपसंज्ञं स्यात्।"), **3 = 1.3.9** तस्य लोपः ("तस्येतो लोपः स्यात्। णादयोऽणाद्यर्थाः।"), **5 = 1.2.27** ऊकालोऽज्झ्रस्वदीर्घप्लुतः ("उश्च ऊश्च ऊ३श्च वः; वां कालो यस्य सोऽच् क्रमाद् ह्रस्वदीर्घप्लुतसंज्ञः स्यात्। स प्रत्येकमुदात्तादि भेदेन त्रिधा।"), **10 = 1.1.9** तुल्यास्यप्रयत्नं सवर्णम् ("ताल्वादिस्थानमाभ्यन्तरप्रयत्नश्चेत्येतद्द्वयं यस्य येन तुल्यं तन्मिथः सवर्णसंज्ञं स्यात्।" + sthāna/prayatna lines), **13 = 1.1.7** हलोऽनन्तराः संयोगः ("अज्भिरव्यवहिता हलः संयोगसंज्ञाः स्युः॥"), **14 = 1.4.14** सुप्तिङन्तं पदम् ("सुबन्तं तिङन्तं च पदसंज्ञं स्यात्॥"). Inferred (unverified): 4 = 1.1.71, 6–8 = 1.2.29–31, 9 = 1.1.8, 11 = 1.1.10, 12 = 1.1.69. ⇒ **LSK Saṃjñā-prakaraṇa = 14 sūtras**; 1.1.1/1.1.2/1.1.70 arrive later in Ac-sandhi.
- **LSK prayatna model**: four ābhyantara efforts — spṛṣṭa (sparśa), īṣatspṛṣṭa (antaḥstha), **vivṛta (ūṣman + vowels)**, saṃvṛta (short a in use). (SK says īṣadvivṛta for ūṣman.) ⇒ under LSK, i/ś and a/h share place+effort — exactly what **1.1.10 nājjhalau** blocks (Kāśikā: *dadhi śītam*, *daṇḍa-hastaḥ*).
- sanskritdocuments `~sanskrit/` paths are robots-disallowed; the non-tilde `learning_tools/ashtadhyayi/vyakhya/{a}/{a.p.s}.htm` paths are fetchable when surfaced by search. **6.x vyakhya pages (6.1.87, 6.1.101) now robots-disallowed** — don't retry.
- **Ac-sandhi (learnsanskrit.org/vyakarana/sandhi/ac-sandhi, checked 2026-10-29)**: rule order 6.1.77, 6.1.72, 6.1.78, 6.1.84 (adhikāra), 1.1.2, 6.1.87, 1.1.1, 6.1.88, 1.1.50, 1.1.51, 6.1.101. Examples: द्रौपदी इन्द्रम् → द्रौपदीन्द्रम् (not *द्रौपद्यिन्द्रम्); ने+अ → नय, भो+अ → भव; सीता इन्द्रम् → सीतेन्द्रम्; सीता ऋच्छति → सीतर्च्छति. Page does not cover 8.3.19, 6.1.109, pragṛhya.
- **ashtadhyayi.com data (github.com/ashtadhyayi-com/data, cloned to /home/claude/ashtadhyayi-com/data, 1.9 GB shallow)** — README: "free to use this data in your own projects provided that appropriate credits are mentioned" → credit on /sources. `sutraani/data.txt` gives per sūtra `lskn` (LSK no.), `pc` padaccheda, `an` anuvṛtti, `ad` adhikāra; `laghukaumudi.txt` LSK vṛtti; `kashika.txt`; `bhashya.txt` Mahābhāṣya; also `mahabhashyam/`, `vakyapadeeyam/`, `shabda/`, `dhatu/`, `linganushasanam/`.
  - **LSK 1–14 per this data**: 1.3.3, 1.1.60, 1.3.9, 1.1.71, 1.2.27, 1.2.29, 1.2.30, 1.2.31, 1.1.8, 1.1.9, **1.1.69 (11)**, **1.4.109 (12)**, 1.1.7, 1.4.14. **1.1.10 nājjhalau: lskn 0** (SK 13 only).
  - **LSK Ac-sandhi (ch 2) = 15–61**: 15 6.1.77, 16 1.1.66, 17 1.1.50, 18 8.4.47, 19 8.4.53, 20 8.2.23, 21 1.1.52, 22 6.1.78, 23 1.3.10, 24 6.1.79, 25 1.1.2, 26 1.1.70, 27 6.1.87, 28 1.3.2, 29 1.1.51, 30 8.3.19, 31 8.2.1, 32 1.1.1, 33 6.1.88, 34 6.1.89, 35 1.4.59, 36 1.3.1, 37 6.1.91, 38 6.1.94, 39 1.1.64, 40 6.1.95, 41 6.1.85, 42 6.1.101, 43 6.1.109, 44 6.1.122, 45 1.1.55, 46 1.1.53, 47 6.1.123, 48 6.1.124, 49 8.2.84, 50 6.1.125, 51 1.1.11, 52 1.1.12, 53 1.4.57, 54 1.4.58, 55 1.1.14, 56 1.1.15, 57 1.1.16, 58 8.3.33, 59 6.1.127, 60 8.4.46, 61 6.1.128. (1.1.49, 1.1.67=71, 6.1.72, 6.1.84 not in LSK ch 2.)
  - LSK vṛtti examples (usable, verified): 15 सुधी उपास्य → सुद्ध्युपास्यः (with 8.4.47/8.4.53, vārttika यणः प्रतिषेधो वाच्यः on 1.1.52), मद्ध्वरिः, धात्रंशः, लाकृतिः; 23 हरये, विष्णवे, नायकः, पावकः; 27 उपेन्द्रः, गङ्गोदकम्; 29 कृष्णर्द्धिः, तवल्कारः; 31 हर इह/हरयिह, विष्ण इह/विष्णविह; 33 कृष्णैकत्वम्, गङ्गौघः, देवैश्वर्यम्, कृष्णौत्कण्ठ्यम्; 42 दैत्यारिः, श्रीशः, विष्णूदयः, होतॄकारः; 43 हरेऽव, विष्णोऽव; 50 आगच्छ कृष्ण ३ अत्र गौश्चरति; 51 हरी एतौ, विष्णू इमौ, गङ्गे अमू.
  - **Edition variants**: this LSK 1.1.9 vṛtti has a **five-fold** ābhyantara prayatna (ईषद्विवृतमूष्मणाम्, विवृतं स्वराणाम्), unlike the four-fold reading verified earlier at sanskritdocuments → savarna lesson should say editions differ. LSK 5 here reads "वां काल इव कालो यस्य" (ours: "वां कालो यस्य").
  - **Mahābhāṣya maṅgala passage on 1.1.1 found** in `sutraani/bhashya.txt` ("माङ्गलिक आचार्यो महतः शास्त्रौघस्य मङ्गलार्थं वृद्धिशब्दमादितः प्रयुङ्क्ते ।") → can now be verified and used. Bhāṣya on 1.1.50 opens "स्थानेन्तरतमः किमुदाहरणम् ? इको यणचि। दध्यत्र। मध्वत्र।"; on 6.1.87 "खट्वेन्द्रः, मालेन्द्रः । खट्वोदकम्, मालोदकम्".
- **Next prakaraṇas (from dataset `lsk_chapter`)**: ch 3 Hal-sandhi = LSK 62–102 (41 sūtras), ch 4 Visarga-sandhi = LSK 103–114 (12), ch 5 Ajanta-puṃliṅga starts at LSK 115. Use `scripts/import-sutras.py` (add id/kind/meaning rows, run) for each new module file.
- **Not verified (excluded from site)**: Mahābhāṣya maṅgala passage on 1.1.1 (“माङ्गलिक आचार्यो…वृद्धिशब्दमादितः प्रयुङ्क्ते”), “so 'yam akṣarasamāmnāyaḥ”.

---

## 5. Architecture — **superseded by `docs/ARCHITECTURE.md` (2026-10-29)**; sketch below kept for history (API Gateway replaced by CloudFront → Lambda Function URL)

```
Browser (Astro SSG + TS islands; grammar engine in TS, client-side)
 ├─► CloudFront ─► S3 (static site, OAC)            [lessons public, SEO]
 ├─► Cognito user pool (Essentials: passwordless EMAIL_OTP; SES sender)  [verify tier/price]
 └─► API Gateway HTTP API (JWT authorizer = Cognito)
        └─► Lambda (Python 3.12/3.13; Powertools: logging/tracing/validation)
              ├─► DynamoDB single-table (PK/SK): USER#, PROGRESS#, SRS#, ATTEMPT#, EVENT#, REPORT#
              └─► SES (transactional email)
IaC: Terraform (remote state S3 + lock) · CI/CD: GitHub Actions + OIDC role · Obs: CloudWatch, X-Ray, Budgets alarms
```
- Guest reading progress → `localStorage`; merged into account on first sign-in.
- Exercises gated client-side + API rejects unauthenticated writes.

---

## 6. Phase checklist

- [x] **P0 Discovery** — Round 1 ✅ · Round 2 ✅ · Round 3 ✅ · Round 4 ✅
- [x] **P1 Architecture doc** — `docs/ARCHITECTURE.md`: context, containers, flow map, 7 service flows, data model, API, engine, IA/layout, content plan, IaC, CI/CD, $0 guardrails, user checklist, milestones M1–M7
- [ ] **P2 Repo scaffold** — monorepo (`apps/web`, `packages/engine`, `services/api`, `infra/`), lint/test/format, CI
- [ ] **P3 Design system** — tokens (3-tier), layers, typography (Devanagari + Latin), components
- [ ] **P4 Grammar engine (TS)** — transliteration (IAST↔Devanagari), Śivasūtra/pratyāhāra, sandhi, subanta, tiṅanta, prakriyā tracer + tests
- [ ] **P5 Content** — curriculum + lessons (MDX), sūtra dataset w/ Pramāṇa links, Bhāṣya/Darśana material
- [ ] **P6 Backend (Python Lambda)** — progress, attempts, SRS, profile, reports, admin
- [ ] **P7 Auth** — Cognito email OTP, token handling, guest→account merge
- [ ] **P8 Infra (Terraform)** — all AWS resources, environments (dev/prod)
- [ ] **P9 CI/CD** — GitHub Actions OIDC deploy, preview envs
- [ ] **P10 QA** — a11y (axe), Lighthouse, unit/e2e (Playwright), load sanity
- [ ] **P11 Launch** — domain, SES production access, monitoring, launch checklist

---

## 7. User-side setup (what Kartik must do)

| # | Item | When | Status |
|---|---|---|---|
| U1 | Create **empty** GitHub repo **`kartosis/vyakarana-labs`** (no README/licence) | now | ✅ |
| U1b | Grant the **Claude GitHub App** access to `vyakarana-labs` | now | ✅ |
| U2 | AWS account with MFA on root; IAM Identity Center admin user; **AWS Budgets** alert | before P8 | ☐ |
| U3 | Bootstrap Terraform state bucket (script provided) + GitHub OIDC role (Terraform provided) | P8 | ☐ |
| U4 | **SES**: verify domain (DKIM), request **production access** (sandbox only emails verified addresses) | P8 / P11 | ☐ |
| U5 | Cloudflare DNS for `identifyragas.com`: add ACM validation CNAME + `sanskrit` CNAME → CloudFront (**DNS-only / grey cloud**) | P8 / P11 | ☐ |
| U6 | GitHub repo secrets/vars: `AWS_ROLE_ARN`, `AWS_REGION` | P9 | ☐ |

---

## 8. Open risks / notes
- Python API + browser-only TS engine ⇒ server can't independently grade; mitigation: signed attempt payloads + plausibility checks, or port graders to Python later.
- Cognito passwordless email OTP needs the **Essentials** feature plan and SES email configuration — **verify current pricing/free tier before P8**.
- GRETIL text is CC BY-NC-SA — don't bulk-import; key sūtras from public-domain originals and link out.

---

## 9. Session log (append-only)

- **2026-10-29 · S1** — Read all 7 references (§4). Asked Round 1 (§2). User asked for persistent progress saving → created memory file `/areas/sanskrit-grammar-app.md` + this file + `CLAUDE.md` + `scripts/checkpoint.sh`. Next: Round 2 + repo name.
- **2026-10-29 · S1** — Round 2 answered (§2). Repo name `vyakarana-labs`; add_repo failed (repo not created yet). Next: Round 3, retry repo.
- **2026-10-29 · S1** — Round 3 answered (§2). User created repo; add_repo still denied (app lacks access) → asked user to grant Claude GitHub App access. Next: Round 4.
- **2026-10-29 · S1** — Round 4 answered (§2). Repo access fixed by user; first push OK. Verified Cognito/API GW/Function URL/vidyut facts (§4.3). Next: ARCHITECTURE.md.
- **2026-10-29 · S1** — Engine decision: hybrid TS + vidyut WASM (§2 5.1). Next: ARCHITECTURE.md.
- **2026-10-29 · S1** — Wrote `docs/ARCHITECTURE.md` (all 5 Mermaid diagrams render-checked with mmdc). Next: M1 scaffold.
- **2026-10-29 · S1** — M1: monorepo root + engine (lipi, varṇa) with 81 passing tests. Design plan: Manuscript = rubrication (vermilion for daṇḍa/sūtra no./rule refs only), haritāla saffron for highlights/corrections, malachite for success, pothi folios w/ double vermilion rules, pañcapāṭha lesson layout, hero = live Śivasūtra pratyāhāra builder; fonts Tiro Devanagari Sanskrit + Gentium Book Plus (@fontsource, self-hosted).
- **2026-10-29 · S1** — Verified LSK Saṃjñā order + vṛttis; found Pramāṇa gap (1.1.46–75 missing) → `data/pramana.json` + fallback rule.
- **2026-10-29 · S1** — Web app scaffolded and building (44 pages). Next: visual QA + fixes, then M2 infra.
- **2026-10-29 · S1** — Visual QA + axe clean. Next: M2 infra + CI/CD.
- **2026-10-29 · S1** — M2 infra + CI/CD written; CSP verified in browser. Waiting on user AWS bootstrap.
- **2026-10-29 · S1** — M3 API written + tested (22 tests). Found & fixed DynamoDB reserved-word bug via tests. Next: M3 infra modules.
- **2026-10-29 · S1** — M3 Terraform modules written and wired behind toggles. Next: web auth + practice.
- **2026-10-29 · S1** — M3 web done: sign-in, practice, reviews, dashboard, leaderboard; 72 exercises; e2e 11/11 under CSP.
- **2026-10-29 · S1** — e2e+axe CI job green; DEPLOY.md §7 accounts. M4 started: vowel-sandhi engine with sūtra traces (103 engine tests). Next: ac-sandhi sūtra data → sandhi playground → lessons.
- **2026-10-29 · S1** — M4: ac-sandhi sūtra data + /tools/sandhi/ playground (rule checks, derivation). Found ashtadhyayi.com data repo → LSK numbers verified; Saṃjñā 11/12 were wrong (fix on resume). **Paused by user.**
- **2026-10-29 · S2** — Resumed. Dataset-driven sūtra data + checkers; Saṃjñā fixes; engine v2; 6 Ac-sandhi lessons (LSK 15–61) + 65 checked exercises; module open.
- **2026-10-29 · S2** — Review agent: 18 findings fixed. Hal/visarga sūtra data in place. Next: hal-sandhi engine + lessons.
