# Memory + Workspace Governance Spec (v1)

Status: **Draft**  
Owner: Human admin (走路草)  
Last updated: 2026-03-03

This spec defines a **4-phase global governance model** plus a **single memory pool** (memory-lancedb-pro) segmented by **semantic namespaces** to prevent cross-workspace contamination.

---

## 0) Goals / Non-goals

### Goals
- Prevent **cross-workspace memory contamination** when switching Discord channels.
- Ensure **Global rules cannot be polluted by LLM hallucinations**.
- Keep operations **machine-friendly** (static routing, deterministic filters) while being **human-maintainable** (readable workspace keys, debuggable logs).
- Maintain **SSOT (Single Source of Truth)**: Markdown in repo is the canonical source; RAG vector memory is a synchronized index.

### Non-goals
- This spec does not define the complete OpenClaw `openclaw.json` schema; it defines required *behavior* and *constraints*. Implementation may adapt field names.

---

## 1) Terms

- **Workspace**: a human-defined scope of work, mapped from an inbound Discord channel at provision time.
- **workspaceKey**: a human-readable identifier for a workspace (e.g., `ws_frontend`). Used as the canonical namespace key.
- **Global**: cross-workspace reusable rules and abstractions.
- **memory-lancedb-pro**: long-term memory backend (vector/hybrid retrieval). Treated as *indexable storage*, not SSOT.
- **SSOT repo**: Markdown files in the repo (e.g., `global_rules/`) are authoritative.
- **Proposal**: a Markdown document staged for global adoption at `global_staging/proposals/`.

---

## 2) Governance Model: 4 Phases

### Phase 1 — Draft (Local-first)
- Create/iterate rules within a single workspace.
- Store details in workspace files + `ws/<workspaceKey>/*` memory.

### Phase 2 — Staging (Global candidate)
- Extract reusable abstractions into **Proposal Markdown** under `global_staging/proposals/`.
- Not readable by non-admin agents as “global truth”.

### Phase 3 — Release (Global adoption)
- After human approval, move proposal to `global_rules/`.
- Synchronize content to `global/*` in memory.

### Phase 4 — Enforcement (Sustained compliance)
- Enforce routing, write locks, approval gates.
- Provide auditability, idempotency, and deprecation/replace paths.

---

## 3) Semantic Routing via Provision (Static Binding)

### 3.1 Core rule
At **provision time**, the system must write a static mapping in `openclaw.json` that binds:

- **Discord channel id** → **workspaceKey** (+ optionally `agentId`)

This mapping is the *single canonical route* used to select memory namespaces and policies for inbound messages.

### 3.2 Example binding (conceptual)
```json5
{
  bindings: [
    {
      match: { channel: "discord", peer: { kind: "channel", id: "1478249411174858835" } },
      agentId: "agent_frontend",
      workspaceKey: "ws_frontend"
    }
  ]
}
```

### 3.3 Constraints enforced by `/provision`

#### (A) Regex naming rule
`workspaceKey` MUST match:

- `^ws_[a-z0-9]+(_[a-z0-9]+)*$`

Rationale: avoid casing/special-char/CJK issues in namespaces, paths, filters, and logs.

#### (B) Absolute uniqueness
Unless explicitly configured to share a workspace across multiple channels:

- A Discord channel MUST NOT be bound more than once.
- A workspaceKey MUST NOT be bound to multiple channels.

#### (C) Auditable output
Provision MUST log/emit:
- channel id
- workspaceKey
- agentId (if used)
- timestamp
- operator (human/admin)

---

## 4) Memory Namespacing & Access Policy

### 4.1 Single memory pool, segmented by namespace
All long-term memory is stored in one physical pool, but logically partitioned by prefixes.

Required namespaces:
- `ws/<workspaceKey>/*` — workspace-local long-term memory
- `global/*` — globally released rules (post-approval only)
- `global_staging/*` — optional internal index for staging (NOT a truth source)

**Note**: In v1, the primary staging artifact is a *repo Markdown proposal* (see §5). `global_staging/*` in memory is optional and must not be readable by non-admin agents.

### 4.2 Recall filter (default)
For any non-admin agent handling inbound messages for a given `workspaceKey`:

