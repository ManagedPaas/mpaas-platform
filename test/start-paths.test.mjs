import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const startPaths = [
  ["web", "dist/apps/web/src/main.js", "web start path verified"],
  ["api", "dist/apps/api/src/main.js", "api start path verified"],
  ["worker", "dist/apps/worker/src/main.js", "worker start path verified"],
  ["runner", "dist/apps/runner/src/main.js", "runner start path verified"]
];

for (const [name, entrypoint, expectedOutput] of startPaths) {
  test(`${name} has a verified local start path`, () => {
    const result = spawnSync(process.execPath, [entrypoint], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(expectedOutput));
  });
}
