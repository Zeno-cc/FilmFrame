import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const paths = {
  certificate: "/etc/1panel/certs/astrocean.space/fullchain.pem",
  "certificate-key": "/etc/1panel/certs/astrocean.space/privkey.pem",
  "real-ip-include": "/etc/openresty/conf.d/cloudflare-real-ip.conf",
};

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "filmframe-vhost-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "vhost.conf");
  return {
    output,
    render: (values = paths, extra = []) => spawnSync(process.execPath, [
      "ops/release-candidate/render-vhost.mjs", "--output", output,
      ...Object.entries(values).flatMap(([key, value]) => [`--${key}`, value]),
      ...extra,
    ], { cwd: root, encoding: "utf8" }),
  };
}

test("RC vhost preserves normal absolute paths and Nginx variables", async (t) => {
  const { output, render } = await fixture(t);
  const result = render();
  assert.equal(result.status, 0, result.stderr);
  const source = await readFile(output, "utf8");
  assert.ok(source.includes(`ssl_certificate ${paths.certificate};`));
  assert.ok(source.includes(`ssl_certificate_key ${paths["certificate-key"]};`));
  assert.ok(source.includes(`include ${paths["real-ip-include"]};`));
  assert.ok(source.includes("map $http_cookie $filmframe_rc_session_cookie"));
  assert.doesNotMatch(source, /__RC_[A-Z0-9_-]+__/u);
});

for (const field of Object.keys(paths)) {
  test(`RC vhost rejects unsafe ${field} paths before creating output`, async (t) => {
    const { output, render } = await fixture(t);
    for (const character of [" ", "\t", "\n", ";", "{", "}", '"', "'", "\\", "#", "$", "\u0001"]) {
      const result = render({ ...paths, [field]: `/etc/cert${character}bundle/file.pem` });
      assert.equal(result.status, 2, `accepted ${JSON.stringify(character)} in ${field}: ${result.stderr}`);
      assert.match(result.stderr, /cannot contain/);
      await assert.rejects(readFile(output), { code: "ENOENT" });
    }
  });
}

test("invalid RC paths leave existing output intact even with force", async (t) => {
  const { output, render } = await fixture(t);
  await writeFile(output, "existing vhost\n");
  const result = render({ ...paths, certificate: "/etc/cert bundle/fullchain.pem" }, ["--force"]);
  assert.equal(result.status, 2);
  assert.equal(await readFile(output, "utf8"), "existing vhost\n");
});
