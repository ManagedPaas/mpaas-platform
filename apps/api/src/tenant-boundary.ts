import type { TenantId } from "../../../packages/domain/src/index.js";
import {
  withAuthorizedTenantTransaction,
  type AuthenticatedPrincipal,
  type TenantPool,
  type TenantRepository
} from "../../../packages/persistence/src/index.js";

export function withAuthorizedTenantRequest<T>(
  pool: TenantPool,
  principal: AuthenticatedPrincipal,
  requestedTenantId: TenantId,
  work: (repository: TenantRepository) => Promise<T>
): Promise<T> {
  return withAuthorizedTenantTransaction(pool, principal, requestedTenantId, (repository) => work(repository));
}
