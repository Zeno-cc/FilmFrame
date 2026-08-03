export const RELEASE_TRUST = Object.freeze({
  issuer: "https://token.actions.githubusercontent.com",
  repository: "Zeno-cc/FilmFrame",
  workflow: ".github/workflows/release.yml",
});

export const IMAGE_NAMES = Object.freeze({
  filmframe: "ghcr.io/zeno-cc/filmframe/filmframe",
  access: "ghcr.io/zeno-cc/filmframe/access",
});

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SUMMARY_KINDS = new Set(["feature", "fix", "security"]);

export function canonicalJson(value) {
  return `${JSON.stringify(sortJson(value))}\n`;
}

export function validateReleaseInput(value) {
  const errors = [];
  if (!isRecord(value)) return ["release input must be an object"];

  exactKeys(
    value,
    ["version", "minUpdaterVersion", "database", "summaryZh"],
    "release input",
    errors,
  );
  semver(value.version, "version", errors);
  semver(value.minUpdaterVersion, "minUpdaterVersion", errors);
  validateDatabase(value.database, value.version, errors);
  validateSummary(value.summaryZh, errors);
  return errors;
}

export function validateManifest(value) {
  const errors = [];
  if (!isRecord(value)) return ["manifest must be an object"];

  exactKeys(
    value,
    [
      "manifestVersion",
      "version",
      "commit",
      "publishedAt",
      "minUpdaterVersion",
      "images",
      "deployBundle",
      "database",
      "summaryZh",
      "provenance",
    ],
    "manifest",
    errors,
  );
  if (value.manifestVersion !== 1) {
    errors.push("manifestVersion must equal 1");
  }
  semver(value.version, "version", errors);
  if (typeof value.commit !== "string" || !COMMIT.test(value.commit)) {
    errors.push("commit must be a lowercase 40-character Git SHA");
  }
  if (
    typeof value.publishedAt !== "string" ||
    !DATE_TIME.test(value.publishedAt) ||
    Number.isNaN(Date.parse(value.publishedAt))
  ) {
    errors.push("publishedAt must be a valid UTC ISO-8601 timestamp");
  }
  semver(value.minUpdaterVersion, "minUpdaterVersion", errors);
  validateImages(value.images, errors);
  validateDeployBundle(value.deployBundle, value.version, errors);
  validateDatabase(value.database, value.version, errors);
  validateSummary(value.summaryZh, errors);
  validateProvenance(value.provenance, value.version, errors);
  return errors;
}

export function assertValidManifest(value) {
  const errors = validateManifest(value);
  if (errors.length > 0) {
    throw new Error(`Invalid release manifest:\n- ${errors.join("\n- ")}`);
  }
  return value;
}

export function assertValidReleaseInput(value) {
  const errors = validateReleaseInput(value);
  if (errors.length > 0) {
    throw new Error(`Invalid release input:\n- ${errors.join("\n- ")}`);
  }
  return value;
}

export function createManifest({
  releaseInput,
  commit,
  publishedAt,
  filmframeDigest,
  accessDigest,
  deployBundleSha256,
}) {
  assertValidReleaseInput(releaseInput);
  const { version } = releaseInput;
  return assertValidManifest({
    manifestVersion: 1,
    version,
    commit,
    publishedAt,
    minUpdaterVersion: releaseInput.minUpdaterVersion,
    images: {
      filmframe: `${IMAGE_NAMES.filmframe}@${filmframeDigest}`,
      access: `${IMAGE_NAMES.access}@${accessDigest}`,
    },
    deployBundle: {
      url: `https://github.com/${RELEASE_TRUST.repository}/releases/download/v${version}/filmframe-deploy-${version}.tar.gz`,
      sha256: deployBundleSha256,
    },
    database: releaseInput.database,
    summaryZh: releaseInput.summaryZh,
    provenance: {
      ...RELEASE_TRUST,
      ref: `refs/tags/v${version}`,
    },
  });
}

