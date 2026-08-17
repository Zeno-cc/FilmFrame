# Implementation Plan: Trellis 0.6.15 Local Upgrade Validation

## Change Boundary

The 0.6.15 generated update already exists in the working tree. Implementation consists of reviewing and validating those exact managed files. Do not touch FilmFrame application code, global packages, or template hashes manually. Only repair a changed Trellis/Codex file when a concrete validation failure identifies it as the owner.

## Steps

1. Reconfirm the active task, project version, installed CLI version, changed-file list, absence of `.new` conflict sidecars, and `trellis update --dry-run` result.
2. Review the complete upgrade diff by surface: task/path resolution, session context, Codex hooks/agent prompt, workflow/skills/docs, and generated metadata. Check for project-local content accidentally overwritten by the generated update.
3. Parse every changed `.py` file without producing bytecode. Repair only syntax/import defects that occur in the supported local execution path.
4. Run task and context smoke checks:
   - `python3 ./.trellis/scripts/task.py current --source`
   - `python3 ./.trellis/scripts/task.py validate .trellis/tasks/08-17-upgrade-trellis-0-6-15`
   - `python3 ./.trellis/scripts/get_context.py`
   - `python3 ./.trellis/scripts/get_context.py --mode phase`
   - `python3 ./.trellis/scripts/get_context.py --mode packages`
5. Run a side-effect-free resolver probe showing that this task resolves canonically and traversal/out-of-repository candidates return no path. Do not use `task.py start` for the rejected candidate.
6. Run targeted local payload smoke probes for the changed Codex workflow-state and sub-agent-context hooks. Require clean execution and evidence that the current planning task is selected where the hook event supports it.
7. Re-run `trellis update --dry-run` and `git diff --check`. Inspect `git status --short` to confirm the final diff contains only the 0.6.15 managed update plus this Trellis task/session record.
8. Load `trellis-check` for the full-scope Phase 2.2 review. Fix mechanical, in-scope findings and repeat affected checks; report design or out-of-scope findings without silently widening the task.
9. Record validation results and any deferred live-host checks, then proceed through Trellis finish/spec/commit steps only after the quality gate is green.

## Validation Commands

```bash
trellis --version
trellis update --dry-run
python3 ./.trellis/scripts/task.py current --source
python3 ./.trellis/scripts/task.py validate .trellis/tasks/08-17-upgrade-trellis-0-6-15
python3 ./.trellis/scripts/get_context.py
python3 ./.trellis/scripts/get_context.py --mode phase
python3 ./.trellis/scripts/get_context.py --mode packages
git diff --check
git status --short
```

Python parsing, resolver assertions, and Hook probes will be executed as short read-only/temporary scripts during implementation and reported with their exact commands.

## Risky Files and Rollback Points

- `.trellis/scripts/common/active_task.py` and `.trellis/scripts/common/paths.py`: a bad repair can lose or misresolve the per-session task pointer. Prefer resolver-only probes before any lifecycle mutation.
- `.codex/hooks/inject-subagent-context.py` and `.codex/hooks/inject-workflow-state.py`: malformed output can remove task guidance from later agent turns. Preserve their existing output protocol.
- `.trellis/.template-hashes.json`: generated state; never repair manually. Re-run the updater if drift is real.
- Roll back only a proven defective managed file through a targeted patch. Never reset the working tree or discard unrelated user changes.
