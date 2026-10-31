# ADR-0004: Passwordless Cognito with a token-handler cookie

**Status:** accepted · **Date:** 2026-10-29

## Context

Learners should sign in with an emailed one-time code (no passwords). Long-lived tokens must not be readable by page scripts.

## Decision

**Cognito user pool, Essentials plan**, sign-in policy `EMAIL_OTP` via the public app client's `USER_AUTH` flow. The browser keeps only the short-lived access token (sessionStorage); the refresh token goes to `POST /api/v1/auth/session`, which sets it as an `HttpOnly; Secure; SameSite=Strict` cookie on `/api/v1/auth`, and `/auth/refresh` exchanges it. The profile is created lazily on first API call (no Cognito trigger).

## Consequences

- A script injection cannot steal the refresh token; the CSP limits injection in the first place.
- Email delivery needs SES with a verified domain and production access (owner setup, DEPLOY.md §7).
- Refresh outages (5xx, offline) keep the session; only a 4xx (except 429) signs the learner out (review #18).