- MUST apply allow filter:
  - `global/*`
  - `ws/<workspaceKey>/*`

- MUST NOT read:
  - `ws/<other_ws>/*`
  - `global_staging/*`

### 4.3 Store policy (default)
For any non-admin agent:
- Normal conversation writes + lesson extraction writes MUST be limited to:
  - `ws/<workspaceKey>/*`

- Attempted writes to `global/*` MUST be blocked.

---

## 5) Global Memory Governance: PR Gate + Dual-Storage Sync

### 5.1 Write-lock rule
- **No non-admin agent** may write to `global/*`.
- Global candidates MUST become repo proposals first.

### 5.2 SSOT: Markdown in repo
- SSOT is Markdown in repo; **PDF is disallowed** for global rules.
- Proposals MUST be Markdown files stored at:
  - `global_staging/proposals/`

### 5.3 Proposal format (frontmatter)
Each proposal file MUST begin with YAML frontmatter:

```yaml
---
id: pr_<unix_ts>_<workspaceKey>_<slug>
scope: global_staging
source_workspace: <workspaceKey>
source_channels: ["<discord_channel_id>"]
status: draft  # draft|ready|approved|rejected|merged
supersedes: [] # optional list of prior ids
tags: []       # e.g. ["memory-governance", "routing"]
---
```

Body guidelines:
- State the rule/principle precisely.
- Provide examples and counterexamples.
- List constraints, risk notes, and any migration steps.

### 5.4 Human-in-the-loop approval
- Approval requires an explicit human command (example):
  - `/approve pr_1710001122_ws_frontend`

No implied approval.

### 5.5 Admin-agent responsibilities
Admin-agent is the only actor allowed to:
- read proposals
- perform merge/move into `global_rules/`
- write to `global/*` memory

### 5.6 Atomic “Approve” operation (must be idempotent)
On approve of proposal `id`:

**Action A (Repo move):**
- Move proposal Markdown into `global_rules/` (or merge content into an existing global rule doc).

**Action B (Index sync):**
- Chunk + vectorize the same Markdown content.
- Upsert into memory-lancedb-pro under namespace `global/*` with:
  - `doc_id = <proposal id>`
  - metadata including `tags`, `supersedes`, `source_workspace`, `approved_at`

**Idempotency requirements:**
- Re-running approve MUST NOT create duplicates.
- If A succeeds but B fails, system MUST record a recoverable state (e.g., `merge_pending_index`) and allow safe retry.

---

## 6) Deprecation / Replacement (Global lifecycle)

To prevent global memory from accumulating obsolete rules, provide symmetric operations:

- `/deprecate <rule_id>`
  - repo: mark deprecated (or move to archive)
  - memory: mark deprecated tag and/or remove from active retrieval set

- `/replace <old_id> <new_id>`
  - repo: add `supersedes`/replacement note
  - memory: ensure retrieval prefers new_id; old_id is deprecated

Retrieval SHOULD prioritize:
- newest non-deprecated rules
- rules with explicit precedence metadata

---

## 7) Security / Safety Notes

- Never store secrets (tokens, private keys, credentials) in:
  - repo proposals
  - global rules
  - memory namespaces

- All routing/memory scoping MUST be deterministic and based on provisioned bindings, not LLM guesses.

---

## 8) Implementation Checklist (v1)

Provision:
- [ ] Add `/provision` workflow that writes/updates static bindings in `openclaw.json`.
- [ ] Enforce workspaceKey regex.
- [ ] Enforce uniqueness constraints.

Runtime enforcement:
- [ ] Default recall filter: allow `global/*` + `ws/<workspaceKey>/*`.
- [ ] Write lock: block `global/*` writes for non-admin.

Governance:
- [ ] Proposal directory + frontmatter schema.
- [ ] Admin approve flow triggers atomic repo move + index sync.
- [ ] Idempotent upsert via `doc_id`.
- [ ] Deprecate/replace flows.

---

## 9) Open Questions (track explicitly)

- Exact `openclaw.json` schema fields for bindings/routing.
- How admin approval command is captured (Discord slash command vs repo label vs comment).
- Chunking strategy for Markdown (heading-based vs token window) and metadata standard.
