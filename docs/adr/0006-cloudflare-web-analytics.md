# ADR-0006: Cloudflare Web Analytics for cookieless page metrics

**Status:** accepted · **Date:** 2026-10-29

## Context

The owner asked for learning data plus privacy-first page analytics without a consent banner. Counting page views in DynamoDB would cost writes.

## Decision

Use **Cloudflare Web Analytics** (cookieless, aggregate, free). The repository variable `CF_BEACON_TOKEN` feeds both the site build (`PUBLIC_CF_BEACON_TOKEN` → the beacon tag in every page) and Terraform (the CSP then allows `static.cloudflareinsights.com` and `cloudflareinsights.com`). Empty → no beacon and the privacy page says page visits are not counted. Implemented 2026-10-31 (review #19).

## Consequences

- One switch; workflow rule W6 (`scripts/check-workflows.mjs`) keeps the two uses on the same variable.
- The token is validated at build (32 hex characters), so a bad value fails the build instead of reaching the markup.
