import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

const ENTRY_KINDS = new Set([
  "code",
  "profile",
  "spectral-data",
  "test-baseline",
  "image",
  "font",
  "dependency",
]);
const RIGHT_STATUSES = new Set(["verified", "owner-review", "unresolved"]);
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

export function validateProvenanceManifest(value) {
  const errors = [];
  if (!isRecord(value)) return ["manifest must be an object"];
  exactKeys(value, ["manifestVersion", "projectDistribution", "entries"], "manifest", errors);
  if (value.manifestVersion !== 1) errors.push("manifestVersion must equal 1");
  validateDistribution(value.projectDistribution, errors);
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    errors.push("entries must be a non-empty array");
    return errors;
  }
  const ids = new Set();
  for (const [index, entry] of value.entries.entries()) {
    const prefix = `entries[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    exactKeys(entry, [
      "id", "kind", "source", "upstreamPath", "license", "attribution",
      "rightsStatus", "noticePath", "modifications", "localPaths", "evidence",
    ], prefix, errors);
    if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) {
      errors.push(`${prefix}.id must be a lowercase kebab-case identifier`);
    } else if (ids.has(entry.id)) {
      errors.push(`${prefix}.id must be unique`);
    }
    ids.add(entry.id);
    if (!ENTRY_KINDS.has(entry.kind)) errors.push(`${prefix}.kind is not supported`);
    if (!RIGHT_STATUSES.has(entry.rightsStatus)) {
      errors.push(`${prefix}.rightsStatus must be verified, owner-review, or unresolved`);
    }
    if (typeof entry.license !== "string" || !entry.license) {
      errors.push(`${prefix}.license must be a non-empty SPDX expression or explicit unresolved status`);
    }
    for (const field of ["attribution", "noticePath", "modifications", "evidence"]) {
      if (typeof entry[field] !== "string" || !entry[field]) {
        errors.push(`${prefix}.${field} must be a non-empty string`);
      }
    }
    for (const field of ["upstreamPath", "noticePath"]) {
      if (typeof entry[field] !== "string" || hasUnsafePath(entry[field])) {
        errors.push(`${prefix}.${field} must be repository-relative`);
      }
    }
    if (!Array.isArray(entry.localPaths)) {
      errors.push(`${prefix}.localPaths must be an array; use an empty array when no local bytes are imported`);
    } else {
      const localPaths = new Set();
      for (const [pathIndex, local] of entry.localPaths.entries()) {
        const localPrefix = `${prefix}.localPaths[${pathIndex}]`;
        if (!isRecord(local)) {
          errors.push(`${localPrefix} requires a safe path and SHA-256 digest`);
          continue;
        }
        exactKeys(local, ["path", "sha256"], localPrefix, errors);
        if (typeof local.path !== "string" || hasUnsafePath(local.path) ||
            typeof local.sha256 !== "string" || !SHA256.test(local.sha256)) {
          errors.push(`${localPrefix} requires a safe path and SHA-256 digest`);
        } else if (localPaths.has(local.path)) {
          errors.push(`${localPrefix}.path must be unique within the entry`);
        }
        localPaths.add(local.path);
      }
    }
    if (!isRecord(entry.source)) {
      errors.push(`${prefix}.source requires a GitHub repository URL and pinned 40-character revision`);
    } else {
      exactKeys(entry.source, ["url", "revision"], `${prefix}.source`, errors);
      if (typeof entry.source.url !== "string" ||
          !/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(entry.source.url) ||
          typeof entry.source.revision !== "string" || !COMMIT.test(entry.source.revision)) {
        errors.push(`${prefix}.source requires a GitHub repository URL and pinned 40-character revision`);
      }
    }
  }
  return errors;
}

export function getDistributionBlockers(manifest, acceptedEntries = new Set()) {
  const blockers = [];
  if (manifest.projectDistribution?.rightsStatus !== "verified") {
    blockers.push("project distribution rights have not been verified");
  }
  if (manifest.projectDistribution?.correspondingSource?.status !== "ready") {
    blockers.push("corresponding-source distribution is not ready");
  }
  for (const entry of manifest.entries ?? []) {
    if (acceptedEntries.has(entry.id)) continue;
    if (entry.rightsStatus !== "verified") {
      blockers.push(`${entry.id}: ${entry.rightsStatus}`);
    }
    if (entry.kind === "spectral-data" && entry.license.toUpperCase() === "NOASSERTION") {
      blockers.push(`${entry.id}: spectral-data license is unresolved`);
    }
  }
  return blockers;
}

export async function verifyLocalDigests(manifest, root) {
  const errors = [];
  const resolvedRoot = await realpath(root);
  for (const entry of manifest.entries ?? []) {
    for (const local of entry.localPaths ?? []) {
      const filePath = path.resolve(root, local.path);
      try {
        if ((await lstat(filePath)).isSymbolicLink()) {
          errors.push(`${local.path}: symbolic links are not accepted`);
          continue;
        }
        const resolvedPath = await realpath(filePath);
        if (path.relative(resolvedRoot, resolvedPath).split(path.sep).includes("..") ||
            path.isAbsolute(path.relative(resolvedRoot, resolvedPath))) {
          errors.push(`${local.path}: resolved file is outside the repository or traverses a symbolic link`);
          continue;
        }
        const file = await open(filePath, "r");
        try {
          if (!(await file.stat()).isFile()) {
            errors.push(`${local.path}: not a regular file`);
          } else {
            const digest = createHash("sha256").update(await file.readFile()).digest("hex");
            if (digest !== local.sha256) errors.push(`${local.path}: SHA-256 mismatch`);
          }
        } finally {
          await file.close();
        }
      } catch {
        errors.push(`${local.path}: cannot read local file`);
      }
    }
  }
  return errors;
}

function validateDistribution(value, errors) {
  if (!isRecord(value)) {
    errors.push("projectDistribution must be an object");
    return;
  }
  exactKeys(value, ["license", "rightsStatus", "correspondingSource", "notes"], "projectDistribution", errors);
  if (value.license !== "GPL-3.0-or-later") errors.push("projectDistribution.license must be GPL-3.0-or-later");
  if (!["owner-review", "verified"].includes(value.rightsStatus)) {
    errors.push("projectDistribution.rightsStatus must be owner-review or verified");
  }
  if (typeof value.notes !== "string" || !value.notes) errors.push("projectDistribution.notes is required");
  const source = value.correspondingSource;
  if (!isRecord(source)) {
    errors.push("projectDistribution.correspondingSource requires status, URL and notes");
    return;
  }
  exactKeys(source, ["status", "url", "notes"], "projectDistribution.correspondingSource", errors);
  if (!["planned", "ready"].includes(source.status) ||
      typeof source.url !== "string" || !source.url || typeof source.notes !== "string" || !source.notes) {
    errors.push("projectDistribution.correspondingSource requires status, URL and notes");
  }
}

function hasUnsafePath(value) {
  return value.length === 0 || value.includes("\0") || path.posix.normalize(value) !== value ||
    path.isAbsolute(value) || value.includes("\\") || value.split("/").includes("..");
}

function exactKeys(value, expected, prefix, errors) {
  for (const key of Object.keys(value)) {
    if (!expected.includes(key)) errors.push(`${prefix}.${key} is not an allowed field`);
  }
  for (const key of expected) {
    if (!(key in value)) errors.push(`${prefix}.${key} is required`);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
