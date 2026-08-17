# Design: Trellis 0.6.15 Local Upgrade Validation

## Boundary

Treat the existing working-tree diff as an upstream-managed runtime snapshot rather than a new project feature. The implementation phase reviews and validates that snapshot in place. It changes a file only when a concrete local failure proves the generated content is unusable in this repository.

The affected surfaces are:

1. **Persistence and task resolution** — `.trellis/scripts/common/{active_task,paths,task_context,task_store,task_utils}.py` and `.trellis/scripts/task.py`.
2. **Session and repository context** — `.trellis/scripts/common/{git,session_context}.py`.
3. **Codex integration** — `.codex/hooks/{inject-subagent-context,inject-workflow-state}.py` and `.codex/agents/trellis-check.toml`.
4. **Workflow guidance** — `.agents/skills/trellis-before-dev/SKILL.md`, `.agents/skills/trellis-check/SKILL.md`, `.trellis/workflow.md`, and refreshed `trellis-meta` references.
5. **Generated state** — `.trellis/.version` and `.trellis/.template-hashes.json`.

FilmFrame application and deployment code remain outside the boundary.

## Runtime Contracts

### Managed-template consistency

The installed CLI, project version record, generated files, and template hash state must describe the same 0.6.15 release. `trellis update --dry-run` is the authoritative local drift check; hashes are not manually recalculated or rewritten.

### Task-reference containment

Task references accepted by public task commands may be a task name, repository-relative task path, or absolute in-repository path. Resolution canonicalizes the candidate and returns no path for anything outside the resolved repository root. Validation uses resolver calls without writing an external `task.json` or replacing the active pointer.

### Session context

The active task remains per-session under `.trellis/.runtime/sessions/`. The current Codex session must continue resolving the newly created planning task through `task.py current --source` and context commands. No global fallback pointer is introduced.

### Hook behavior

Codex hooks continue to read JSON from standard input, detect the repository from the payload/current directory, and use the shared active-task resolver. Smoke probes use representative local payloads and require clean exit plus expected task/workflow context; they do not claim coverage for unavailable third-party hosts.

## Compatibility and Trade-offs

- Keep the short-lived legacy Cursor ticket read path already supplied by 0.6.15; it is bounded compatibility for a supported upgrade transition, not a new migration framework.
- Accept 0.6.15's verified platform/session identifiers and DeepSeek Harness routing as one synchronized template update. Selectively carrying only Codex changes could make generated docs, hooks, and hashes disagree.
- Do not add persistent automated tests solely for this local upgrade when deterministic CLI and resolver probes cover the project-owned integration. If a concrete regression requires a reusable fixture, add the smallest fixture at the owning surface.

## Failure Handling and Rollback

- A syntax or deterministic runtime failure is repaired locally at the owning file, followed by the full validation sequence.
- A mismatch between local generated files and 0.6.15 templates is resolved through `trellis update` behavior, not by hand-editing template hashes.
- A design-level incompatibility is reported before changing workflow semantics. The recoverable rollback point is the Git diff for the affected managed file; unrelated user changes are never reset.
