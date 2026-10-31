# ADR-0007: Build the vidyut WebAssembly in CI, pinned

**Status:** accepted · **Date:** 2026-10-30

## Context

No published npm/WASM build of vidyut-prakriyā was found (PROGRESS §4.5). Committing a binary would hide its provenance; the development sandbox cannot build `wasm32` (no target download).

## Decision

`scripts/build-vidyut.sh` builds a **pinned commit** (8da2f90) with `wasm-pack --target web` (wasm-bindgen 0.2.99) into `apps/web/public/vidyut/` (gitignored), with `version.txt`. A composite action (`.github/actions/vidyut`) caches the output keyed on the script's hash; `ci.yml` and `deploy.yml` both use it.

## Consequences

- The binary is reproducible from source; bumping vidyut is a one-line change reviewed in a PR.
- Without the build (local dev), the tool shows a graceful "not part of this build" message.
- Extensionless files 404 under `astro preview` and are rewritten by the CloudFront function, hence `version.txt`.
