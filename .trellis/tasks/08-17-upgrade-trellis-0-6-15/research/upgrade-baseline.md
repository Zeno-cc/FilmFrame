# Trellis 0.6.15 Upgrade Baseline

## Observed State

- Date inspected: 2026-08-17.
- Branch: `codex/fix-invite-immediate-start`.
- Installed CLI: Trellis 0.6.15.
- Project version record: Trellis 0.6.15.
- Updater result: `trellis update --dry-run` reports `Already up to date!` and latest npm version 0.6.15.
- Conflict sidecars: none found.
- Diff hygiene: `git diff --check` produced no findings.
- Upgrade diff before task artifacts: 21 managed files, 600 insertions, 184 deletions, all under `.trellis/`, `.codex/`, and `.agents/`.

## Change Groups

- Active-task and path resolution: generalized shell tickets, audited platform session identifiers, canonical in-repository task references, and safer session-pointer handling.
- Task/context helpers: task lookup, context display/validation, create-time active-task behavior, and task utility normalization.
- Session context: bounded Git probes and updated task/session reporting.
- Codex integration: UTF-8 Hook input, host detection order, repository fallback, expanded sub-agent name parsing, task-path containment, and scoped check-agent fixes.
- Workflow guidance: explicit change boundaries, scope discipline, DeepSeek Harness inline routing, and refreshed Trellis meta documentation.
- Managed metadata: version and template hashes updated by the 0.6.15 updater.

## Planning Constraints

- Treat local generated files as authoritative for this project; do not edit global npm caches or upstream source.
- Keep project-specific conventions out of bundled skills that future updates replace.
- Preserve the complete managed update unless a concrete local failure identifies a defective file.
- Verification is limited to supported local Codex and deterministic runtime behavior; do not build an exhaustive cross-platform test harness.
