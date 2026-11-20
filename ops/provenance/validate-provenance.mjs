#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDistributionBlockers,
  validateProvenanceManifest,
  verifyLocalDigests,
} from "./lib/provenance-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
if (args.length > 1 || args[0]?.startsWith("-")) fail("usage: validate-provenance.mjs [manifest.json]");
const manifestPath = path.resolve(args[0] ?? path.join(root, "ops/provenance/manifest.json"));

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  fail(`cannot read provenance manifest: ${error.message}`);
}

const errors = validateProvenanceManifest(manifest);
errors.push(...await verifyLocalDigests(manifest, root));
if (errors.length > 0) fail(`invalid provenance manifest:\n- ${errors.join("\n- ")}`);

const blockers = getDistributionBlockers(manifest);
console.log(`Validated ${manifest.entries.length} provenance entries and local SHA-256 digests.`);
if (blockers.length > 0) {
  console.log(`${blockers.length} item(s) are not rights-verified; each one is recorded as owner-accepted residual risk in NOTICE:`);
  for (const blocker of blockers) console.log(`- ${blocker}`);
} else {
  console.log("No recorded provenance distribution blockers; human release review is still required.");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
