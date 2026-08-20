# Research: Canonical main and tag ancestry

- Query: Restore main as the canonical release line and reject release tags whose commit is not contained in origin/main.
- Scope: mixed (internal repository/Git history and release-contract design; no external network lookup)
- Date: 2026-08-20

## Findings

### Files found

- .github/workflows/release.yml — tag-triggered trusted release workflow; checks the tagged checkout and publishes artifacts.
- ops/release/tests/release-tooling.test.mjs — Node test file containing the existing static release-workflow contract tests.
- ops/release/README.md — release preparation and protected-tag documentation.
- .trellis/spec/backend/release-process.md — executable contract for versioned pushes, tags, and GitHub Releases.
- package.json — release validation/test commands at lines 22 and 30.
- handoff.md, docs/project/current-worktree.md, and docs/project/engineering.md — handoff, stale worktree snapshot, and release-gate documentation.

### Current local Git lineage

Read-only ref inspection on 2026-08-20 found:

- Checked-out branch codex/fix-invite-immediate-start: 1ddb892 (chore: record journal).
- Local main: 8054532, tagged v1.4.4.
- Local origin/main: 96ee214, tagged v1.4.6.
- main..origin/main contains 2 commits; origin/main..HEAD contains 19 commits. origin/main is an ancestor of HEAD, and main is an ancestor of HEAD.
- v1.4.8 -> ca7a10d, v1.4.9 -> ab11b21, v1.4.10 -> 4d9c046, and v1.4.11 -> 12c14af are ancestors of HEAD but are not ancestors of either local main or local origin/main.
- Older local tags through v1.4.6 are contained in origin/main; no local v1.4.7 tag was present.
- The origin/main remote-tracking reflog was last updated by push on August 17, 2026 at 09:58:39 +0800, so it is not proof of the live remote state.

The immediate failure is therefore real: the locally available release tags v1.4.8–v1.4.11 were created on the release branch line, while the canonical remote-tracking main line stopped at v1.4.6.

### Existing release enforcement

- .github/workflows/release.yml:3-6 triggers on pushed vMAJOR.MINOR.PATCH tags only.
- .github/workflows/release.yml:25-28 checks out full history, so ancestry can be evaluated without changing checkout depth.
- .github/workflows/release.yml:39-50 validates repository identity, tag syntax, and exact tagged commit identity (HEAD == GITHUB_SHA), but has no origin/main, merge-base, or is-ancestor check.
- .github/workflows/release.yml:55-74 installs dependencies and runs the expensive release gates; the ancestry check should precede these steps. The publish operation begins at .github/workflows/release.yml:200-215.
- ops/release/README.md:3-7 documents tag-only releases and ops/release/README.md:20-24 requires protected tags, but neither requires the tag commit to be reachable from main.
- .trellis/spec/backend/release-process.md:23-40 requires the stable tag to identify the exact release commit and forbids moving tags. Its validation matrix at lines 42-51 has no main-ancestry condition; lines 64-72 require the release-contract test before a tag push and handoff evidence afterward.
- ops/release/tests/release-tooling.test.mjs:122-138 is the existing static workflow-contract test location. No existing source or test contains git merge-base, git merge-base --is-ancestor, or an origin/main release check.
- package.json:22 exposes npm run test:release-contract; package.json:30 exposes npm run verify:release-input.

### Proposed minimal implementation

Add one early shell step immediately after checkout, before Node setup, or add the same commands at the start of the existing validation step:

    - name: Verify tagged commit is contained in canonical main
      run: |
        set -euo pipefail
        git fetch --no-tags origin main:refs/remotes/origin/main
        if ! git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main; then
          echo "release tag $GITHUB_REF_NAME points to $GITHUB_SHA, which is not contained in origin/main" >&2
          exit 1
        fi

The explicit fetch makes the runner's origin/main current for this run; the GITHUB_SHA check uses the commit already proven to be the tagged checkout by .github/workflows/release.yml:49. Failure occurs before dependency installation, browser setup, artifact construction, image pushes, or GitHub Release publication. No new release script, checksum, wrapper, or feature flag is needed.

