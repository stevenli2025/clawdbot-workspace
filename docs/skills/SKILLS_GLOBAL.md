# Global Shared Skills (skills_global)

This repo provides a shared skills pack at:

- `/home/vtc/clawdbot-workspace/skills_global`

OpenClaw can load it via config:

```json5
{
  skills: {
    load: {
      extraDirs: ["/home/vtc/clawdbot-workspace/skills_global"],
    },
  },
}
```

## Why extraDirs
- Shared skills live outside each agent workspace.
- Workspace-specific overrides still work because `<workspace>/skills` has higher precedence.

Precedence (high → low):
1. `<workspace>/skills`
2. `~/.openclaw/skills`
3. bundled
4. `skills.load.extraDirs`

## One-time bootstrap
Run:

```bash
node /home/vtc/clawdbot-workspace/scripts/bootstrap_skills_extraDirs.js
```

Dry run:

```bash
node /home/vtc/clawdbot-workspace/scripts/bootstrap_skills_extraDirs.js --dry-run
```

After changing config, restart the gateway:

```bash
openclaw gateway restart
```
