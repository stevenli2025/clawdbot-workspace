---
name: channel-workspace-provisioner
description: Provision a new isolated workspace per Discord channel: create agentId=ch_<channelId>, create workspace skeleton, bind Discord channel routing to that agent, restrict memory-lancedb-pro scope access (agent scope + global_staging), and sync GLOBAL_RULES.md into the workspace.
---

# Provision: 1 Channel = 1 Agent = 1 Workspace

This skill provisions a new isolated workspace for a Discord channel.

## What it changes

- Creates a new agent: `ch_<channelId>`
- Creates workspace dir: `/home/vtc/.openclaw/workspaces/ch_<channelId>`
- Adds a binding so that Discord channel routes to the new agent
- Updates memory-lancedb-pro scopes + ACL:
  - Creates scope `agent:ch_<channelId>`
  - Grants agent access to `["agent:ch_<channelId>", "global_staging"]`
  - Does **not** grant `global`
- Syncs `GLOBAL_RULES.md` into the workspace

## Run

On the gateway host:

```bash
bash /home/vtc/clawdbot-workspace/skills/channel-workspace-provisioner/scripts/provision_channel.sh \
  --guild 1478240868648620142 \
  --channel <discordChannelId> \
  --template default
```

After provisioning, restart gateway:

```bash
openclaw gateway restart
```

## Notes

- This is intentionally *semi-automatic*: you call it when you create a new channel.
- Global shared rules are file-based: `/home/vtc/clawdbot-workspace/global/GLOBAL_RULES.md`.
