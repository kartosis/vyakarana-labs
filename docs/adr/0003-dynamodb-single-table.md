# ADR-0003: Single-table DynamoDB, provisioned, LSI for due cards

**Status:** accepted · **Date:** 2026-10-29

## Context

Per-learner data (profile, lesson progress, review cards, daily activity, streak) plus a weekly leaderboard. The AWS always-free tier applies only to provisioned capacity (25 RCU/WCU).

## Decision

One table `vl-main`, **provisioned** (10 RCU/WCU base table), keys `PK`/`SK`; **LSI1** (`LSI1SK = DUE#…`) for due cards; sparse **GSI1** for the leaderboard (only opted-in rows carry its keys); TTL on day, leaderboard and request records. Access patterns and items: ARCHITECTURE §5.

## Consequences

- A learner's data is one partition: export and deletion are one query.
- Capacity is a hard ceiling (cost cannot run away); saves are batched per session, not per answer.
- Writes that must agree are one transaction (ADR-0008); transactions cost 2 WCU per item.
