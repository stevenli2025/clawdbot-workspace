#!/usr/bin/env bash
set -euo pipefail
# Git will call this script to request credentials.
# We return the GitHub PAT stored in the local file .github_pat (NOT committed).
TOKEN_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.github_pat"
if [[ -f "$TOKEN_FILE" ]]; then
  cat "$TOKEN_FILE"
  exit 0
fi
# Fallback: empty (will fail fast)
exit 1
