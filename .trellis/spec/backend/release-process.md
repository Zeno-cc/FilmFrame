# Release and Push Process

> Executable contract for versioned pushes and stable FilmFrame updates.

## Scenario: User-Requested Product Push

### 1. Scope / Trigger

Apply this contract whenever the user asks to push product changes to the
FilmFrame remote. A branch-only push is not a completed product release: the
host updater reads the latest stable GitHub Release, not ordinary branches.

### 2. Signatures

```bash
npm run check:release
git tag -a v<version> <commit>
git push origin <branch>
git push origin v<version>
```

The stable release workflow is `.github/workflows/release.yml` and is triggered
only by a pushed `vMAJOR.MINOR.PATCH` tag.

### 3. Contracts

- Increment the SemVer version before each product push. Unless the user
  specifies otherwise, increment the patch component.
- Keep these values identical:
  - root `package.json` → `version`;
  - `server/access/package.json` → `version`;
  - `ops/release/release-input.json` → `version`.
- Push the stable tag for that exact version to the same commit as the release
  changes. Do not move an existing tag.
- Create a stable tag only for a commit contained in the freshly fetched
  canonical `main` history. The trusted workflow re-fetches `origin/main` and
  rejects an off-main tagged SHA before dependency installation or publication.
- Treat `npm run check:release` as the reusable pre-tag quality gate. Pull
  requests and pushes to `main` run the same portable checks with read-only
  permissions; repository/ref/tag/HEAD identity remains tag-workflow-only.
- A formal update is complete only after GitHub Actions creates the immutable
  GitHub Release, canonical manifest, deploy bundle, and versioned GHCR image
  tags. The updater then discovers it through GitHub's `releases/latest` API.
- Do not report a branch-only push as a published update; state clearly when a
  release is still waiting on the tag/workflow.
- Before an upgrade and automatic rollback, verify the stored Canvas budget's
  semantic compatibility with the actual target release, not only its schema
  version. `FIRST_6_GIB_VERSION` in the updater is the fixed capability
  boundary: the published `v1.4.12` tag still caps at 2048 MiB, so the next
  minor candidate is `1.5.0`, which accepts up to 6144 MiB. Never derive this
  boundary from the manifest currently being installed or rolled back;
  changing it requires evidence from the tagged release source and its
  configuration contract.
- A legacy target with a 2048 MiB ceiling must reject a >2048 MiB configuration
  before switching. Never clamp the administrator's setting or report a blocked
  rollback as successful; preserve the current release and surface the
  documented recovery path.
- `recover_previous` is a root-only maintenance action, checked through the
  peer UID at the Unix-server boundary rather than exposed through Access.
  Before clearing a `recovery_required` job, require the actual current
  symlink, previous version/revision, service health, loopback/origin/public
  checks and stored budget to match the previous release. Only then transition
  it to `rolled_back`; do not switch releases, alter configuration, or report
  the failed target as successful. Any rejection retains the recovery lock and
  original error code.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Any of the three version sources differ | Stop before push; synchronize them |
| Version was not incremented from the previous product version | Stop and choose the next SemVer version |
| Release input does not match the pushed tag | Stop; `validate-release-input` must pass with that tag |
| Stable tag commit is not contained in freshly fetched `origin/main` | Stop before dependency installation or publication; reintegrate through an ordinary fast-forward/protected-branch path and never move the tag |
| Product branch pushed without the matching stable tag | Treat as branch delivery only; do not call it a published update |
| Stable tag pushed and workflow fails | Report the failed workflow; do not claim the update is available |
| GitHub Release exists with a canonical manifest and required assets | Formal update is published and eligible for updater discovery |

### 5. Good / Base / Bad Cases

- Good: bump all three version sources from `1.4.7` to `1.4.8`, run release
  gates, push the branch and `v1.4.8`, then confirm the GitHub Release exists.
- Base: push a review branch only when explicitly requested as a non-release
  operation, and label it as not yet discoverable by the updater.
- Bad: push a branch whose files say `1.4.7` and assume the updater will find
  it without a `v1.4.7` tag and GitHub Release.
- Bad: change the package version but leave `release-input.json` unchanged,
  or move a tag after the workflow has published artifacts.

### 6. Tests Required

- Run `npm run check:release` before the tag push. It includes release-input,
  release-contract, frontend/Access, updater, desktop browser, backup,
  access-proxy, and deployment checks.
- Immediately before delivery or tagging, fetch the live remote and prove the
  candidate descends from `origin/main`; stale local tracking refs are not
  sufficient evidence.
- After the network operation, verify the remote tag and GitHub Release expose
  the new version and required manifest/bundle assets.
- Confirm the final branch is clean and record the pushed branch, tag, release,
  and any workflow blocker in the handoff.

### 7. Wrong vs Correct

#### Wrong

```bash
git push origin codex/fix-invite-immediate-start
```

Then claim that the updater can install the new version.

#### Correct

```bash
npm run check:release
git push origin codex/fix-invite-immediate-start
git push origin v1.4.8
```

Then wait for `.github/workflows/release.yml` to create the stable GitHub
Release and verify its assets before claiming the update is available.
