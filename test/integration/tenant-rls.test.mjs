import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { withTenantTransaction } from "../../dist/packages/persistence/src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  test("requires DATABASE_URL for live PostgreSQL verification", () => {
    assert.fail("DATABASE_URL is required; integration tests must not silently skip");
  });
} else {
  let adminPool;
  let runtimePool;
  const fixtures = {
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    userA: randomUUID(),
    userB: randomUUID(),
    manifestA: randomUUID(),
    manifestB: randomUUID()
  };

  before(async () => {
    adminPool = new Pool({ connectionString: databaseUrl });
    runtimePool = {
      connect: async () => {
        const client = await adminPool.connect();
        await client.query("SET ROLE mpaas_api_runtime");
        return client;
      }
    };

    const { rows } = await adminPool.query("SELECT to_regclass('app.manifests') AS manifests");
    assert.equal(rows[0].manifests, "app.manifests", "apply db:migrate before integration tests");

    await adminPool.query(
      "INSERT INTO app.tenants (id, name) VALUES ($1, $2), ($3, $4)",
      [fixtures.tenantA, "tenant-a", fixtures.tenantB, "tenant-b"]
    );
    await adminPool.query(
      "INSERT INTO app.users (id, tenant_id, external_subject) VALUES ($1, $2, $3), ($4, $5, $6)",
      [fixtures.userA, fixtures.tenantA, "subject-a", fixtures.userB, fixtures.tenantB, "subject-b"]
    );
    await adminPool.query(
      "INSERT INTO app.memberships (tenant_id, user_id, membership_role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')",
      [fixtures.tenantA, fixtures.userA, fixtures.tenantB, fixtures.userB]
    );
    await adminPool.query(
      "INSERT INTO app.manifests (id, tenant_id, source_commit, payload) VALUES ($1, $2, 'a', $3), ($4, $5, 'b', $6)",
      [
        fixtures.manifestA,
        fixtures.tenantA,
        { tenant: "a" },
        fixtures.manifestB,
        fixtures.tenantB,
        { tenant: "b" }
      ]
    );
  });

  after(async () => {
    await adminPool?.end();
  });

  test("runtime roles have no superuser or BYPASSRLS privilege", async () => {
    const { rows } = await adminPool.query(
      "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname",
      [["mpaas_api_runtime", "mpaas_worker_runtime", "mpaas_audit_writer", "mpaas_analytics_reader"]]
    );
    assert.equal(rows.length, 4);
    for (const row of rows) {
      assert.equal(row.rolsuper, false, `${row.rolname} must not be superuser`);
      assert.equal(row.rolbypassrls, false, `${row.rolname} must not bypass RLS`);
    }
  });

  test("all tenant tables enable and force RLS", async () => {
    const tableNames = [
      "tenants",
      "users",
      "memberships",
      "repository_connections",
      "manifests",
      "executions",
      "deployments",
      "audit_events"
    ];
    const { rows } = await adminPool.query(
      "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = ANY($1::text[]) ORDER BY c.relname",
      [tableNames]
    );
    assert.equal(rows.length, tableNames.length);
    for (const row of rows) {
      assert.equal(row.relrowsecurity, true, `${row.relname} must enable RLS`);
      assert.equal(row.relforcerowsecurity, true, `${row.relname} must force RLS`);
    }
  });

  test("transaction-local tenant context scopes reads and resets", async () => {
    const tenantARows = await withTenantTransaction(runtimePool, fixtures.tenantA, async (client) => {
      const result = await client.query("SELECT tenant_id FROM app.manifests ORDER BY tenant_id");
      return result.rows;
    });
    assert.deepEqual(tenantARows.map((row) => row.tenant_id), [fixtures.tenantA]);

    const tenantBRows = await withTenantTransaction(runtimePool, fixtures.tenantB, async (client) => {
      const result = await client.query("SELECT tenant_id FROM app.manifests ORDER BY tenant_id");
      return result.rows;
    });
    assert.deepEqual(tenantBRows.map((row) => row.tenant_id), [fixtures.tenantB]);
  });

  test("cross-tenant reads and writes fail closed", async () => {
    const hiddenRows = await withTenantTransaction(runtimePool, fixtures.tenantA, async (client) => {
      const result = await client.query("SELECT id FROM app.manifests WHERE id = $1", [fixtures.manifestB]);
      return result.rows;
    });
    assert.equal(hiddenRows.length, 0);

    await assert.rejects(
      withTenantTransaction(runtimePool, fixtures.tenantA, (client) =>
        client.query(
          "INSERT INTO app.manifests (id, tenant_id, source_commit, payload) VALUES ($1, $2, 'cross', '{}'::jsonb)",
          [randomUUID(), fixtures.tenantB]
        )
      ),
      /row-level security|policy/
    );

    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT id FROM app.manifests");
      assert.equal(result.rows.length, 0, "missing context must not expose tenant rows");
      await assert.rejects(
        client.query(
          "INSERT INTO app.manifests (id, tenant_id, source_commit, payload) VALUES ($1, $2, 'missing', '{}'::jsonb)",
          [randomUUID(), fixtures.tenantA]
        ),
        /row-level security|policy/
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  test("read-only analytics role cannot write tenant data", async () => {
    const client = await adminPool.connect();
    try {
      await client.query("SET ROLE mpaas_analytics_reader");
      await assert.rejects(
        client.query(
          "INSERT INTO app.manifests (id, tenant_id, source_commit, payload) VALUES ($1, $2, 'wrong-role', '{}'::jsonb)",
          [randomUUID(), fixtures.tenantA]
        ),
        /permission denied/
      );
      await client.query("RESET ROLE");
    } finally {
      client.release();
    }
  });
}
