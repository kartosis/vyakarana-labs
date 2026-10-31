# ADR-0001: Static-first Astro with Preact islands

**Status:** accepted · **Date:** 2026-10-29

## Context

The app is mostly reading: lessons, sūtra pages, tables. It must be fast on phones, readable by screen readers and search engines, and cost nothing to serve. Interactive parts (exercises, tools, the derivation stepper, account pages) are islands inside otherwise static pages.

## Decision

Build the site with **Astro (static output)** and **Preact islands**; lessons are MDX in zod-validated content collections. Pages ship no JavaScript unless an island needs it.

## Consequences

- Every page is a static file on S3 behind CloudFront: no server rendering, no per-view cost.
- Accessibility and SEO come from semantic HTML first; islands hydrate on top.
- Inline scripts and styles are hashed into the CSP at build time (`scripts/csp-hashes.mjs`), so no `'unsafe-inline'`.
- Anything personal is fetched at run time by islands from `/api/v1/*`.
