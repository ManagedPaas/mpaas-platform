import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { Pool } from "pg";
import { withAuthorizedTenantRequest } from "../../dist/apps/api/src/index.js";
import { TenantAccessDeniedError } from "../../dist/packages/persistence/src/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  test("requires DATABASE_URL for live PostgreSQL verification", () => {
    assert.fail("DATABASE_URL is required; integration tests must not silently skip");
  });
} else {
  let adminPool;
  let runtimeBackingPool;
  let runtimePool;
  const fixtures = {
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    userA: randomUUID(),
    userB: randomUUID(),
    sharedSubjectUserB: randomUUID(),
    manifestA: randomUUID()
  };

  before(async () => {
    adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    runtimeBackingPool = new Pool({ connectionString: databaseUrl, max: 1 });
    runtimePool = {
      connect: async () => {
        const client = await runtimeBackingPool.connect();
        try {
          await client.query("SET ROLE mpaas_api_runtime");
          return client;
        } catch (error) {
          client.release(error instanceof Error ? error : true);
          throw error;
        }
      }
    };

    const { rows } = await adminPool.query("SELECT to_regclass('app.manifests') AS manifests");
    assert.equal(rows[0].manifests, "app.manifests", "apply db:migrate before integration tests");

    const { rows: subjectFunctionRows } = await adminPool.query(
      "SELECT to_regprocedure('app.current_subject()') AS current_subject"
    );
    assert.equal(subjectFunctionRows[0].current_subject, "app.current_subject()");

    await adminPool.query(
      "INSERT INTO app.tenants (id, name) VALUES ($1, $2), ($3, $4)",
      [fixtures.tenantA, "tenant-a", fixtures.tenantB, "tenant-b"]
    );
    await adminPool.query(
      "INSERT INTO app.users (id, tenant_id, external_subject) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)",
      [
        fixtures.userA,
        fixtures.tenantA,
        "subject-a",
        fixtures.userB,
        fixtures.tenantB,
        "subject-b",
        fixtures.sharedSubjectUserB,
        fixtures.tenantB,
        "subject-a"
      ]
    );
    await adminPool.query(
      "INSERT INTO app.memberships (tenant_id, user_id, membership_role) VALUES ($1, $2, 'owner'), ($3, $4, 'viewer'), ($5, $6, 'developer')",
      [
        fixtures.tenantA,
        fixtures.userA,
        fixtures.tenantB,
        fixtures.userB,
        fixtures.tenantB,
        fixtures.sharedSubjectUserB
      ]
    );
    await adminPool.query(
      "INSERT INTO app.manifests (id, tenant_id, source_commit, payload) VALUES ($1, $2, 'a', $3)",
      [fixtures.manifestA, fixtures.tenantA, { tenant: "a" }]
    );
  });

  after(async () => {
    await runtimeBackingPool?.end();
    await adminPool?.end();
  });

  test("authorized subject can read and mutate only its tenant repository", async () => {
    const manifests = await withAuthorizedTenantRequest(
      runtimePool,
      { subject: "subject-a" },
      fixtures.tenantA,
      (repository) => repository.listManifests()
    );
    assert.deepEqual(manifests.map((manifest) => manifest.id), [fixtures.manifestA]);
    assert.equal(manifests[0].tenantId, fixtures.tenantA);

    const created = await withAuthorizedTenantRequest(
      runtimePool,
      { subject: "subject-a" },
      fixtures.tenantA,
      (repository) =>
        repository.createManifest({
          id: randomUUID(),
          sourceCommit: "authorized",
          payload: { tenant: "a" }
        })
    );
    assert.equal(created.tenantId, fixtures.tenantA);
  });

  test("subject lookup policies stop widening identity reads after tenant context is set", async () => {
    const client = await runtimePool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config($1, $2, true)", ["app.subject", "subject-a"]);
      await client.query("SELECT set_config($1, $2, true)", ["app.tenant_id", fixtures.tenantA]);

      const users = await client.query("SELECT tenant_id FROM app.users ORDER BY tenant_id");
      const memberships = await client.query("SELECT tenant_id FROM app.memberships ORDER BY tenant_id");

      assert.deepEqual(users.rows.map((row) => row.tenant_id), [fixtures.tenantA]);
      assert.deepEqual(memberships.rows.map((row) => row.tenant_id), [fixtures.tenantA]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  test("runtime role sessions cannot contaminate admin assertions", async () => {
    const runtimeClient = await runtimePool.connect();
    try {
      const { rows } = await runtimeClient.query("SELECT current_user, session_user");
      assert.equal(rows[0].current_user, "mpaas_api_runtime");
    } finally {
      runtimeClient.release();
    }

    const { rows } = await adminPool.query("SELECT current_user, session_user");
    assert.equal(rows[0].current_user, rows[0].session_user);
  });

  test("cross-tenant reads and mutations fail before repository access", async () => {
    let repositoryCalled = false;
    await assert.rejects(
      withAuthorizedTenantRequest(
        runtimePool,
        { subject: "subject-b" },
        fixtures.tenantA,
        async () => {
          repositoryCalled = true;
          return [];
        }
      ),
      (error) => error instanceof TenantAccessDeniedError && error.code === "TENANT_ACCESS_DENIED"
    );
    assert.equal(repositoryCalled, false);

    const before = await adminPool.query("SELECT count(*)::int AS count FROM app.manifests WHERE tenant_id = $1", [fixtures.tenantA]);
    await assert.rejects(
      withAuthorizedTenantRequest(
        runtimePool,
        { subject: "subject-b" },
        fixtures.tenantA,
        (repository) =>
          repository.createManifest({
            id: randomUUID(),
            sourceCommit: "cross-tenant",
            payload: { tenant: "b" }
          })
      ),
      TenantAccessDeniedError
    );
    const after = await adminPool.query("SELECT count(*)::int AS count FROM app.manifests WHERE tenant_id = $1", [fixtures.tenantA]);
    assert.equal(after.rows[0].count, before.rows[0].count);
  });

  test("unknown subjects and malformed tenant targets fail closed", async () => {
    await assert.rejects(
      withAuthorizedTenantRequest(runtimePool, { subject: "unknown" }, fixtures.tenantA, (repository) => repository.listManifests()),
      TenantAccessDeniedError
    );
    await assert.rejects(
      withAuthorizedTenantRequest(runtimePool, { subject: "subject-a" }, "not-a-uuid", (repository) => repository.listManifests()),
      TenantAccessDeniedError
    );
  });
}
