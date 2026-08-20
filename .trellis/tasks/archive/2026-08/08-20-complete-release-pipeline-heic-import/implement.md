# Implementation plan: Complete release pipeline and HEIC import

## Ordered checklist

1. Validate the three child planning artifacts and manifests; keep the parent in planning and do not run task.py start here.
2. Start and implement/check 08-20-canonical-main-tag-ancestry first, including release workflow guard, contract test, and documentation.
3. Start and implement/check 08-20-pretag-ci-renderer-fallback next, including the reusable release gate, PR/main CI, and Worker fallback automation.
4. Start and implement/check 08-20-local-heic-heif-import next, including the dependency/lockfile, File-role split, focused tests, and portable Chromium coverage where feasible.
5. Integrate the child branches/commits through the normal repository path and run the affected release-contract, upload, Worker, typecheck/build, and desktop browser checks.
6. Review the final diff for privacy, publication, version, tag, and physical-device boundaries. No version bump, release artifact, deployment, or tag operation is part of this task.
7. Record the final integration candidate SHA. Only as a separate delivery gate, fetch/prune live origin refs and prove origin/main is an ancestor of the candidate.
8. If safe and explicitly authorized later, use ordinary fast-forward/protected-branch delivery; then fetch again and verify the candidate and all existing stable tags are contained in remote main. If ancestry or push safety fails, stop without ref mutation.

## Validation commands

Planning-only validation now:

~~~bash
python3 ./.trellis/scripts/task.py validate 08-20-canonical-main-tag-ancestry
python3 ./.trellis/scripts/task.py validate 08-20-pretag-ci-renderer-fallback
python3 ./.trellis/scripts/task.py validate 08-20-local-heic-heif-import
python3 ./.trellis/scripts/task.py validate 08-20-complete-release-pipeline-heic-import
git diff --check
~~~

Implementation-phase checks are owned by the child implement.md files. The final parent check must include:

~~~bash
npm run test:release-contract
npm run test:upload
npm run typecheck
npm run build
npm run test:e2e
git diff --check
~~~

Do not run physical-device tests. Do not run a main push, tag push, Release creation, deployment, or version bump as part of implementation/check.

## Review gates

- Child order is release contracts/CI, then HEIC import, then fresh remote main reconciliation.
- The parent does not duplicate child implementation or create a fourth abstraction.
- npm run check:release remains the one reusable pre-publication gate, while tag identity and publication remain tag-only.
- HEIC conversion remains local and CSP-compatible; original-versus-render File routing and URL ownership are explicit.
- All automated browser checks are desktop-only; the absence of physical-device evidence is reported rather than implied away.
- No command mutates tags, versions, releases, deployment state, or remote refs during the implementation/check phase.

## Risky files and rollback points

- .github/workflows/release.yml, .github/workflows/ci.yml, and package.json: workflow/gate ordering or permissions regressions can either block legitimate releases or broaden publication scope; child contract tests are the rollback signal.
- services/uploadFiles.ts, services/heicConversion.ts, and App.tsx: incorrect File-role or URL ownership can break EXIF, preview, or rendering; focused upload tests are the rollback signal.
- Root lockfile: a dependency resolution or package-size/license issue requires reverting the HEIC dependency integration as one unit.
- main and stable tags: delivery uses only fresh ancestry/fast-forward evidence; any divergence stops the operation without force-push or tag movement.
