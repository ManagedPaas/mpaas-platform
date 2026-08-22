import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiBoundary = readFileSync("apps/api/src/tenant-boundary.ts", "utf8");

test("API boundary delegates to persistence and exposes no direct table access", () => {
  assert.match(apiBoundary, /packages\/persistence\/src\/index\.js/);
  assert.doesNotMatch(apiBoundary, /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\b/i);
  assert.doesNotMatch(apiBoundary, /from ["']pg["']/);
  assert.doesNotMatch(apiBoundary, /PoolClient/);
});
