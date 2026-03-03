---
name: provision
description: Provision a new isolated OpenClaw agent+workspace and bind a Discord channel to it (host CLI, transaction + rollback).
user-invocable: false
---

## When to use
Use this when you need to create a brand new Discord channel → workspace isolation boundary.

This provisioning flow enforces:
- `workspaceKey` regex: `^ws_[a-z0-9]+(_[a-z0-9]+)*$`
- No duplicate channel bindings
- No duplicate workspaceKey/agentId
- `agentId == workspaceKey` (canonical)
- Workspace dir: `~/.openclaw/workspaces/<workspaceKey>/`
- Config edits via `openclaw config set` with rollback on error

## How it works (high level)
The host CLI script:
1) validates args
2) reads config and fails fast on collisions
3) creates workspace skeleton
4) snapshots `agents.list` and `bindings`
5) writes `agents.list` then `bindings` using `openclaw config set ... --strict-json`
6) if any write fails, rolls back both lists to snapshots
7) verifies the new agent + binding exist

## Run (host CLI)
From the gateway host:

```bash
# Dry run (no changes)
node {baseDir}/../../scripts/provision.js <discordChannelId> <workspaceKey> --dry-run

# Execute
node {baseDir}/../../scripts/provision.js <discordChannelId> <workspaceKey>
```

## Testing safely
Recommended: test against a throwaway copy of your config.

```bash
# 1) Create a temp copy of config
CFG_REAL="$(openclaw config file)"
CFG_TMP="/tmp/openclaw.test.provision.json"
cp "$CFG_REAL" "$CFG_TMP"

# 2) Point OpenClaw CLI at the temp config for this test
export OPENCLAW_CONFIG_PATH="$CFG_TMP"

# 3) Dry run
node {baseDir}/../../scripts/provision.js 1478249411174858835 ws_test --dry-run

# 4) Real run (against temp config)
node {baseDir}/../../scripts/provision.js 1478249411174858835 ws_test

# 5) Inspect changes
openclaw config get agents.list | tail -n +1
openclaw config get bindings | tail -n +1
```

To test rollback reliably, use failure injection:

```bash
node {baseDir}/../../scripts/provision.js 1478249411174858835 ws_rollback_test --fail-after-agents-set
```

It should print `Changes rolled back` and leave `agents.list`/`bindings` unchanged.

(Older approach like making the config file read-only may not fail if the writer uses temp+rename.)

## Notes
- This skill describes the provisioning tool; it does not auto-run it from inside the agent.
- After successful provisioning, restart/reload the gateway so new bindings apply.
