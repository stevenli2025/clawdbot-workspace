#!/usr/bin/env node
/*
 * provision.js — OpenClaw multi-agent control-plane tool (host CLI)
 *
 * Creates a new isolated agent+workspace and routes a Discord channel to it
 * via config `bindings`.
 *
 * v1 contract:
 * - agentId == workspaceKey (canonical)
 * - routing uses exact peer match: match.peer.kind="channel" + match.peer.id
 * - workspaceKey regex enforced: ^ws_[a-z0-9]+(_[a-z0-9]+)*$
 * - fail-fast on collisions
 * - writes filesystem skeleton under ~/.openclaw/workspaces/<workspaceKey>/
 * - updates ~/.openclaw/openclaw.json (JSON5)
 *
 * NOTE: This tool prefers writing config via `openclaw config set` so the
 * gateway's config writer can preserve formatting/comments as much as possible.
 * It always creates a timestamped backup first and supports rollback.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
function requireJson5() {
  try { return require('json5'); } catch {}
  // Fallback: use OpenClaw's bundled dependency if available.
  try { return require('/usr/local/node-v22.22.0/lib/node_modules/openclaw/node_modules/json5'); } catch {}
  die('Missing dependency: json5. Install it (npm i json5) or ensure OpenClaw node_modules is available in NODE_PATH.');
}
const JSON5 = requireJson5();

const WORKSPACE_KEY_RE = /^ws_[a-z0-9]+(_[a-z0-9]+)*$/;

function die(msg, code = 1) {
  process.stderr.write(String(msg).trimEnd() + '\n');
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    channelId: null,
    workspaceKey: null,
    configPath: null,
    stateDir: null,
    dryRun: false,
    yes: false,
    failAfterAgentsSet: false,
    failAfterBindingsSet: false,
  };

  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '-y' || a === '--yes') args.yes = true;
    else if (a === '--config') args.configPath = argv[++i];
    else if (a === '--state-dir') args.stateDir = argv[++i];
    else if (a === '--fail-after-agents-set') args.failAfterAgentsSet = true;
    else if (a === '--fail-after-bindings-set') args.failAfterBindingsSet = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else positional.push(a);
  }

  args.channelId = positional[0] || null;
  args.workspaceKey = positional[1] || null;

  return args;
}

function usage() {
  return `Usage:
  provision.js <discordChannelId> <workspaceKey> [--dry-run] [--config <path>] [--state-dir <dir>] [--fail-after-agents-set] [--fail-after-bindings-set] [-y]

Examples:
  provision.js 1478249411174858835 ws_frontend
  provision.js 1478249411174858835 ws_frontend --dry-run

Notes:
- workspaceKey must match ${WORKSPACE_KEY_RE}
- agentId == workspaceKey
- default config path: env OPENCLAW_CONFIG_PATH or ~/.openclaw/openclaw.json
`;
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfigPath(args) {
  if (args.configPath) return expandHome(args.configPath);

  // Best-effort: ask OpenClaw which config file is active.
  try {
    const out = execFileSync('openclaw', ['config', 'file'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return expandHome(out);
  } catch {
    // ignore and fall back
  }

  if (process.env.OPENCLAW_CONFIG_PATH) return expandHome(process.env.OPENCLAW_CONFIG_PATH);
  const stateDir = expandHome(args.stateDir) || expandHome(process.env.OPENCLAW_STATE_DIR) || path.join(os.homedir(), '.openclaw');
  return path.join(stateDir, 'openclaw.json');
}

async function lockFile(lockPath) {
  // Simple advisory lock via exclusive create.
  // If lock exists, fail fast.
  try {
    const fd = await fsp.open(lockPath, 'wx', 0o600);
    await fd.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
    return fd;
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      die(`Refusing to run: lock exists at ${lockPath} (another provision may be running).`);
    }
    throw e;
  }
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function normalizeConfigShape(cfg) {
  if (!cfg || typeof cfg !== 'object') cfg = {};
  if (!cfg.agents || typeof cfg.agents !== 'object') cfg.agents = {};
  if (!Array.isArray(cfg.agents.list)) cfg.agents.list = [];
  if (!Array.isArray(cfg.bindings)) cfg.bindings = [];
  return cfg;
}

function findBindingByDiscordChannel(cfg, channelId) {
  return cfg.bindings.find(b =>
    b && b.match && b.match.channel === 'discord' &&
    b.match.peer && b.match.peer.kind === 'channel' && String(b.match.peer.id) === String(channelId)
  );
}

function findAnyBindingForAgent(cfg, agentId) {
  return cfg.bindings.find(b => b && b.agentId === agentId);
}

function findAgent(cfg, agentId) {
  return cfg.agents.list.find(a => a && a.id === agentId);
}

async function writeSkeleton(workspaceDir, workspaceKey) {
  await ensureDir(workspaceDir);
  await ensureDir(path.join(workspaceDir, 'skills'));
  await ensureDir(path.join(workspaceDir, 'notes'));

  const soulPath = path.join(workspaceDir, 'SOUL.md');
  const agentsPath = path.join(workspaceDir, 'AGENTS.md');
  const heartbeatPath = path.join(workspaceDir, 'HEARTBEAT.md');
  const userPath = path.join(workspaceDir, 'USER.md');

  // Only create if missing (idempotent).
  if (!fs.existsSync(soulPath)) {
    await fsp.writeFile(
      soulPath,
      `# SOUL.md (${workspaceKey})\n\nYou are a focused assistant for this workspace.\n\n- WorkspaceKey: \`${workspaceKey}\`\n- Memory scopes (policy reminder):\n  - Read: \`global/*\` and \`ws/${workspaceKey}/*\`\n  - Write: \`ws/${workspaceKey}/*\` only\n  - Global writes are forbidden; use proposals + PR approval.\n`,
      'utf8'
    );
  }

  if (!fs.existsSync(agentsPath)) {
    await fsp.writeFile(
      agentsPath,
      `# AGENTS.md (${workspaceKey})\n\nThis workspace is isolated by design.\n\n- Keep files and decisions local.\n- Promote reusable abstractions via PR to global_staging.\n`,
      'utf8'
    );
  }

  if (!fs.existsSync(heartbeatPath)) {
    await fsp.writeFile(
      heartbeatPath,
      `# Keep this file empty (or with only comments) to skip heartbeat API calls.\n`,
      'utf8'
    );
  }

  if (!fs.existsSync(userPath)) {
    await fsp.writeFile(userPath, `# USER.md (${workspaceKey})\n\n(Workspace-local user notes)\n`, 'utf8');
  }
}

function openclawConfigGet(pathStr, env) {
  const out = execFileSync('openclaw', ['config', 'get', pathStr], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  }).trim();
  // Values are JSON5 when possible, else string. Try parse; fall back to raw string.
  try { return JSON5.parse(out); } catch { return out; }
}

function openclawConfigSet(pathStr, value, env) {
  // Use strict JSON to avoid ambiguous coercions.
  const payload = JSON5.stringify(value);
  execFileSync('openclaw', ['config', 'set', pathStr, payload, '--strict-json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
}

async function markProvisionFailed(workspaceDir, txid, err) {
  try {
    const p = path.join(workspaceDir, 'PROVISION_FAILED.md');
    const body = `# Provision failed\n\n- txid: ${txid}\n- at: ${new Date().toISOString()}\n\n## Error\n\n\`\`\`\n${String(err?.stack || err)}\n\`\`\`\n`;
    await fsp.writeFile(p, body, 'utf8');
  } catch {}
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return die(usage(), 0);

  if (!args.channelId || !args.workspaceKey) {
    die(usage(), 1);
  }

  const channelId = String(args.channelId).trim();
  const workspaceKey = String(args.workspaceKey).trim();

  if (!/^\d+$/.test(channelId)) {
    die(`Invalid discordChannelId: expected digits, got: ${channelId}`);
  }
  if (!WORKSPACE_KEY_RE.test(workspaceKey)) {
    die(`Invalid workspaceKey: ${workspaceKey} (must match ${WORKSPACE_KEY_RE})`);
  }

  const configPath = resolveConfigPath(args);
  const lockPath = configPath + '.lock';
  await ensureDir(path.dirname(configPath));

  const lockFd = await lockFile(lockPath);
  const txid = `tx_${Date.now()}_${workspaceKey}_${crypto.randomBytes(3).toString('hex')}`;

  // Ensure OpenClaw CLI uses the same config file we intend.
  const env = { ...process.env, OPENCLAW_CONFIG_PATH: configPath };

  let workspaceDir = null;

  try {
    if (!fs.existsSync(configPath)) {
      die(`Config not found: ${configPath}`);
    }

    // Read current config for collision checks (fast, local).
    const raw = await fsp.readFile(configPath, 'utf8');
    let cfg;
    try {
      cfg = JSON5.parse(raw);
    } catch (e) {
      die(`Failed to parse JSON5 config at ${configPath}: ${e.message}`);
    }
    cfg = normalizeConfigShape(cfg);

    // Fail-fast collision checks
    const existingBinding = findBindingByDiscordChannel(cfg, channelId);
    if (existingBinding) {
      die(`Refusing to provision: discord channel ${channelId} is already bound to agentId=${existingBinding.agentId}`);
    }

    const existingAgent = findAgent(cfg, workspaceKey);
    if (existingAgent) {
      die(`Refusing to provision: agent/workspaceKey already exists in config: ${workspaceKey}`);
    }

    const existingBindingForAgent = findAnyBindingForAgent(cfg, workspaceKey);
    if (existingBindingForAgent) {
      die(`Refusing to provision: agentId ${workspaceKey} is already used by a binding (match=${JSON5.stringify(existingBindingForAgent.match)})`);
    }

    // Compute workspace directory
    const stateDir = args.stateDir || process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw');
    workspaceDir = path.join(stateDir, 'workspaces', workspaceKey);

    const agent = { id: workspaceKey, name: workspaceKey, workspace: workspaceDir };
    const binding = {
      agentId: workspaceKey,
      match: { channel: 'discord', peer: { kind: 'channel', id: channelId } },
    };

    const summary = {
      txid,
      configPath,
      channelId,
      workspaceKey,
      agentId: workspaceKey,
      workspaceDir,
      changes: { addAgent: agent, addBinding: binding },
    };

    if (args.dryRun) {
      process.stdout.write(`[DRY RUN] Would provision:\n${JSON.stringify(summary, null, 2)}\n`);
      return;
    }

    // Filesystem skeleton first (safe to keep on rollback; we mark failure if needed)
    await writeSkeleton(workspaceDir, workspaceKey);

    // Backup config (full file)
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${configPath}.bak.${ts}.${crypto.randomBytes(4).toString('hex')}`;
    await fsp.copyFile(configPath, backupPath);

    // Transaction snapshots (for rollback)
    const beforeAgents = openclawConfigGet('agents.list', env);
    const beforeBindings = openclawConfigGet('bindings', env);

    // Validate shapes
    const agentsList = Array.isArray(beforeAgents) ? beforeAgents : [];
    const bindingsList = Array.isArray(beforeBindings) ? beforeBindings : [];

    const nextAgents = [...agentsList, agent];
    const nextBindings = [...bindingsList, binding]; // append

    // Failure injection flags are handled in-process (used only for rollback testing)

    // Two-phase commit with rollback
    try {
      openclawConfigSet('agents.list', nextAgents, env);
      if (args.failAfterAgentsSet) {
        throw new Error('Simulated failure after agents.list set (--fail-after-agents-set)');
      }
      openclawConfigSet('bindings', nextBindings, env);
      if (args.failAfterBindingsSet) {
        throw new Error('Simulated failure after bindings set (--fail-after-bindings-set)');
      }
    } catch (e) {
      // Roll back to snapshots
      try { openclawConfigSet('agents.list', agentsList, env); } catch {}
      try { openclawConfigSet('bindings', bindingsList, env); } catch {}

      await markProvisionFailed(workspaceDir, txid, e);
      die(`Provision failed (txid=${txid}). Changes rolled back.\nBackup: ${backupPath}\nError: ${e.message || e}`);
    }

    // Post-verify
    const afterAgents = openclawConfigGet('agents.list', env);
    const afterBindings = openclawConfigGet('bindings', env);
    const okAgent = Array.isArray(afterAgents) && afterAgents.some(a => a && a.id === workspaceKey);
    const okBinding = Array.isArray(afterBindings) && afterBindings.some(b =>
      b && b.agentId === workspaceKey && b.match && b.match.channel === 'discord' &&
      b.match.peer && b.match.peer.kind === 'channel' && String(b.match.peer.id) === String(channelId)
    );
    if (!okAgent || !okBinding) {
      // Roll back if verification fails
      try { openclawConfigSet('agents.list', agentsList, env); } catch {}
      try { openclawConfigSet('bindings', bindingsList, env); } catch {}
      await markProvisionFailed(workspaceDir, txid, new Error('Post-verify failed'));
      die(`Provision verify failed (txid=${txid}). Changes rolled back.\nBackup: ${backupPath}`);
    }

    process.stdout.write(
      `Provisioned workspace successfully.\n` +
      `- txid: ${txid}\n` +
      `- channelId: ${channelId}\n` +
      `- workspaceKey/agentId: ${workspaceKey}\n` +
      `- workspaceDir: ${workspaceDir}\n` +
      `- config: ${configPath}\n` +
      `- backup: ${backupPath}\n\n` +
      `Next: restart the OpenClaw gateway to apply new bindings.\n`
    );
  } finally {
    try { await lockFd.close(); } catch {}
    try { await fsp.unlink(lockPath); } catch {}
  }
}

main().catch(e => {
  die(e?.stack || String(e));
});
