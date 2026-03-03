#!/usr/bin/env bash
set -euo pipefail

SRC="/home/vtc/.openclaw/workspace"
DST="/home/vtc/clawdbot-workspace"

if [[ ! -d "$SRC" ]]; then
  echo "Workspace not found at $SRC" >&2
  exit 1
fi

if [[ ! -d "$DST/.git" ]]; then
  echo "Repo not found at $DST" >&2
  exit 1
fi

# Sync curated workspace files into repo (exclude local state)
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.openclaw/' \
  --exclude 'plugins/memory-lancedb-pro/.git/' \
  --exclude 'plugins/memory-lancedb-pro/node_modules/' \
  --exclude 'plugins/**/data/' \
  --exclude 'plugins/**/backups/' \
  "$SRC/" "$DST/"

echo "Done: synced $SRC -> $DST"
