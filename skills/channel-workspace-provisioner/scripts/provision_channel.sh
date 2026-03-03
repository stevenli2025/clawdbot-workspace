#!/usr/bin/env bash
set -euo pipefail

CFG="$HOME/.openclaw/openclaw.json"
REPO="/home/vtc/clawdbot-workspace"
WORKSPACES_BASE="$HOME/.openclaw/workspaces"

GUILD=""
CHANNEL=""
TEMPLATE="default"

usage() {
  cat <<EOF
Usage: $0 --guild <guildId> --channel <channelId> [--template default]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --guild) GUILD="$2"; shift 2;;
    --channel) CHANNEL="$2"; shift 2;;
    --template) TEMPLATE="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1"; usage; exit 1;;
  esac
done

if [[ -z "$GUILD" || -z "$CHANNEL" ]]; then
  usage; exit 1
fi

AGENT_ID="ch_${CHANNEL}"
WS_DIR="$WORKSPACES_BASE/$AGENT_ID"
TEMPLATE_DIR="$REPO/templates/$TEMPLATE"
GLOBAL_RULES_SRC="$REPO/global/GLOBAL_RULES.md"

if [[ ! -f "$CFG" ]]; then
  echo "Config not found: $CFG" >&2
  exit 1
fi

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  echo "Template not found: $TEMPLATE_DIR" >&2
  exit 1
fi

mkdir -p "$WS_DIR/skills" "$WORKSPACES_BASE"

# copy template skeleton (do not overwrite existing files)
for f in SOUL.md AGENTS.md USER.md TOOLS.md; do
  if [[ -f "$TEMPLATE_DIR/$f" && ! -f "$WS_DIR/$f" ]]; then
    cp "$TEMPLATE_DIR/$f" "$WS_DIR/$f"
  fi
done

# sync global rules into workspace (symlink preferred)
if [[ -f "$GLOBAL_RULES_SRC" ]]; then
  ln -sf "$GLOBAL_RULES_SRC" "$WS_DIR/GLOBAL_RULES.md"
fi

# symlink shared skills into workspace (optional)
mkdir -p "$WS_DIR/skills"
ln -sf "$REPO/skills/workspace-sync-and-memory-export" "$WS_DIR/skills/workspace-sync-and-memory-export" || true
ln -sf "$REPO/skills/channel-workspace-provisioner" "$WS_DIR/skills/channel-workspace-provisioner" || true

# backup config
BAK="$CFG.bak.provision.$(date +%s)"
cp "$CFG" "$BAK"

# update openclaw.json
jq --arg agentId "$AGENT_ID" \
   --arg ws "$WS_DIR" \
   --arg guild "$GUILD" \
   --arg channel "$CHANNEL" \
   '
   .agents.list = ((.agents.list // []) + [{id:$agentId, name:$agentId, workspace:$ws}] | unique_by(.id))
   | .bindings = ((.bindings // []) + [{match:{channel:"discord", peer:{kind:"channel", id:$channel}}, agentId:$agentId}] | unique)
   | .channels.discord.guilds[$guild].channels[$channel] = {allow:true, requireMention:false}
   | .plugins.entries["memory-lancedb-pro"].config.scopes = (
       (.plugins.entries["memory-lancedb-pro"].config.scopes // {})
       | .default = (.default // "global")
       | .definitions = ((.definitions // {})
           + {"global_staging": {"description":"Global PR staging"}}
           + {("agent:" + $agentId): {"description": ("Private scope for " + $agentId)}}
         )
       | .agentAccess = ((.agentAccess // {})
           + {($agentId): ["global_staging", ("agent:" + $agentId)]}
         )
     )
   ' "$CFG" > "$CFG.tmp"

mv "$CFG.tmp" "$CFG"

echo "Provisioned agent=$AGENT_ID workspace=$WS_DIR"
echo "Config backup: $BAK"