function validateImages(value, errors) {
  if (!isRecord(value)) {
    errors.push("images must be an object");
    return;
  }
  exactKeys(value, ["filmframe", "access"], "images", errors);
  for (const [name, repository] of Object.entries(IMAGE_NAMES)) {
    const image = value[name];
    if (typeof image !== "string") {
      errors.push(`images.${name} must be a string`);
      continue;
    }
    const prefix = `${repository}@`;
    if (!image.startsWith(prefix) || !DIGEST.test(image.slice(prefix.length))) {
      errors.push(`images.${name} must use the trusted GHCR repository and sha256 digest`);
    }
    if (image.toLowerCase().includes(":latest")) {
      errors.push(`images.${name} must not use a mutable tag`);
    }
  }
}

function validateDeployBundle(value, version, errors) {
  if (!isRecord(value)) {
    errors.push("deployBundle must be an object");
    return;
  }
  exactKeys(value, ["url", "sha256"], "deployBundle", errors);
  const expectedUrl = `https://github.com/${RELEASE_TRUST.repository}/releases/download/v${version}/filmframe-deploy-${version}.tar.gz`;
  if (value.url !== expectedUrl) {
    errors.push("deployBundle.url must be the fixed asset URL for this version");
  }
  if (typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)) {
    errors.push("deployBundle.sha256 must be a lowercase SHA-256 checksum");
  }
}

function validateDatabase(value, version, errors) {
  if (!isRecord(value)) {
    errors.push("database must be an object");
    return;
  }
  exactKeys(
    value,
    ["schemaFrom", "schemaTo", "rollbackFloor", "backwardCompatible"],
    "database",
    errors,
  );
  for (const field of ["schemaFrom", "schemaTo"]) {
    if (!Number.isInteger(value[field]) || value[field] < 1 || value[field] > 999) {
      errors.push(`database.${field} must be an integer from 1 to 999`);
    }
  }
  if (
    Number.isInteger(value.schemaFrom) &&
    Number.isInteger(value.schemaTo) &&
    value.schemaTo < value.schemaFrom
  ) {
    errors.push("database.schemaTo must be greater than or equal to schemaFrom");
  }
  if (value.backwardCompatible !== true) {
    errors.push("database.backwardCompatible must be true for one-click releases");
  }
  if (semver(value.rollbackFloor, "database.rollbackFloor", errors) && semverValue(version)) {
    if (compareSemver(value.rollbackFloor, version) > 0) {
      errors.push("database.rollbackFloor must not be newer than the release version");
    }
  }
}

function validateSummary(value, errors) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    errors.push("summaryZh must contain 1 to 6 entries");
    return;
  }
  for (const [index, entry] of value.entries()) {
    const path = `summaryZh[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    exactKeys(entry, ["kind", "text"], path, errors);
    if (!SUMMARY_KINDS.has(entry.kind)) {
      errors.push(`${path}.kind must be feature, fix, or security`);
    }
    if (typeof entry.text !== "string") {
      errors.push(`${path}.text must be a string`);
      continue;
    }
    const length = Array.from(entry.text).length;
    if (
      entry.text !== entry.text.trim() ||
      length < 8 ||
      length > 120 ||
      !/\p{Script=Han}/u.test(entry.text) ||
      /[<>\r\n\u0000-\u001f]/u.test(entry.text) ||
      /https?:\/\//iu.test(entry.text)
    ) {
      errors.push(`${path}.text must be 8-120 trimmed Chinese characters without markup, URLs, or control characters`);
    }
  }
}

function validateProvenance(value, version, errors) {
  if (!isRecord(value)) {
    errors.push("provenance must be an object");
    return;
  }
  exactKeys(value, ["issuer", "repository", "workflow", "ref"], "provenance", errors);
  for (const [field, expected] of Object.entries(RELEASE_TRUST)) {
    if (value[field] !== expected) {
      errors.push(`provenance.${field} is not trusted`);
    }
  }
  if (value.ref !== `refs/tags/v${version}`) {
    errors.push("provenance.ref must match the release version tag");
  }
}

function exactKeys(value, expected, path, errors) {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required`);
  }
}

function semver(value, path, errors) {
  if (!semverValue(value)) {
    errors.push(`${path} must be a stable major.minor.patch version`);
    return false;
  }
  return true;
}

function semverValue(value) {
  return typeof value === "string" && SEMVER.test(value);
}

function compareSemver(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}
