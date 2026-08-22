import type { PoolClient } from "pg";
import type { TenantId } from "../../domain/src/index.js";

export interface TenantPool {
  connect(): Promise<PoolClient>;
}

export type TenantTransaction<T> = (client: PoolClient) => Promise<T>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TransactionSetup = (client: PoolClient) => Promise<void>;

export async function withTransaction<T>(
  pool: TenantPool,
  setup: TransactionSetup,
  work: TenantTransaction<T>
): Promise<T> {
  const client = await pool.connect();
  let releaseError: Error | boolean | undefined;
  try {
    await client.query("BEGIN");
    await setup(client);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      releaseError = rollbackError instanceof Error ? rollbackError : true;
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

export async function withTenantTransaction<T>(
  pool: TenantPool,
  tenantId: TenantId,
  work: TenantTransaction<T>
): Promise<T> {
  if (!uuidPattern.test(tenantId)) {
    throw new Error("tenantId must be a UUID");
  }

  return withTransaction(
    pool,
    async (client) => {
      await client.query("SELECT set_config($1, $2, true)", ["app.tenant_id", tenantId]);
    },
    work
  );
}
