#!/usr/bin/env bash
set -euo pipefail

REPO="/home/vtc/clawdbot-workspace"
TOKEN_FILE="$REPO/.github_pat"
ASKPASS="$REPO/scripts/git-askpass.sh"

if [[ ! -d "$REPO/.git" ]]; then
  echo "Repo not found at $REPO" >&2
  exit 1
fi

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing PAT file: $TOKEN_FILE" >&2
  exit 1
fi

# Ensure we can talk to the gateway
if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  if [[ -f "$HOME/.openclaw/openclaw.json" ]]; then
    OPENCLAW_GATEWAY_TOKEN="$(jq -r '.gateway.auth.token' "$HOME/.openclaw/openclaw.json")"
    export OPENCLAW_GATEWAY_TOKEN
  fi
fi

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" || "$OPENCLAW_GATEWAY_TOKEN" == "null" ]]; then
  echo "OPENCLAW_GATEWAY_TOKEN is not set and could not be inferred." >&2
  exit 1
fi

mkdir -p "$REPO/exports"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$REPO/exports/memory-export-$TS.json"

cd "$REPO"

# Export memories
openclaw memory-pro export --output "$OUT"

# Commit + push
export GIT_ASKPASS="$ASKPASS"
export GIT_TERMINAL_PROMPT=0

COMMIT_MSG="${COMMIT_MSG:-Update memory export $TS}"

git add "$OUT"
if git diff --cached --quiet; then
  echo "No changes staged; nothing to commit." >&2
  exit 0
fi

git commit -m "$COMMIT_MSG"

git push origin main

echo "Done: exported + committed + pushed ($OUT)"
