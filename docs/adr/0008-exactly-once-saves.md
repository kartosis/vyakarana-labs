# ADR-0008: Exactly-once saves: request id + REQ# record in the same transaction

**Status:** accepted · **Date:** 2026-10-31

## Context

External review #1: a practice session was saved as several separate writes with no idempotency, so a retry after a lost response double-counted progress and points, and a failure part-way left partial state. Review #8/#9: reviews could repeat a card, and failed review saves were lost on reload. Powertools idempotency stores its record separately from the changes it protects.

## Decision

The client creates a `requestId` (UUID) per save and keeps the save, unchanged, in a per-tab **outbox** (`apps/web/src/lib/outbox.ts`) until the API confirms it; every retry resends the same id and body. The API writes **`REQ#{requestId}`** (body fingerprint, response, TTL 7 days) **in the same `TransactWriteItems`** as the changes, and guards every written value derived from a read (progress attempts as version, streak version, leaderboard score, card `due`, a `ConditionCheck` on the profile's opt-in and pseudonym). A replay returns the stored response; the same id with another body is 409; a cancelled transaction is recomputed (4 tries, then 503). Site-wide counters are bumped after the commit, best effort.

## Consequences

- Retries can never double-count; partial saves cannot happen.
- Transactions need `dynamodb:ConditionCheckItem` (checked by `infra/terraform/tests/test_iam_policies.py`).
- Outbox entries expire after 24 h (< the 7-day REQ TTL) and on sign-out, so a stale save is never replayed into another account or applied twice.
- Reviews are capped at 50 cards per request to stay under the 100-item transaction limit.
