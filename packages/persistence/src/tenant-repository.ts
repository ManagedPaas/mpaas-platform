import type { PoolClient } from "pg";
import type { TenantId } from "../../domain/src/index.js";

export interface ManifestRecord {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly sourceCommit: string;
  readonly payload: unknown;
}

export interface CreateManifestInput {
  readonly id: string;
  readonly sourceCommit: string;
  readonly payload: unknown;
}

export interface TenantRepository {
  listManifests(): Promise<readonly ManifestRecord[]>;
  createManifest(input: CreateManifestInput): Promise<ManifestRecord>;
}

interface ManifestRow {
  readonly id: string;
  readonly tenant_id: TenantId;
  readonly source_commit: string;
  readonly payload: unknown;
}

function toManifestRecord(row: ManifestRow): ManifestRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceCommit: row.source_commit,
    payload: row.payload
  };
}

export function createTenantRepository(client: PoolClient): TenantRepository {
  return {
    async listManifests() {
      const result = await client.query<ManifestRow>(
        "SELECT id, tenant_id, source_commit, payload FROM app.manifests ORDER BY id"
      );
      return result.rows.map(toManifestRecord);
    },

    async createManifest(input) {
      const result = await client.query<ManifestRow>(
        "INSERT INTO app.manifests (id, tenant_id, source_commit, payload) VALUES ($1, app.current_tenant_id(), $2, $3::jsonb) RETURNING id, tenant_id, source_commit, payload",
        [input.id, input.sourceCommit, input.payload]
      );
      return toManifestRecord(result.rows[0]);
    }
  };
}
