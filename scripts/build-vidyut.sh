#!/usr/bin/env bash
# Build vidyut-prakriya (Ambuda, MIT licence, github.com/ambuda-org/vidyut) to WebAssembly for the derivation
# stepper. Needs git, a Rust toolchain with the wasm32-unknown-unknown target, and wasm-pack. Runs in CI (the
# sandbox used for development cannot install the wasm32 target); see .github/actions/vidyut/action.yml.
# Usage: scripts/build-vidyut.sh [out-dir]   (default apps/web/public/vidyut)
set -euo pipefail
# Pinned commit; changing it (or anything in this file) invalidates the CI cache.
VIDYUT_COMMIT="8da2f90bee3ce1c07505fa432fc3729e3f7e02ea"
OUT="$(realpath -m "${1:-apps/web/public/vidyut}")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git clone --quiet --filter=blob:none https://github.com/ambuda-org/vidyut.git "$WORK/vidyut"
git -C "$WORK/vidyut" checkout --quiet "$VIDYUT_COMMIT"
(cd "$WORK/vidyut/vidyut-prakriya" && wasm-pack build --target web --release --out-dir "$WORK/pkg" -- --features serde)
mkdir -p "$OUT"
cp "$WORK/pkg/vidyut_prakriya.js" "$WORK/pkg/vidyut_prakriya_bg.wasm" "$OUT/"
echo "$VIDYUT_COMMIT" > "$OUT/version.txt"
# Licence notices travel with the copy we serve (MIT, Apache-2.0): every crate compiled for wasm32 and the text of
# its licence. vidyut itself ships no LICENSE file at this commit; its Cargo.toml declares MIT (review D6).
(cd "$WORK/vidyut/vidyut-prakriya" && cargo metadata --format-version 1 --filter-platform wasm32-unknown-unknown --features serde) \
  > "$WORK/metadata.json"
python3 "$(dirname "$0")/third-party-notices.py" "$WORK/metadata.json" vidyut-prakriya > "$OUT/THIRD-PARTY.txt"
grep -q "^vidyut-prakriya .* licence: MIT" "$OUT/THIRD-PARTY.txt"
ls -l "$OUT"
