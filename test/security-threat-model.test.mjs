import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const artifact = readFileSync(new URL("../docs/security/phase-1-threat-model.md", import.meta.url), "utf8");

const requiredDomains = [
  "GitHub",
  "repository content",
  "planner",
  "API",
  "PostgreSQL",
  "Temporal",
  "MCP/tool registry",
  "runner",
  "AWS",
  "secrets",
  "artifacts",
  "audit",
  "telemetry"
];

const requiredAbuseCases = [
  ["ABUSE-01", "SEC-T01"],
  ["ABUSE-02", "SEC-T02"],
  ["ABUSE-03", "SEC-T03"],
  ["ABUSE-04", "SEC-T04"],
  ["ABUSE-05", "SEC-T05"],
  ["ABUSE-06", "SEC-T06"],
  ["ABUSE-07", "SEC-T07"],
  ["ABUSE-08", "SEC-T08"],
  ["ABUSE-09", "SEC-T09"],
  ["ABUSE-10", "SEC-T10"],
  ["ABUSE-11", "SEC-T11"]
];

test("threat model names every required Phase 1 trust-domain participant", () => {
  for (const domain of requiredDomains) {
    assert.match(artifact.toLowerCase(), new RegExp(domain.toLowerCase()), "missing domain: " + domain);
  }
});

test("every P0 abuse case has an owner, controls, recovery, and backlog test", () => {
  for (const [abuseId, testId] of requiredAbuseCases) {
    const row = artifact.split("\n").find((line) => line.startsWith("| " + abuseId + " |"));

    assert.ok(row, "missing abuse-case row: " + abuseId);
    assert.match(row, /\| P0 \|/);
    assert.match(row, /\| INV-\d{2}/);
    assert.match(row, new RegExp("\\| [^|]+ \\| [^|]+ \\| " + testId + " \\|$"));
  }
});

test("artifact separates planned controls from implemented evidence", () => {
  assert.match(artifact, /Artifact status: design requirements and planned verification/);
  assert.match(artifact, /These are planned tests for the implementation backlog/);
  assert.match(artifact, /No residual security risk is accepted by this artifact/);
});
