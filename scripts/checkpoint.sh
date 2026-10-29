#!/usr/bin/env bash
# Commit and push all work as a resumable checkpoint.
# Usage: scripts/checkpoint.sh "short description of what was completed"
set -euo pipefail
msg="${1:-checkpoint}"
cd "$(git rev-parse --show-toplevel)"
git add -A
if git diff --cached --quiet; then
  echo "checkpoint: nothing to commit"
else
  git commit -q -m "checkpoint: ${msg}"
fi
git push -q origin HEAD
echo "checkpoint pushed: ${msg}"
