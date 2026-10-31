# ADR-0005: Hybrid grammar engine: own TypeScript + vidyut-prakriyā (WASM)

**Status:** accepted · **Date:** 2026-10-29

## Context

Lessons need small, explainable rule functions with LSK/Kāśikā examples as tests (sandhi, pratyāhāra, savarṇa). Full derivations (declension, conjugation) need ~2,000 Aṣṭādhyāyī rules, which should not be re-implemented.

## Decision

Own **TypeScript engine** (`packages/engine`: lipi, varṇa, vowel/consonant/visarga sandhi, each step citing its sūtra) for teaching, plus **vidyut-prakriyā** (MIT, Ambuda) compiled to **WebAssembly** for derivations, loaded lazily on the Derivation tool.

## Consequences

- Teaching rules stay readable and are tested against the sources (342 tests); derivations come with sūtra codes from vidyut.
- The CSP needs `'wasm-unsafe-eval'` in `script-src`.
- vidyut is pinned (ADR-0007); its output is checked in CI (`e2e/prakriya.cjs`).
