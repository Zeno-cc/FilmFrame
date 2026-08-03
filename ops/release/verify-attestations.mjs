#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  RELEASE_TRUST,
  canonicalJson,
  validateManifest,
} from "./lib/manifest-contract.mjs";

const [manifestPath, bundlePath, ...extra] = process.argv.slice(2);
if (!manifestPath || !bundlePath || extra.length > 0) {
  fail("usage: verify-attestations.mjs <manifest.json> <deploy-bundle.tar.gz>");
}

const manifestSource = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestSource);
const errors = validateManifest(manifest);
if (manifestSource !== canonicalJson(manifest)) {
  errors.push("manifest bytes are not in FilmFrame canonical JSON form");
}
const bundle = await readFile(bundlePath);
const bundleSha256 = createHash("sha256").update(bundle).digest("hex");
if (bundleSha256 !== manifest.deployBundle?.sha256) {
  errors.push("deploy bundle checksum does not match the manifest");
}
if (errors.length > 0) fail(`artifact contract failed:\n- ${errors.join("\n- ")}`);

verifyWithGitHub(manifestPath, false);
verifyWithGitHub(bundlePath, false);
verifyWithGitHub(`oci://${manifest.images.filmframe}`, true);
verifyWithGitHub(`oci://${manifest.images.access}`, true);
console.log(`Verified signed FilmFrame release ${manifest.version}.`);

function verifyWithGitHub(subject, fromOci) {
  const signerWorkflow = `${RELEASE_TRUST.repository}/${RELEASE_TRUST.workflow}`;
  const args = [
    "attestation",
    "verify",
    subject,
    "--repo",
    RELEASE_TRUST.repository,
    "--signer-workflow",
    signerWorkflow,
    "--source-ref",
    manifest.provenance.ref,
    "--source-digest",
    manifest.commit,
    "--cert-oidc-issuer",
    RELEASE_TRUST.issuer,
    "--deny-self-hosted-runners",
  ];
  if (fromOci) args.push("--bundle-from-oci");
  const result = spawnSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) fail(`cannot run GitHub attestation verifier: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`GitHub attestation verification failed for ${safeSubject(subject)}`);
  }
}

function safeSubject(subject) {
  return subject.startsWith("oci://") ? subject : "release artifact";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
