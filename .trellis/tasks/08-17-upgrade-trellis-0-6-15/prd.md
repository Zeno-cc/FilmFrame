# Upgrade Trellis to 0.6.15 and validate workflow

## Goal

Adopt the already-generated local Trellis 0.6.15 runtime and Codex integration update, then demonstrate that the project can continue using its task, context-injection, and quality-check workflow without changing FilmFrame application behavior.

## Background

- The repository records Trellis 0.6.15 in `.trellis/.version`, and the installed CLI also reports 0.6.15.
- `trellis update --dry-run` reports the project is already up to date with the latest npm release and finds no remaining template drift.
- The pre-existing upgrade changes 21 Trellis-managed files (600 insertions and 184 deletions) under `.trellis/`, `.codex/`, and `.agents/`; no FilmFrame business source is part of the upgrade diff.
- The changes cover active-task resolution and path containment, task/context helpers, Git probe timeouts, Codex workflow/sub-agent hooks, check-agent scope discipline, bundled Trellis documentation, workflow routing for DeepSeek Harness, and generated version/hash metadata.
- No `.new` conflict sidecars are present, and `git diff --check` currently reports no whitespace errors.

## Requirements

1. Preserve the complete Trellis-managed 0.6.15 update as one coherent local runtime upgrade; do not selectively revert generated files unless validation identifies a concrete project regression.
2. Confirm supported task references still resolve inside this repository while traversal or out-of-repository references are rejected without changing the active task.
3. Confirm the current Codex session can create, locate, validate, and read a planning task through the updated task and context-loading scripts.
4. Confirm the changed Codex workflow-state and sub-agent hooks remain executable and use the updated platform/session-resolution behavior.
5. Confirm the updated Trellis skills, agent prompt, workflow text, version record, and template hashes are mutually consistent with the installed 0.6.15 CLI.
6. Keep all verification proportional to the supported local collaborator workflow. Do not add security scaffolding, compatibility layers, feature flags, hashes, or speculative fallback behavior.
7. If validation exposes a mechanical defect in the generated update, repair only the owning Trellis/Codex file and record why. Escalate any design-level divergence instead of silently widening scope.

## Acceptance Criteria

- [ ] `.trellis/.version`, `trellis --version`, and the update dry-run agree on version 0.6.15, and `trellis update --dry-run` reports no pending changes or conflict sidecars.
- [ ] Every changed Python runtime or Hook file parses successfully.
- [ ] `task.py current --source`, `task.py validate`, and all three required `get_context.py` modes succeed for this task.
- [ ] A supported in-repository task reference resolves to its canonical path, while an out-of-repository/traversal reference is rejected by the resolver without mutating session state.
- [ ] Targeted Hook smoke checks complete without traceback and demonstrate that the current planning task can be selected for workflow/context injection.
- [ ] Review finds no accidental FilmFrame application change and no unrelated Trellis customization outside the 0.6.15 upgrade and this task's planning/session artifacts.
- [ ] `git diff --check` passes after any required repair.
- [ ] The final review documents the commands run, their results, and any intentionally deferred platform-specific live-host checks.

## Out of Scope

- Changing FilmFrame frontend, access service, deployment, or production behavior.
- Modifying the globally installed Trellis package or contributing changes to the upstream Trellis source repository.
- Adding new Trellis features or redesigning the 0.6.15 runtime beyond a concrete defect found during validation.
- Exhaustive live testing on every platform named by Trellis; local Codex execution and deterministic runtime/Hook probes are the acceptance boundary.
- Manually editing `.trellis/.template-hashes.json` beyond retaining the state produced by `trellis update`.
