import type { PoolClient } from "pg";
import type { TenantId } from "../../domain/src/index.js";

export interface TenantPool {
  connect(): Promise<PoolClient>;
}

export type TenantTransaction<T> = (client: PoolClient) => Promise<T>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function withTenantTransaction<T>(
  pool: TenantPool,
  tenantId: TenantId,
  work: TenantTransaction<T>
): Promise<T> {
  if (!uuidPattern.test(tenantId)) {
    throw new Error("tenantId must be a UUID");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config($1, $2, true)", ["app.tenant_id", tenantId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
