#!/usr/bin/env node
/*
 * deprovision.js — OpenClaw multi-agent control-plane tool (host CLI)
 *
 * Removes a Discord channel → agent binding, and optionally removes the agent.
 *
 * v1 assumptions:
 * - agentId == workspaceKey (canonical)
 * - bindings use exact peer match: match.channel='discord', match.peer.kind='channel'
 *
 * Safety defaults:
 * - Does NOT delete workspace directory by default.
 * - Removes agent only if it is no longer referenced by any binding (or if --force-remove-agent).
 *
 * Config edits are performed via `openclaw config get/set` with rollback.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function die(msg, code = 1) {
  process.stderr.write(String(msg).trimEnd() + '\n');
  process.exit(code);
}

function requireJson5() {
  try { return require('json5'); } catch {}
  try { return require('/usr/local/node-v22.22.0/lib/node_modules/openclaw/node_modules/json5'); } catch {}
  die('Missing dependency: json5');
}
const JSON5 = requireJson5();

function parseArgs(argv) {
  const args = {
    channelId: null,
    configPath: null,
    stateDir: null,
    dryRun: false,
    yes: false,
    removeAgent: 'auto', // auto|always|never
    forceRemoveAgent: false,
    deleteWorkspaceDir: false,
    help: false,
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
    else if (a === '--remove-agent') args.removeAgent = argv[++i];
    else if (a === '--force-remove-agent') args.forceRemoveAgent = true;
    else if (a === '--delete-workspace-dir') args.deleteWorkspaceDir = true;
    else if (a === '--fail-after-bindings-set') args.failAfterBindingsSet = true;
    else if (a === '--fail-after-agents-set') args.failAfterAgentsSet = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else positional.push(a);
  }

  args.channelId = positional[0] || null;
  return args;
}

function usage() {
  return `Usage:\n  deprovision.js <discordChannelId> [options]\n\nOptions:\n  --dry-run\n  --config <path>\n  --state-dir <dir>\n  --remove-agent <auto|always|never>   (default: auto)\n  --force-remove-agent                (remove agent even if referenced; dangerous)\n  --delete-workspace-dir              (dangerous; requires -y)\n  --fail-after-bindings-set           (rollback test)\n  --fail-after-agents-set             (rollback test)\n  -y, --yes                           (confirm destructive actions)\n\nNotes:\n- This tool removes the binding for the channel.\n- It removes the agent if safe (auto) or if forced (always/--force-remove-agent).\n- Workspace directory is NOT deleted unless --delete-workspace-dir is provided.\n`;
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfigPath(args) {
  if (args.configPath) return expandHome(args.configPath);
  try {
    const out = execFileSync('openclaw', ['config', 'file'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return expandHome(out);
  } catch {}
  if (process.env.OPENCLAW_CONFIG_PATH) return expandHome(process.env.OPENCLAW_CONFIG_PATH);
  const stateDir = expandHome(args.stateDir) || expandHome(process.env.OPENCLAW_STATE_DIR) || path.join(os.homedir(), '.openclaw');
  return path.join(stateDir, 'openclaw.json');
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function lockFile(lockPath) {
  try {
    const fd = await fsp.open(lockPath, 'wx', 0o600);
    await fd.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
    return fd;
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      die(`Refusing to run: lock exists at ${lockPath} (another run may be in progress).`);
    }
    throw e;
  }
}

function openclawGet(pathStr, env) {
  const out = execFileSync('openclaw', ['config', 'get', pathStr], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  }).trim();
  try { return JSON5.parse(out); } catch { return out; }
}

function openclawSet(pathStr, value, env) {
  const payload = JSON5.stringify(value);
  execFileSync('openclaw', ['config', 'set', pathStr, payload, '--strict-json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
}

function findBindingIndex(bindings, channelId) {
  return bindings.findIndex(b =>
    b && b.match && b.match.channel === 'discord' &&
    b.match.peer && b.match.peer.kind === 'channel' && String(b.match.peer.id) === String(channelId)
  );
}

function countBindingsForAgent(bindings, agentId) {
  return bindings.filter(b => b && b.agentId === agentId).length;
}

function findAgentIndex(agents, agentId) {
  return agents.findIndex(a => a && a.id === agentId);
}

async function maybeDeleteWorkspaceDir(workspaceDir, args) {
  if (!args.deleteWorkspaceDir) return { deleted: false, reason: 'flag not set' };
  if (!args.yes) die('Refusing to delete workspace dir without -y/--yes');
  if (!workspaceDir) die('Cannot delete workspace dir: unknown workspaceDir');

  if (!fs.existsSync(workspaceDir)) {
    return { deleted: false, reason: 'dir not found' };
  }

  // Safety: only allow deletion under the chosen stateDir/workspaces.
  const stateDir = args.stateDir || process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw');
  const allowedRoot = path.resolve(path.join(stateDir, 'workspaces')) + path.sep;
  const resolved = path.resolve(workspaceDir) + path.sep;
  if (!resolved.startsWith(allowedRoot)) {
    die(`Refusing to delete workspace dir outside ${allowedRoot}: ${workspaceDir}`);
  }

  await fsp.rm(workspaceDir, { recursive: true, force: true });
  return { deleted: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return die(usage(), 0);
  if (!args.channelId) return die(usage(), 1);

  const channelId = String(args.channelId).trim();
  if (!/^\d+$/.test(channelId)) {
    die(`Invalid discordChannelId: expected digits, got: ${channelId}`);
  }
  if (!['auto', 'always', 'never'].includes(args.removeAgent)) {
    die(`Invalid --remove-agent: ${args.removeAgent} (expected auto|always|never)`);
  }

  const configPath = resolveConfigPath(args);
  const lockPath = configPath + '.lock';
  await ensureDir(path.dirname(configPath));
  const lockFd = await lockFile(lockPath);

  const txid = `tx_${Date.now()}_deprov_${channelId}_${crypto.randomBytes(3).toString('hex')}`;
  const env = { ...process.env, OPENCLAW_CONFIG_PATH: configPath };

  try {
    if (!fs.existsSync(configPath)) die(`Config not found: ${configPath}`);

    // Snapshot for rollback
    const beforeAgents = openclawGet('agents.list', env);
    const beforeBindings = openclawGet('bindings', env);

    const agents = Array.isArray(beforeAgents) ? beforeAgents : [];
    const bindings = Array.isArray(beforeBindings) ? beforeBindings : [];

    const bIdx = findBindingIndex(bindings, channelId);
    if (bIdx < 0) {
      die(`No binding found for discord channel ${channelId} (nothing to do).`, 2);
    }

    const binding = bindings[bIdx];
    const agentId = binding.agentId;

    const otherRefs = countBindingsForAgent(bindings, agentId) - 1; // excluding this binding
    const aIdx = findAgentIndex(agents, agentId);
    const agent = aIdx >= 0 ? agents[aIdx] : null;
    const workspaceDir = agent && typeof agent.workspace === 'string' ? agent.workspace : null;

    const removeAgentDecision = (function () {
      if (args.removeAgent === 'never') return false;
      if (args.removeAgent === 'always') return true;
      // auto
      return otherRefs <= 0;
    })();

    if (removeAgentDecision && otherRefs > 0 && !args.forceRemoveAgent) {
      die(`Refusing to remove agent ${agentId}: still referenced by ${otherRefs} other binding(s). Use --force-remove-agent to override.`);
    }

    const nextBindings = bindings.filter((_, i) => i !== bIdx);
    const nextAgents = removeAgentDecision ? agents.filter((_, i) => i !== aIdx) : agents;

    const summary = {
      txid,
      configPath,
      channelId,
      removedBinding: binding,
      agentId,
      removeAgent: removeAgentDecision,
      otherBindingRefs: otherRefs,
      workspaceDir,
      deleteWorkspaceDir: args.deleteWorkspaceDir,
    };

    if (args.dryRun) {
      process.stdout.write(`[DRY RUN] Would deprovision:\n${JSON.stringify(summary, null, 2)}\n`);
      return;
    }

    // Backup full config
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${configPath}.bak.${ts}.${crypto.randomBytes(4).toString('hex')}`;
    await fsp.copyFile(configPath, backupPath);

    // Two-phase write with rollback
    try {
      openclawSet('bindings', nextBindings, env);
      if (args.failAfterBindingsSet) {
        throw new Error('Simulated failure after bindings set (--fail-after-bindings-set)');
      }

      if (removeAgentDecision) {
        openclawSet('agents.list', nextAgents, env);
      }
      if (args.failAfterAgentsSet) {
        throw new Error('Simulated failure after agents.list set (--fail-after-agents-set)');
      }
    } catch (e) {
      // rollback
      try { openclawSet('bindings', bindings, env); } catch {}
      try { openclawSet('agents.list', agents, env); } catch {}
      die(`Deprovision failed (txid=${txid}). Changes rolled back.\nBackup: ${backupPath}\nError: ${e.message || e}`);
    }

    // Post-verify: binding removed; agent removed if requested
    const afterBindings = openclawGet('bindings', env);
    const afterAgents = openclawGet('agents.list', env);

    const bindingStillThere = Array.isArray(afterBindings) && findBindingIndex(afterBindings, channelId) >= 0;
    const agentStillThere = Array.isArray(afterAgents) && afterAgents.some(a => a && a.id === agentId);

    if (bindingStillThere || (removeAgentDecision && agentStillThere)) {
      // rollback
      try { openclawSet('bindings', bindings, env); } catch {}
      try { openclawSet('agents.list', agents, env); } catch {}
      die(`Deprovision verify failed (txid=${txid}). Changes rolled back.`);
    }

    // Optionally delete workspace dir (destructive; guarded)
    const del = await maybeDeleteWorkspaceDir(workspaceDir, args);

    process.stdout.write(
      `Deprovisioned successfully.\n` +
      `- txid: ${txid}\n` +
      `- channelId: ${channelId}\n` +
      `- removed binding -> agentId: ${agentId}\n` +
      `- removed agent: ${removeAgentDecision}\n` +
      `- workspaceDir: ${workspaceDir || '(unknown)'}\n` +
      `- workspaceDir deleted: ${del.deleted ? 'yes' : 'no'}${del.reason ? ` (${del.reason})` : ''}\n` +
      `\nNext: restart gateway (openclaw gateway restart) if needed.\n`
    );
  } finally {
    try { await lockFd.close(); } catch {}
    try { await fsp.unlink(lockPath); } catch {}
  }
}

main().catch(e => die(e?.stack || String(e)));
