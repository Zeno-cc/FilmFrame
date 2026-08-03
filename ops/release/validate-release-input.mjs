#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateReleaseInput } from "./lib/manifest-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { file, tag } = parseArguments(process.argv.slice(2));
const [input, rootPackage, accessPackage, migrations] = await Promise.all([
  readJson(path.resolve(file)),
  readJson(path.join(root, "package.json")),
  readJson(path.join(root, "server/access/package.json")),
  readdir(path.join(root, "server/access/migrations")),
]);
const errors = validateReleaseInput(input);

if (input.version !== rootPackage.version) {
  errors.push("release input version must match package.json");
}
if (input.version !== accessPackage.version) {
  errors.push("release input version must match server/access/package.json");
}
if (tag && tag !== `v${input.version}`) {
  errors.push("release tag must exactly match v<release input version>");
}

const migrationVersions = migrations
  .map((name) => /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name))
  .filter(Boolean)
  .map((match) => Number(match[1]));
const latestMigration = Math.max(0, ...migrationVersions);
if (input.database?.schemaTo !== latestMigration) {
  errors.push("database.schemaTo must match the latest committed access migration");
}
if (errors.length > 0) {
  fail(`invalid release input:\n- ${errors.join("\n- ")}`);
}

console.log(`Validated release input ${input.version} at schema ${latestMigration}.`);

function parseArguments(args) {
  let file = "";
  let tag = "";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--tag") {
      tag = args[index + 1] ?? "";
      index += 1;
    } else if (!file && !argument.startsWith("-")) {
      file = argument;
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  if (!file) fail("usage: validate-release-input.mjs <release-input.json> [--tag vX.Y.Z]");
  if (args.includes("--tag") && !tag) fail("--tag requires a value");
  return { file, tag };
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    fail(`cannot read JSON from ${filePath}: ${error.message}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
