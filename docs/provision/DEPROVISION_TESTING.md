# Deprovision CLI — Testing Guide

Tool:
- `/home/vtc/clawdbot-workspace/scripts/deprovision.js`

## Safety: test against a temporary config

```bash
CFG_REAL_RAW="$(openclaw config file)"
CFG_REAL="${CFG_REAL_RAW/#~/$HOME}"
CFG_TMP="/tmp/openclaw.test.deprovision.$(date +%s).json"
cp "$CFG_REAL" "$CFG_TMP"

export OPENCLAW_CONFIG_PATH="$CFG_TMP"
```

## Setup: create a test binding first
Use the provision tool against the temp config (example channel id):

```bash
node /home/vtc/clawdbot-workspace/scripts/provision.js 999999999999999999 ws_test
```

## Dry run

```bash
node /home/vtc/clawdbot-workspace/scripts/deprovision.js 999999999999999999 --dry-run
```

## Execute

```bash
node /home/vtc/clawdbot-workspace/scripts/deprovision.js 999999999999999999
openclaw config get bindings
openclaw config get agents.list
```

## Rollback test

```bash
# re-provision then force an error mid-flight
node /home/vtc/clawdbot-workspace/scripts/provision.js 999999999999999999 ws_test
node /home/vtc/clawdbot-workspace/scripts/deprovision.js 999999999999999999 --fail-after-bindings-set

# verify that binding/agent are still present (rolled back)
openclaw config get bindings | grep -n 999999999999999999
openclaw config get agents.list | grep -n ws_test
```
