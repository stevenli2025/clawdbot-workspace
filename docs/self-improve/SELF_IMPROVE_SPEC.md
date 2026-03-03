# Self-Improve (Lesson → ws memory + global PR proposal) — Spec v1

Owner: Human admin (走路草)

## Goal
Provide a manual, high-signal workflow to:
1) Store durable, atomic lessons into **workspace scope** memory (`ws/<workspaceKey>`)
2) Optionally generate **global candidates** as repo proposals under `global_staging/proposals/` (PR gate)

This is designed to be triggered via a **skill** (e.g. `/self-improve`).

## Invariants (hard rules)
- **Never write to global memory** (`scope=global`) from normal agents.
- Lesson output scopes allowed:
  - `ws/<workspaceKey>` (direct memory store)
  - `global_staging` (repo proposal markdown)
- If there are no global candidates, **skip proposal + skip commit**.
- Do not store secrets / tokens / credentials.

## Canonical naming
- `workspaceKey := agentId` (routing already ensures channel→agent)
- ws scope string:
  - `scope = "ws/" + workspaceKey`
  - Example: `ws/ws_frontend`

## Command semantics

### `/lesson`
- Purpose: store **two-layer** atomic memories into `ws/<workspaceKey>`.
- Output requirements:
  - 2 entries total:
    - Technical layer (category=fact, importance>=0.80)
    - Principle layer (category=decision, importance>=0.85)
  - Each entry < 500 chars.
  - After storing, run `memory_recall` to verify retrievability.

### `/self-improve`
- A governance-aware wrapper that **uses the /lesson strategy** and then optionally prepares global proposals.

Steps:
1) Run the same two-layer extraction as `/lesson` and store to `scope=ws/<workspaceKey>`.
2) Determine if any content is reusable globally.
   - If yes: generate 1..N proposal markdown files under `global_staging/proposals/`.
   - If no: do nothing for global.

## Proposal format (required)
Each proposal must be a Markdown file with YAML frontmatter:

```markdown
---
id: pr_<unix_ts>_<workspaceKey>_<slug>
scope: global_staging
source_workspace: <workspaceKey>
source_channels: ["<discord_channel_id>"]
status: draft
supersedes: []
tags: []
---

# <Title>

## Rule / Principle
...

## Rationale
...

## Examples
...

## Risks / Non-goals
...

## Migration
...
```

## Merge & Global release
- Only after human approval + PR merge:
  - Move proposal into `global_rules/` (SSOT)
  - Then (admin-only) sync chunks into LanceDB Pro with `scope=global`

