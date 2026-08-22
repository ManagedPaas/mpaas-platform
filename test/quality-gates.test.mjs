import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatViolations } from "../scripts/check-format.mjs";
import { lintViolations } from "../scripts/check-lint.mjs";
import { secretViolations } from "../scripts/check-secrets.mjs";

test("format check accepts a clean text file", () => {
  assert.deepEqual(formatViolations("fixture.ts", "const value = 1;\n"), []);
});

test("format check reports trailing whitespace and missing final newline", () => {
  const violations = formatViolations("fixture.ts", "const value = 1;  ");

  assert.equal(violations.length, 2);
  assert.match(violations[0], /trailing whitespace/);
  assert.match(violations[1], /final newline/);
});

test("lint check rejects unsafe TypeScript escape hatches", () => {
  const lintFixture = [
    "const value: ",
    "any = 1;\n// @ts-",
    "ignore\ndebug",
    "ger;\nvar",
    " legacy = value;\n"
  ].join("");
  const violations = lintViolations(lintFixture, "fixture.ts");

  assert.equal(violations.length, 4);
  assert.match(violations[0], /any/);
  assert.match(violations[1], /ts-ignore/);
  assert.match(violations[2], /debug/);
  assert.match(violations[3], /var/);
});

test("secret check reports credential-shaped content", () => {
  const token = ["ghp_", "12345678901234567890"].join("");
  const violations = secretViolations(`const token = '${token}';\n`, "fixture.ts");

  assert.equal(violations.length, 1);
  assert.match(violations[0], /GitHub token/);
});

test("workflow uses read-only permissions and pinned actions", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

  assert.match(workflow, /permissions:\n  contents: read/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /actions\/cache/);
  assert.equal((workflow.match(/persist-credentials: false/g) ?? []).length, 2);
  for (const line of workflow.split("\n")) {
    if (line.includes(" uses: ")) assert.match(line, /@[0-9a-f]{40}/);
  }
});
