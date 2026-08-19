import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const review = readFileSync(
  new URL("../docs/security/phase-1-security-invariants-review.md", import.meta.url),
  "utf8"
);

const requiredAbuseCases = Array.from({ length: 11 }, (_, index) => {
  const id = String(index + 1).padStart(2, "0");
  return [`ABUSE-${id}`, `SEC-T${id}`];
});
test("security review records the P1-040 documentation gate and evidence scope", () => {
  assert.match(review, /MP-48 \/ P1-040/);
  assert.match(review, /P1-007 source task/);
  assert.match(review, /Gate verdict: PASS/);
  assert.match(review, /documentation gate only/);
  assert.match(review, /No runtime control is claimed as implemented/);
  assert.match(review, /no architecture decision or residual security risk is accepted/i);
});

test("security review maps every P0 abuse case to a verification ticket", () => {
  for (const [abuseId, testId] of requiredAbuseCases) {
    assert.match(review, new RegExp(`\\| ${abuseId} \\|`));
    assert.match(review, new RegExp(`\\| ${testId} \\|`));
  }
});

test("security review preserves follow-on gates and explicit unknowns", () => {
  for (const followOn of ["P1-041", "P1-042", "P1-043", "P1-044", "P1-045", "P1-046"]) {
    assert.match(review, new RegExp(followOn));
  }

  assert.match(review, /customer-cloud and BYOC boundaries remain/);
  assert.match(review, /explicitly out of Phase 1 scope/);
  assert.match(review, /named owners and\s+deadlines/);
});
