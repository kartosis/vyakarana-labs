# Vyākaraṇa Labs

**Learn Sanskrit grammar the way Pāṇini built it.** An interactive course that follows Varadarāja's
*Laghusiddhāntakaumudī* rule by rule, with Patañjali's *Mahābhāṣya* and Bhartṛhari's *Vākyapadīya*
set beside every sūtra, the way commentary surrounds the root text on a manuscript page.

- **Every rule cited exactly**: sūtra in Devanagari, word split, carried-over words, Varadarāja's gloss, plain-English meaning, and a link to the source on [Pramāṇa](https://indike.org/pramana/in.vedanga.vyakarana).
- **Three voices per lesson**: Pāṇini (the rule), Patañjali (why it is phrased so), Bhartṛhari (what a word is).
- **Interactive**: a live Śivasūtra pratyāhāra builder, a place-and-effort chart for savarṇa, derivation step-throughs, a transliteration pad, and a sandhi tool: for two vowels it tests every Ac-sandhi rule and shows which one wins and why; for consonants and visarga it runs the rules in the order the grammar prescribes and lists every correct optional form. Each runs the same tested grammar engine.
- **Course so far**: sounds and script, the Saṃjñā-prakaraṇa (LSK 1–14), and the three sandhi prakaraṇas complete: Ac-sandhi (LSK 15–61), Hal-sandhi (LSK 62–102) and Visarga-sandhi (LSK 103–114), 23 lessons with practice and spaced-repetition review.
- **Devanagari or IAST**: one key (`t`) switches between Devanagari, both scripts, or romanisation.

## Architecture

```
Browser ── CloudFront ──┬── /*      → S3 (static Astro site, OAC, strict CSP with build-time hashes)
                        └── /api/*  → Lambda Function URL (Python) → DynamoDB   [M3]
           Cognito (passwordless email code) → SES                              [M3]
Terraform (S3 state, native locking) · GitHub Actions + OIDC (no stored keys) · $0 budget guardrails
```

Full design (flow map, service sequences, data model, API, layout): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Progress and decisions log: [`docs/PROGRESS.md`](docs/PROGRESS.md). Deploying: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Repository

| Path | What |
|---|---|
| `apps/web` | Astro 7 site, Preact islands, MDX lessons, design tokens (`src/styles/tokens.css`) |
| `packages/engine` | TypeScript grammar engine: transliteration (IAST / Devanagari / SLP1 / Harvard-Kyoto), Śivasūtras, pratyāhāra (1.1.71), savarṇa (1.1.9–10), guṇa/vṛddhi, vowel sandhi with sūtra traces and optional forms (6.1.77–6.1.128, 8.3.19, 8.4.47), consonant sandhi (6.1.73–76, 8.2.39, 8.3.4–8.3.34, 8.4.40–8.4.65) applying the tripādī in numeric order and branching on every optional rule, and visarga sandhi (8.2.66–69, 6.1.113–114, 6.1.132, 6.3.111, 8.3.14–37). Vitest suite, including a check of every exercise answer |
| `data/` | Sūtras (YAML: hand-written meanings, source fields generated from the ashtadhyayi.com dataset), verified source quotations, course structure, exercises, Pramāṇa coverage manifest |
| `infra/terraform` | `bootstrap/` (state + OIDC roles), `modules/site`, `modules/guardrails`, `envs/prod` |
| `scripts/` | `csp-hashes.mjs` (strict CSP), `import-sutras.py` / `check-sutras.py` / `check-sources.py` (sūtra data and quotations against the [ashtadhyayi.com dataset](https://github.com/ashtadhyayi-com/data)), `checkpoint.sh` |
| `.github/workflows` | `ci.yml` (tests, build, validate, plan), `deploy.yml` (OIDC deploy) |

## Local development

```bash
pnpm install
pnpm --filter @vl/engine test     # grammar engine tests
pnpm dev                          # http://localhost:4321
pnpm build                        # static site in apps/web/dist
```

## Quality bar

- WCAG 2.2 AA: axe-core clean on every page type, light and dark; keyboard-operable tools; `forced-colors` support.
- Strict Content-Security-Policy: no `unsafe-inline`; inline scripts and styles are allowed by SHA-256 hash, recomputed on each deploy.
- Modern CSS: three-tier design tokens, cascade layers, `oklch` + `light-dark()`, container queries, `text-wrap`, `font-size-adjust`.
- Sources: every quoted passage is checked against a published text before it is shown (`data/quotes.yaml` records where); sūtra texts, word splits, LSK numbers and Varadarāja's vṛtti are re-checked by script against the ashtadhyayi.com dataset.

## Sources and licences

Primary texts are ancient and public domain. Lesson prose, translations and software are original to this
project. Sūtra texts, LSK data and commentary passages are taken, with credit, from the open
[ashtadhyayi.com dataset](https://github.com/ashtadhyayi-com/data), whose maintainers offer it for reuse with
attribution. See the site's *Sources* page for editions and acknowledgements.
