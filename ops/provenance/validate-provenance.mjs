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
if (errors.length > 0) fail(`invalid provenance manifest:\n- ${errors.join("\n- ")}`);
const digestErrors = await verifyLocalDigests(manifest, root);
if (digestErrors.length > 0) fail(`invalid provenance manifest:\n- ${digestErrors.join("\n- ")}`);

const notice = await readFile(path.join(root, "NOTICE"), "utf8");
const [, decisionDate, recordedRisk = ""] = notice.match(
  /^Recorded residual risk \(owner decision, (\d{4}-\d{2}-\d{2})\)\r?\n-+\r?\n([\s\S]*)/m,
) ?? [];
const acceptedEntries = manifest.entries.filter((entry) =>
  entry.rightsStatus === "unresolved" &&
  decisionDate &&
  recordedRisk.includes("\x60" + entry.id + "\x60") &&
  entry.evidence.includes(`Owner risk acceptance recorded ${decisionDate} in NOTICE`),
);
const blockers = getDistributionBlockers(manifest, new Set(acceptedEntries.map(({ id }) => id)));
if (blockers.length > 0) fail(`unapproved distribution blockers:\n- ${blockers.join("\n- ")}`);

const residual = getDistributionBlockers({ ...manifest, entries: acceptedEntries });
console.log(`Validated ${manifest.entries.length} provenance entries and local SHA-256 digests.`);
if (residual.length > 0) {
  console.log(`${acceptedEntries.length} entries are not rights-verified and are recorded as owner-accepted residual risk in NOTICE:`);
  for (const finding of residual) console.log(`- ${finding}`);
} else {
  console.log("No recorded provenance distribution blockers; human release review is still required.");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
