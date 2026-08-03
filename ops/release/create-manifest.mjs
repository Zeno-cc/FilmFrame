#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalJson,
  createManifest,
} from "./lib/manifest-contract.mjs";

const options = parseArguments(process.argv.slice(2));
const releaseInput = JSON.parse(await readFile(options.input, "utf8"));
const manifest = createManifest({
  releaseInput,
  commit: options.commit,
  publishedAt: options.publishedAt,
  filmframeDigest: options.filmframeDigest,
  accessDigest: options.accessDigest,
  deployBundleSha256: options.deployBundleSha256,
});

await mkdir(path.dirname(options.output), { recursive: true });
await writeFile(options.output, canonicalJson(manifest), { mode: 0o644 });
if (options.notesOutput) {
  await mkdir(path.dirname(options.notesOutput), { recursive: true });
  await writeFile(options.notesOutput, releaseNotes(manifest), { mode: 0o644 });
}
console.log(`Created canonical release manifest ${manifest.version}.`);

function parseArguments(args) {
  const allowed = new Set([
    "input",
    "output",
    "notes-output",
    "commit",
    "published-at",
    "filmframe-digest",
    "access-digest",
    "deploy-bundle-sha256",
  ]);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value) fail("all arguments must be --name value pairs");
    const key = flag.slice(2);
    if (!allowed.has(key) || Object.hasOwn(values, key)) fail(`unknown or repeated argument: ${flag}`);
    values[key] = value;
  }
  for (const required of allowed) {
    if (required !== "notes-output" && !values[required]) fail(`--${required} is required`);
  }
  return {
    input: values.input,
    output: values.output,
    notesOutput: values["notes-output"],
    commit: values.commit,
    publishedAt: values["published-at"],
    filmframeDigest: values["filmframe-digest"],
    accessDigest: values["access-digest"],
    deployBundleSha256: values["deploy-bundle-sha256"],
  };
}

function releaseNotes(manifest) {
  const labels = { feature: "新功能", fix: "修复", security: "安全" };
  const lines = manifest.summaryZh.map(
    (entry) => `- **${labels[entry.kind]}**：${entry.text}`,
  );
  return [
    `# FilmFrame v${manifest.version}`,
    "",
    "## 中文变更摘要",
    "",
    ...lines,
    "",
    `数据库版本：${manifest.database.schemaFrom} → ${manifest.database.schemaTo}`,
    "",
    "本版本通过 GitHub Actions OIDC artifact attestation 签署；生产更新只使用清单中的不可变镜像摘要。",
    "",
  ].join("\n");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
