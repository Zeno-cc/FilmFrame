# Trusted releases

FilmFrame releases are created only by `.github/workflows/release.yml` from a
stable `vMAJOR.MINOR.PATCH` tag in `Zeno-cc/FilmFrame`. The workflow builds the
static and Access images once, pushes version tags to GHCR, records their
immutable digests, creates a minimal deploy bundle, and publishes a canonical
manifest. It does not publish `latest`.

## Preparing a release

1. Update both package versions and `release-input.json` to the same stable
   version.
2. Set `database.schemaTo` to the latest migration and describe the compatible
   source schema in `database.schemaFrom`.
3. Keep `backwardCompatible` true only when the previous Access release can run
   against the migrated schema. Otherwise the release is not eligible for the
   one-click updater.
4. Add one to six concise Chinese summary entries. Plaintext, URLs, HTML, and
   non-Chinese-only summaries are rejected.
5. Run `npm run verify:provenance` and resolve every reported distribution
   blocker with owner/legal evidence. An item that cannot be rights-verified can
   still ship only if the owner records a dated risk acceptance that names it:
   the acceptance belongs in `NOTICE`, in the `evidence` field of that manifest
   entry and in `ops/provenance/README.md`, and the item must keep appearing in
   the validator output. Successful schema/hash validation is not a legal
   clearance. See `ops/provenance/README.md`.
6. Run `npm run check:release`, the reusable technical pre-tag gate for release
   input and contracts, provenance consistency, frontend/Access, updater,
   desktop browsers, backup, access proxy, and deployment configuration. This
   gate exits successfully when valid provenance records still carry recorded
   owner-accepted items. Do not create or push a stable tag until step 5 is
   resolved or covered by that recorded owner acceptance; a successful technical
   gate alone does not authorize distribution.
7. Fetch the live remote and verify the release commit is contained in
   canonical `main`. Do not select a tag target from a stale tracking ref.
8. Create and push the protected tag. Do not rerun a release by moving a tag.

The trusted tag workflow fetches `origin/main` again and rejects a tagged SHA
outside canonical `main` before installing dependencies or publishing. Repair
lineage only through an ordinary fast-forward or the protected-branch review
path; never force-push `main` or move an existing stable tag. Pull requests and
pushes to `main` run the same reusable gate in read-only CI, but only a stable
tag can enter the publication steps below.

The repository must protect version tags and restrict changes to the release
workflow. GitHub Actions uses OIDC artifact attestations; no signing key is
stored in repository secrets.

## Verification contract

The host updater downloads the fixed manifest and bundle for the selected
GitHub Release and verifies them through its Python `GitHubAttestationVerifier`.
The release workflow and manual artifact checks use this equivalent verifier
with access to GitHub and GHCR:

```bash
node ops/release/verify-attestations.mjs \
  filmframe-release-manifest.json \
  filmframe-deploy-1.0.0.tar.gz
```

This command first validates the canonical manifest and bundle checksum, then
uses `gh attestation verify` for the manifest, bundle, and both OCI image
digests. It pins all cryptographic identity inputs independently of claims in
the manifest:

- repository `Zeno-cc/FilmFrame`;
- signer workflow `Zeno-cc/FilmFrame/.github/workflows/release.yml`;
- Git tag ref from the validated version;
- full source commit from the validated manifest;
- GitHub Actions OIDC issuer;
- GitHub-hosted runner requirement.

The updater must fail closed if GitHub, GHCR, authentication, attestation, or
checksum verification fails. The manifest's `provenance` object is display and
contract metadata; it is never accepted as proof without the signed
attestation verification above.

The deploy bundle contains `compose.yaml`, `.env.example`, and the existing
`ops/backup` scripts and systemd units. The backup files must remain below the
`current` symlink after cutover because both the timer and updater reuse them.
Production `.env` and the SQLite named volume are preserved by the host updater
and never enter a release artifact.
