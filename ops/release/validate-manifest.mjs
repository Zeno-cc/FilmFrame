#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { canonicalJson, validateManifest } from "./lib/manifest-contract.mjs";

const { file, checkCanonical } = parseArguments(process.argv.slice(2));
const source = await readFile(file, "utf8");
let manifest;

try {
  manifest = JSON.parse(source);
} catch (error) {
  fail(`manifest is not valid JSON: ${error.message}`);
}

const errors = validateManifest(manifest);
if (checkCanonical && source !== canonicalJson(manifest)) {
  errors.push("manifest bytes are not in FilmFrame canonical JSON form");
}
if (errors.length > 0) {
  fail(`invalid release manifest:\n- ${errors.join("\n- ")}`);
}

console.log(`Validated trusted release manifest ${manifest.version}.`);

function parseArguments(args) {
  let file = "";
  let checkCanonical = false;
  for (const argument of args) {
    if (argument === "--check-canonical") {
      checkCanonical = true;
    } else if (!file && !argument.startsWith("-")) {
      file = argument;
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  if (!file) fail("usage: validate-manifest.mjs <manifest.json> [--check-canonical]");
  return { file, checkCanonical };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
