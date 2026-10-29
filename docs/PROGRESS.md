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
| **Phase** | P0 — Discovery (setup questions) |
| **Rounds answered** | 3 / 4 |
| **Repo** | `kartosis/vyakarana-labs` — created by user 2026-10-29, but **Claude GitHub App has no access yet** (likely private repo not in app's repository list); local copy at `/home/claude/vyakarana-labs` |
| **Last updated** | 2026-10-29 |

### ▶ NEXT ACTION
- Retry `add_repo(kartosis, vyakarana-labs, push)`; on success: `git remote add origin`, push (`scripts/checkpoint.sh`).
- Ask **Round 4** (brand & launch) → record → write `docs/ARCHITECTURE.md`.
- Then write `docs/ARCHITECTURE.md` (flow map, service flow, system setup, layout) and get sign-off.

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
### Round 4 — Brand & launch *(pending)*

---

## 3. Pending questions (pre-designed — ask these, don't redesign)

### Round 4 — Brand & launch
- **Domain**: new domain user buys (Route 53 or Cloudflare) · subdomain of identifyragas.com · CloudFront default URL for now
- **Budget ceiling**: $0 free tier · ≤ $10/mo · ≤ $50/mo
- **Visual direction** (with previews): Manuscript — warm paper, ink, vermilion/saffron, Tiro Devanagari Sanskrit *(rec)* · Modern academic · Night library (dark-first, gold)
- **Site name**: Śabdānuśāsanam (Mahābhāṣya's opening *atha śabdānuśāsanam*) · Pāṇinīyam · Vyākaraṇa Pāṭhaśālā · other

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

---

## 5. Architecture (draft — finalize after Round 4 in `docs/ARCHITECTURE.md`)

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

- [ ] **P0 Discovery** — Round 1 ✅ · Round 2 ✅ · Round 3 ✅ · Round 4 ☐
- [ ] **P1 Architecture doc** — flow map, service flow, data model, API contract, layout/IA, wireframes → user sign-off
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
| U1b | Grant the **Claude GitHub App** access to `vyakarana-labs` (github.com/settings/installations → Claude → Configure → Repository access) | now | ☐ |
| U2 | AWS account with MFA on root; IAM Identity Center admin user; **AWS Budgets** alert | before P8 | ☐ |
| U3 | Bootstrap Terraform state bucket (script provided) + GitHub OIDC role (Terraform provided) | P8 | ☐ |
| U4 | **SES**: verify domain (DKIM), request **production access** (sandbox only emails verified addresses) | P8 / P11 | ☐ |
| U5 | Domain purchase + DNS (Route 53 hosted zone or Cloudflare) + ACM cert in **us-east-1** for CloudFront | P11 | ☐ |
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
