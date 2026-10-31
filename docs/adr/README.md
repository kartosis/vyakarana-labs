# Architecture decision records

Short records of decisions that shape the system: context, decision, consequences. New decisions get the next number; a reversed decision is marked *Superseded by ADR-NNNN*, never deleted.

| ADR | Decision | Date |
|---|---|---|
| [ADR-0001](0001-static-astro-islands.md) | Static-first Astro with Preact islands | 2026-10-29 |
| [ADR-0002](0002-cloudfront-function-url.md) | CloudFront → Lambda Function URL (OAC) instead of API Gateway | 2026-10-29 |
| [ADR-0003](0003-dynamodb-single-table.md) | Single-table DynamoDB, provisioned, LSI for due cards | 2026-10-29 |
| [ADR-0004](0004-passwordless-cognito-token-handler.md) | Passwordless Cognito with a token-handler cookie | 2026-10-29 |
| [ADR-0005](0005-hybrid-engine-vidyut.md) | Hybrid grammar engine: own TypeScript + vidyut-prakriyā (WASM) | 2026-10-29 |
| [ADR-0006](0006-cloudflare-web-analytics.md) | Cloudflare Web Analytics for cookieless page metrics | 2026-10-29 |
| [ADR-0007](0007-vidyut-wasm-built-in-ci.md) | Build the vidyut WebAssembly in CI, pinned | 2026-10-30 |
| [ADR-0008](0008-exactly-once-saves.md) | Exactly-once saves: request id + REQ# record in the same transaction | 2026-10-31 |
