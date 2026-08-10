#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TEMPLATE = path.resolve("ops/release-candidate/filmframe-rc-auth.conf.template");
const TOKEN_NAMES = [
  "RC_HOST",
  "RC_CERTIFICATE",
  "RC_CERTIFICATE_KEY",
  "RC_REAL_IP_INCLUDE",
];

const args = parseArgs(process.argv.slice(2));
const input = path.resolve(args.template ?? TEMPLATE);
const output = args.output ? path.resolve(args.output) : null;
if (!output) usage("--output is required");
if (input === output) usage("--output must differ from the template");

const values = {
  RC_HOST: args.host ?? "filmframe-rc.astrocean.space",
  RC_CERTIFICATE: args.certificate,
  RC_CERTIFICATE_KEY: args["certificate-key"],
  RC_REAL_IP_INCLUDE: args["real-ip-include"],
};
for (const name of TOKEN_NAMES) {
  const value = values[name];
  if (typeof value !== "string" || value.length === 0) {
    usage(`missing --${name.toLowerCase().replaceAll("_", "-")}`);
  }
  if (/[\r\n]/u.test(value)) usage(`${name} cannot contain a newline`);
}
if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(values.RC_HOST)) {
  usage("--host must be a DNS hostname without a scheme or path");
}
for (const name of ["RC_CERTIFICATE", "RC_CERTIFICATE_KEY", "RC_REAL_IP_INCLUDE"]) {
  if (!path.isAbsolute(values[name])) usage(`--${name.toLowerCase().replaceAll("_", "-")} must be absolute`);
}

let source = await readFile(input, "utf8");
for (const name of TOKEN_NAMES) {
  source = source.replaceAll(`__${name}__`, values[name]);
}
if (/__RC_[A-Z0-9_-]+__/u.test(source)) {
  throw new Error("template still contains an unresolved __RC_*__ placeholder");
}
await writeFile(output, source, { encoding: "utf8", flag: args.force ? "w" : "wx", mode: 0o644 });
process.stdout.write(`rendered candidate vhost for ${values.RC_HOST} to ${output}\n`);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") {
      result.force = true;
      continue;
    }
    if (!argument.startsWith("--")) usage(`unknown argument ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) usage(`missing value for ${argument}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error(
    "usage: render-vhost.mjs --output PATH --certificate PATH --certificate-key PATH --real-ip-include PATH [--host HOST] [--template PATH] [--force]",
  );
  process.exit(2);
}
