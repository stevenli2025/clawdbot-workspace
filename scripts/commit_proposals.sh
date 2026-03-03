#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Commit any new/changed proposals under global_staging/proposals.
# Usage: COMMIT_MSG="..." bash scripts/commit_proposals.sh

MSG=${COMMIT_MSG:-"Add/Update global_staging proposals"}

if ! git status --porcelain global_staging/proposals | grep -q .; then
  echo "No proposal changes to commit."
  exit 0
fi

git add global_staging/proposals

git commit -m "$MSG"

git push origin main
