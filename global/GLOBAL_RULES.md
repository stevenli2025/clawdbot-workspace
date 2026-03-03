# GLOBAL_RULES (Shared Across Workspaces)

This file is the **only** shared, cross-workspace policy surface.

## Principles

- Workspaces are isolated: **1 Discord channel = 1 Agent = 1 Workspace = 1 private scope**.
- Do not leak or mix context between workspaces.
- Global memory scope is **not** used for general knowledge. If something must be shared, update this file instead.

## Memory policy

- Default: store long-term memories in the workspace-private scope: `agent:<agentId>`.
- Cross-workspace proposals must go through staging + admin review (no direct writes to global scope).

## Git policy

- Never commit secrets (tokens, API keys).
- `.github_pat` is local-only.
- Do not commit `.openclaw/` state.
