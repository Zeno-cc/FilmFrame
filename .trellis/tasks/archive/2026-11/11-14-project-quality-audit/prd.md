# 全项目质量审查与确定性修复

## Goal

Review all first-party runtime, build, operations and test code for reproducible defects, inconsistent contracts, inefficient paths and obsolete implementation. Fix only evidence-backed issues with tests; preserve unrelated work and list decisions requiring owner review.

## Scope

- Browser workflow, React state, async ownership, accessibility and local-only privacy.
- Canvas, Worker, CPU/WebGL2, spectral/physical rendering and resource lifecycle.
- Access service, authentication/session boundaries, SQLite and reverse proxy.
- Release, updater, backup, deployment, provenance and build/test tooling.
- Dependencies, public runtime assets and maintained documentation.

Exclude `node_modules`, build output, browser caches and downloaded third-party checkouts from source edits. Existing uncommitted changes are inputs to preserve, not permission to rewrite or revert them.

## Requirements

- Establish a current test/build baseline before attributing defects to this audit.
- Partition review into independently verifiable frontend, imaging, backend/operations and dependency/documentation areas.
- Verify each high/medium finding against actual call paths and reachable data. Do not report speculative concerns as confirmed bugs.
- Fix only small, evidence-backed defects with focused regression tests. Preserve public contracts, local-only photo processing, existing recipes and rollback behavior.
- List legal/licensing, product-design, native-parity, broad refactoring, destructive cleanup and performance changes lacking measurements for owner review.
- Do not commit, push, deploy or publish. Do not delete user artifacts or existing uncommitted work.

## Acceptance Criteria

- [x] Every source area has a recorded review conclusion or explicit coverage limitation.
- [x] Confirmed defects selected for repair have regression tests and focused passing checks.
- [x] Final full frontend/access checks, affected operations checks and browser regression run against the resulting tree.
- [x] An independent review verifies repairs and remaining findings.
- [x] Final report separates verified fixes, open confirmed issues, measured limitations and decisions requiring owner review.
- [x] No release/right clearance or full native SpektraLab parity is implied by this audit.
- [ ] No release/right clearance or full native SpektraLab parity is implied by this audit.
