import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/001_p1_006a_tenant_foundation.sql", "utf8");
const transaction = readFileSync("packages/persistence/src/transaction.ts", "utf8");

test("tenant foundation declares the required isolated tables", () => {
  for (const table of [
    "tenants",
    "users",
    "memberships",
    "repository_connections",
    "manifests",
    "executions",
    "deployments",
    "audit_events"
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE app\\.${table}\\b`));
  }
});

test("tenant foundation declares separated non-bypass runtime roles", () => {
  for (const role of ["mpaas_api_runtime", "mpaas_worker_runtime", "mpaas_audit_writer", "mpaas_analytics_reader"]) {
    assert.match(migration, new RegExp(`CREATE ROLE ${role}[^;]*NOBYPASSRLS`));
    assert.match(migration, new RegExp(`ALTER ROLE ${role}[^;]*NOBYPASSRLS`));
  }
  assert.equal((migration.match(/FORCE ROW LEVEL SECURITY/g) ?? []).length, 8);
  assert.match(migration, /current_setting\('app\.tenant_id', true\)/);
});

test("transaction context is local and parameterized", () => {
  assert.match(transaction, /BEGIN/);
  assert.match(transaction, /set_config\(\$1, \$2, true\)/);
  assert.match(transaction, /COMMIT/);
  assert.match(transaction, /ROLLBACK/);
  assert.match(transaction, /client\.release\(\)/);
});
