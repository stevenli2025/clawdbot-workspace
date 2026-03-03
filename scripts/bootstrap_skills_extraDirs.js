#!/usr/bin/env node
/*
 * bootstrap_skills_extraDirs.js
 *
 * One-time bootstrap to ensure OpenClaw loads shared skills from:
 *   /home/vtc/clawdbot-workspace/skills_global
 *
 * It edits OpenClaw config via `openclaw config get/set` and supports rollback.
 *
 * Usage:
 *   node scripts/bootstrap_skills_extraDirs.js [--config <path>] [--dry-run]
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
  const args = { configPath: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') args.configPath = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else die(`Unknown arg: ${a}`);
  }
  return args;
}

function usage() {
  return `Usage:\n  bootstrap_skills_extraDirs.js [--config <path>] [--dry-run]\n\nEnsures OpenClaw config includes:\n  skills.load.extraDirs += ["/home/vtc/clawdbot-workspace/skills_global"]\n`;
}

function resolveConfigPath(args) {
  if (args.configPath) return args.configPath;
  try {
    const out = execFileSync('openclaw', ['config', 'file'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) return out;
  } catch {}
  if (process.env.OPENCLAW_CONFIG_PATH) return process.env.OPENCLAW_CONFIG_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw');
  return path.join(stateDir, 'openclaw.json');
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return die(usage(), 0);

  const sharedDir = '/home/vtc/clawdbot-workspace/skills_global';
  if (!fs.existsSync(sharedDir)) {
    die(`Shared skills dir does not exist: ${sharedDir}`);
  }

  const configPath = resolveConfigPath(args);
  const env = { ...process.env, OPENCLAW_CONFIG_PATH: configPath };

  if (!fs.existsSync(configPath)) {
    die(`Config not found: ${configPath}`);
  }

  // Backup config file (belt and suspenders)
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${configPath}.bak.${ts}.${crypto.randomBytes(4).toString('hex')}`;
  await fsp.copyFile(configPath, backupPath);

  // Snapshot existing value for rollback
  let before;
  try {
    before = openclawGet('skills.load.extraDirs', env);
  } catch {
    before = null;
  }

  const beforeArr = Array.isArray(before) ? before : [];
  const already = beforeArr.some(p => String(p) === sharedDir);
  const afterArr = already ? beforeArr : [...beforeArr, sharedDir];

  const summary = {
    configPath,
    backupPath,
    change: already ? 'no-op' : 'append',
    extraDirsBefore: beforeArr,
    extraDirsAfter: afterArr,
  };

  if (args.dryRun) {
    process.stdout.write(`[DRY RUN] ${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  try {
    openclawSet('skills.load.extraDirs', afterArr, env);
  } catch (e) {
    // rollback
    try { openclawSet('skills.load.extraDirs', beforeArr, env); } catch {}
    die(`Failed to set skills.load.extraDirs; rolled back. Backup at ${backupPath}\nError: ${e.message || e}`);
  }

  process.stdout.write(
    `Bootstrap complete.\n` +
    `- config: ${configPath}\n` +
    `- backup: ${backupPath}\n` +
    `- skills.load.extraDirs now includes: ${sharedDir}\n\n` +
    `Next: restart gateway (openclaw gateway restart) or start a fresh session to reload skills.\n`
  );
}

main().catch(e => die(e?.stack || String(e)));
