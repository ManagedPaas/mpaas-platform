import assert from "node:assert/strict";
import test from "node:test";
import { findImportViolations, validateImport } from "../scripts/check-boundaries.mjs";

test("source modules use only public cross-module APIs", () => {
  assert.deepEqual(findImportViolations(), []);
});

test("boundary checker rejects a deep cross-module import", () => {
  const importer = new URL("../apps/api/src/index.ts", import.meta.url).pathname;
  const violations = validateImport(importer, "../../../packages/domain/src/tenant.js");

  assert.equal(violations.length, 1);
});

test("boundary checker rejects an internal cross-module import", () => {
  const importer = new URL("../apps/api/src/index.ts", import.meta.url).pathname;
  const violations = validateImport(importer, "../../../packages/domain/src/internal/tenant.js");

  assert.equal(violations.length, 1);
});
