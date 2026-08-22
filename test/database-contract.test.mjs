import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { withTenantTransaction } from "../dist/packages/persistence/src/index.js";

const migration = readFileSync("db/migrations/001_p1_006a_tenant_foundation.sql", "utf8");
const authorizationMigration = readFileSync("db/migrations/002_p1_006b_api_authorization.sql", "utf8");
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
  assert.match(transaction, /client\.release\(releaseError\)/);
});

test("API authorization resolves membership from an opaque subject before tenant context", () => {
  assert.match(authorizationMigration, /current_setting\('app\.subject', true\)/);
  assert.match(authorizationMigration, /subject_membership_lookup ON app\.users/);
  assert.match(authorizationMigration, /subject_membership_lookup ON app\.memberships/);
  assert.match(authorizationMigration, /GRANT EXECUTE ON FUNCTION app\.current_subject\(\) TO mpaas_api_runtime/);
  assert.match(authorizationMigration, /DROP POLICY IF EXISTS subject_membership_lookup ON app\.memberships/);
});

function transactionFixture(rollbackError) {
  const queries = [];
  let releasedWith;
  const client = {
    async query(sql, params) {
      queries.push([sql, params]);
      if (sql === "ROLLBACK" && rollbackError) throw rollbackError;
    },
    release(error) {
      releasedWith = error;
    }
  };

  return {
    pool: { connect: async () => client },
    queries,
    releasedWith: () => releasedWith
  };
}

test("tenant transaction commits and releases a healthy client", async () => {
  const fixture = transactionFixture();

  const result = await withTenantTransaction(
    fixture.pool,
    "11111111-1111-4111-8111-111111111111",
    async () => "complete"
  );

  assert.equal(result, "complete");
  assert.deepEqual(fixture.queries.map(([sql]) => sql), [
    "BEGIN",
    "SELECT set_config($1, $2, true)",
    "COMMIT"
  ]);
  assert.equal(fixture.releasedWith(), undefined);
});

test("tenant transaction rolls back work failures and preserves the error", async () => {
  const fixture = transactionFixture();
  const workError = new Error("work failed");

  await assert.rejects(
    withTenantTransaction(
      fixture.pool,
      "11111111-1111-4111-8111-111111111111",
      async () => {
        throw workError;
      }
    ),
    (error) => error === workError
  );

  assert.deepEqual(fixture.queries.map(([sql]) => sql), [
    "BEGIN",
    "SELECT set_config($1, $2, true)",
    "ROLLBACK"
  ]);
  assert.equal(fixture.releasedWith(), undefined);
});

test("tenant transaction discards a client when rollback fails", async () => {
  const rollbackError = new Error("rollback failed");
  const fixture = transactionFixture(rollbackError);
  const workError = new Error("work failed");

  await assert.rejects(
    withTenantTransaction(
      fixture.pool,
      "11111111-1111-4111-8111-111111111111",
      async () => {
        throw workError;
      }
    ),
    (error) => error === workError
  );

  assert.equal(fixture.releasedWith(), rollbackError);
});
