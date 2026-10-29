# Vyākaraṇa Labs

**Learn Sanskrit grammar the way Pāṇini built it.** An interactive course that follows Varadarāja's
*Laghusiddhāntakaumudī* rule by rule, with Patañjali's *Mahābhāṣya* and Bhartṛhari's *Vākyapadīya*
set beside every sūtra, the way commentary surrounds the root text on a manuscript page.

- **Every rule cited exactly**: sūtra in Devanagari, word split, carried-over words, Varadarāja's gloss, plain-English meaning, and a link to the source on [Pramāṇa](https://indike.org/pramana/in.vedanga.vyakarana).
- **Three voices per lesson**: Pāṇini (the rule), Patañjali (why it is phrased so), Bhartṛhari (what a word is).
- **Interactive**: a live Śivasūtra pratyāhāra builder, a place-and-effort chart for savarṇa, derivation step-throughs, a transliteration pad. Each one runs the same tested grammar engine.
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
| `packages/engine` | TypeScript grammar engine: transliteration (IAST / Devanagari / SLP1 / Harvard-Kyoto), Śivasūtras, pratyāhāra (1.1.71), savarṇa (1.1.9–10), guṇa/vṛddhi. Vitest suite |
| `data/` | Sūtras (YAML, with verification flags), verified source quotations, course structure, Pramāṇa coverage manifest |
| `infra/terraform` | `bootstrap/` (state + OIDC roles), `modules/site`, `modules/guardrails`, `envs/prod` |
| `scripts/` | `csp-hashes.mjs` (strict CSP), `checkpoint.sh` |
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
- Sources: every quoted passage is checked against a published text before it is shown (`data/quotes.yaml` records where).

## Sources and licences

Primary texts are ancient and public domain. Lesson prose, translations and software are original to this
project. Pāṇini's sūtras are keyed from the public-domain text rather than copied from any licensed digital
edition. See the site's *Sources* page for editions and acknowledgements.
