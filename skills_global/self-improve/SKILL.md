---
name: self-improve
description: Manual self-improvement: store /lesson into ws scope and (if needed) create global_staging proposals for PR.
user-invocable: true
---

# /self-improve

Use this command when the user (Master) explicitly requests self-improvement / lesson extraction.

## Inputs
Triggered when the user sends `/self-improve`.

## Determine scope
- Let `workspaceKey := current agentId`.
- Workspace scope string: `scope = "ws/" + workspaceKey`.

## Part A — Store ws lessons (same strategy as /lesson)
1) Scan recent context and extract **two** atomic memories:
   - **Technical layer** (category: `fact`, importance >= 0.80):
     `Pitfall: [symptom]. Cause: [root cause]. Fix: [solution]. Prevention: [how to avoid].`
   - **Principle layer** (category: `decision`, importance >= 0.85):
     `Decision principle ([tag]): [behavioral rule]. Trigger: [when]. Action: [what to do].`
2) Store both using `memory_store` with `scope=<ws scope>`.
3) Verify with `memory_recall` using anchor keywords (must retrieve both).

Rules:
- Each entry must be short and atomic (< 500 chars)
- Do not store secrets/tokens/credentials

## Part B — Global candidates (PR gate)
Decide if any extracted insight is **globally reusable** (applies across multiple workspaces).

If YES:
- Write one or more proposal markdown files under:
  - `/home/vtc/clawdbot-workspace/global_staging/proposals/`
- Use the required frontmatter schema (see docs/self-improve/SELF_IMPROVE_SPEC.md).
- Keep proposals focused; avoid workspace-specific details.

If NO:
- Do not create any proposal file.

## Reporting
Reply to Master with a concise summary:
- What was stored to `ws/<workspaceKey>` (2 bullet points)
- Whether a global proposal was created (file path(s) or “skipped”)

