# CLAUDE.md — project instructions

## Resume first
- **Before anything else, read `docs/PROGRESS.md`** and continue at its `▶ NEXT ACTION`.
- Never re-ask questions recorded in PROGRESS §2; never redo research in PROGRESS §4.
- After each completed step: update PROGRESS (checklist §6, log §9, NEXT ACTION) → run `scripts/checkpoint.sh "<message>"`.
- When the user answers a question: record it in PROGRESS §2 **and** in memory `/areas/sanskrit-grammar-app.md` in the same turn.

## Project
- Sanskrit grammar learning web app grounded in Pāṇini (Aṣṭādhyāyī), Patañjali (Mahābhāṣya), Bhartṛhari (Vākyapadīya).
- Stack: AWS serverless + Terraform; Python Lambda API; TypeScript grammar engine in the browser; Cognito email one-time-code sign-in.

## Web platform policy
- Baseline target: **Baseline 2024** (newer features behind `@supports` with usable fallback; no polyfills unless critical).
- Design tokens: `--p-*` → `--s-*` → `--c-*`; components never reference primitives; all CSS inside `@layer tokens, atoms, molecules, organisms, pages`.
- `color-scheme` only on `:root`; `light-dark()` only in semantic tier; oklch primitives.
- Semantic HTML first (agent- and screen-reader-readable); every input has `<label for>`.

## Citations
- Every grammatical rule shown to learners cites its sūtra and links to
  `https://indike.org/pramana/in.vedanga.vyakarana.astadhyayi.{a}.{p}.{s}`.
