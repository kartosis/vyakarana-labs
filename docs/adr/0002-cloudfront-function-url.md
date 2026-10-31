# ADR-0002: CloudFront → Lambda Function URL (OAC) instead of API Gateway

**Status:** accepted · **Date:** 2026-10-29

## Context

The API must cost $0 at low traffic and sit on the same origin as the site (no CORS, cookies scoped to the site). API Gateway's free tier lasts only 12 months; a Lambda Function URL has no charge of its own.

## Decision

Serve `/api/*` from a **Lambda Function URL with `AuthType=AWS_IAM`**, reached only through **CloudFront origin access control**. The browser sends its access token in `X-VL-Auth` (OAC overwrites `Authorization`) and the SHA-256 of any body in `x-amz-content-sha256`.

## Consequences

- Same origin for site and API; the refresh cookie is `HttpOnly; SameSite=Strict; Path=/api/v1/auth`.
- No API Gateway features (usage plans, request validation): validation is in the function (Pydantic), throttling is DynamoDB's provisioned ceiling plus Lambda concurrency.
- CloudFront maps 403 to the 404 page, so the API never answers 403 (`errors.py` enforces it).
