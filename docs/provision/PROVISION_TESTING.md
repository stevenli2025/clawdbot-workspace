# Provision CLI — Testing Guide

This workspace contains a host CLI tool:
- `scripts/provision.js`

It provisions a new isolated agent/workspace and appends a Discord channel binding.

## 0) Preconditions
- Run on the OpenClaw gateway host.
- `openclaw` is on PATH.

## 1) Safety: test against a temporary config

```bash
CFG_REAL="$(openclaw config file)"
CFG_TMP="/tmp/openclaw.test.provision.json"
cp "$CFG_REAL" "$CFG_TMP"

export OPENCLAW_CONFIG_PATH="$CFG_TMP"
```

## 2) Dry run

```bash
node scripts/provision.js 1478249411174858835 ws_test --dry-run
```

## 3) Execute (writes to temp config)

```bash
node scripts/provision.js 1478249411174858835 ws_test
```

## 4) Verify

```bash
openclaw config get agents.list
openclaw config get bindings

# confirm the new workspace exists
ls -la ~/.openclaw/workspaces/ws_test
```

## 5) Rollback test

Use failure injection flags to reliably test rollback (recommended):

```bash
node scripts/provision.js 1478249411174858835 ws_rollback_test \
  --fail-after-agents-set
```

Expected:
- Script exits with an error message including `Changes rolled back`.
- `openclaw config get agents.list` and `openclaw config get bindings` are unchanged.
- `~/.openclaw/workspaces/ws_rollback_test/PROVISION_FAILED.md` exists.

Alternative (less reliable): make the temp config read-only and attempt provision.
This may not fail if the writer uses temp+rename.

## 6) Apply for real

Unset env var to target the real config:

```bash
unset OPENCLAW_CONFIG_PATH
node scripts/provision.js <channelId> <workspaceKey>

# restart gateway after edits
openclaw gateway restart
```
