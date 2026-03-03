---
name: workspace-sync-and-memory-export
description: Export memory-lancedb-pro memories, commit them into the clawdbot-workspace repo, and push to GitHub using a local .github_pat file (GIT_ASKPASS). Use when the user asks to backup/version-control OpenClaw workspace files and memory exports, or wants a one-command export+commit+push workflow.
---

# Workspace + Memory Export → GitHub (clawdbot-workspace)

This skill automates a safe, repeatable workflow:

- Export memories from `memory-lancedb-pro` via `openclaw memory-pro export`
- Store exports under `exports/` in the repo
- Commit + push to GitHub using a **local** PAT file (`.github_pat`) via `GIT_ASKPASS`

## Preconditions (must be true)

- Repo exists locally at `/home/vtc/clawdbot-workspace`
- PAT is saved at `/home/vtc/clawdbot-workspace/.github_pat` (one line token) and is **gitignored**
- Gateway token available for CLI calls:
  - Either `OPENCLAW_GATEWAY_TOKEN` is set, **or** you can read it from `~/.openclaw/openclaw.json`.

## Do this when asked

### One-command export + commit + push

Run:

- `bash /home/vtc/clawdbot-workspace/skills/workspace-sync-and-memory-export/scripts/export_commit_push.sh`

This will:

1) Export memories to `exports/memory-export-<UTC timestamp>.json`
2) `git add exports/`
3) Commit with a default message (or `COMMIT_MSG=...`)
4) Push to `origin main` using `.github_pat`

### Optional: sync workspace docs/config into the repo

If user wants to refresh repo content from the active OpenClaw workspace:

- `bash /home/vtc/clawdbot-workspace/skills/workspace-sync-and-memory-export/scripts/sync_workspace_into_repo.sh`

This uses `rsync` and excludes `.openclaw/` and other local-only state.

## Notes / guardrails

- Do **not** commit `.openclaw/` (contains local state + can contain sensitive data).
- Do **not** commit `.github_pat`.
- Export files *do* contain memory content; confirm user intent before exporting if there is any doubt.
