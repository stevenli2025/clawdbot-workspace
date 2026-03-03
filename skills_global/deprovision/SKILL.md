---
name: deprovision
description: Remove a Discord channel binding and optionally remove its agent/workspace (host CLI, rollback-safe).
user-invocable: false
---

## When to use
Use this when you want to detach a Discord channel from its dedicated workspace/agent, and optionally remove that agent.

## What it does
- Finds the binding: `match.channel="discord"` + `match.peer.kind="channel"` + `match.peer.id=<channelId>`.
- Removes that binding from `bindings`.
- Optionally removes the agent from `agents.list`:
  - default: `--remove-agent auto` removes the agent only if no other bindings reference it.
  - `--remove-agent never` keeps the agent.
  - `--remove-agent always` attempts to remove the agent.

All config edits use `openclaw config get/set` and roll back on failure.

## Run (host CLI)

```bash
# Dry run
node /home/vtc/clawdbot-workspace/scripts/deprovision.js <discordChannelId> --dry-run

# Execute
node /home/vtc/clawdbot-workspace/scripts/deprovision.js <discordChannelId>
```

## Destructive options
Deleting the workspace directory is optional and requires `-y`:

```bash
node /home/vtc/clawdbot-workspace/scripts/deprovision.js <discordChannelId> \
  --delete-workspace-dir -y
```

## Rollback testing
Use failure injection flags:

```bash
node /home/vtc/clawdbot-workspace/scripts/deprovision.js <discordChannelId> \
  --fail-after-bindings-set
```

Expected: it prints `Changes rolled back` and leaves `bindings` and `agents.list` unchanged.