Add a focused static regression test beside the existing workflow tests in ops/release/tests/release-tooling.test.mjs that asserts:

1. the workflow fetches origin main without tags;
2. it invokes git merge-base --is-ancestor against GITHUB_SHA and refs/remotes/origin/main; and
3. the ancestry check appears before npm ci / the release gates.

This matches the repository's current workflow-contract testing style. The GitHub runner command remains the authoritative behavior; a static test prevents accidental removal or movement of the guard but does not emulate Actions.

### Restore-main sequencing

Use a refreshed remote-tracking state before selecting a candidate. The current local evidence says a fast-forward candidate exists, but it must be rechecked because origin/main may have changed since August 17:

    git status --short --branch -uall
    git fetch --prune --tags origin
    git rev-parse origin/main
    git merge-base --is-ancestor origin/main <candidate>
    git rev-list --left-right --count origin/main...<candidate>

Then, only if the candidate is the explicitly approved release-line tip and the working tree is suitable:

    git switch main
    git merge --ff-only <candidate>
    git push origin main

The normal push is intentionally non-forcing. Before it, confirm the candidate still descends from the freshly fetched origin/main; if the remote moved or diverged, stop and reselect or reintegrate the candidate rather than force-pushing. If branch protection rejects a direct push, use the repository's normal protected-branch review path; do not bypass it.

The current HEAD is a descendant of origin/main, but it contains 19 commits, including post-v1.4.11 work. Do not blindly fast-forward main to HEAD unless the parent task explicitly accepts every one of those commits as the canonical line. Select and record the exact candidate first.

After the approved fast-forward push, refresh and verify without creating or moving any tag:

    git fetch --prune origin main
    git merge-base --is-ancestor <candidate> origin/main
    for tag in $(git tag --list 'v*.*.*'); do
      commit=$(git rev-parse "$tag^{commit}")
      git merge-base --is-ancestor "$commit" origin/main || {
        echo "$tag ($commit) is not contained in origin/main" >&2
        exit 1
      }
    done
    npm run test:release-contract
    npm run verify:release-input

The ancestry repair itself is a branch push, not a release: the workflow is tag-triggered only (.github/workflows/release.yml:3-6), so pushing main does not create a deployment.

### Rollback points

- Before changing refs, record the refreshed old origin/main SHA and the selected candidate SHA. If the workflow/test change is wrong, fix or revert its ordinary commit before pushing main.
- A local git merge --ff-only is reversible by abandoning the local branch state before push; it does not require rewriting remote history.
- Once main is fast-forward-pushed, do not reset or force-push it. If a correction is needed, add a normal revert/fix commit on main; preserve the old release tags and never move or recreate them.
- If a push is rejected because origin/main advanced, stop at that point and repeat the fresh-remote ancestry check.

### Related specs and external references

- Related spec: .trellis/spec/backend/release-process.md:23-40,42-72.
- Related workflow/test contracts: .github/workflows/release.yml:3-50; ops/release/tests/release-tooling.test.mjs:122-154.
- Internal release docs: ops/release/README.md:3-24; docs/project/engineering.md:55,154-161.
- handoff.md:3-7 and docs/project/current-worktree.md:3-8 are stale July 12 snapshots and explicitly defer live branch/ref truth to git status; they must not determine the candidate.
- External references: none consulted; Git ancestry commands are standard local Git behavior and the report relies on repository-local refs.

## Caveats / Not Found

- No repository-local branch-protection/ruleset configuration was found, so remote permission and protected-branch behavior remain external state.
- A workflow guard only governs runs using the workflow file from the tagged commit. A tag created on an older commit whose workflow predates this guard could still run that older workflow; the supported sequence must land the guard on the canonical main line before future release tags are created. Enforcing historical/off-main tags independent of their committed workflow would require a remote GitHub ruleset or equivalent policy, not another local release validator.
- This research did not create a tag, move a tag, bump a version, deploy, push or force-push any ref, or perform physical-device testing.
