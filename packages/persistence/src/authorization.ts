import type { TenantId } from "../../domain/src/index.js";
import { createTenantRepository, type TenantRepository } from "./tenant-repository.js";
import { withTransaction, type TenantPool } from "./transaction.js";

export interface AuthenticatedPrincipal {
  readonly subject: string;
}

export type MembershipRole = "owner" | "admin" | "developer" | "viewer";

export interface AuthorizedTenant {
  readonly tenantId: TenantId;
  readonly membershipRole: MembershipRole;
}

export type AuthorizedTenantWork<T> = (
  repository: TenantRepository,
  authorization: AuthorizedTenant
) => Promise<T>;

export class TenantAccessDeniedError extends Error {
  readonly code = "TENANT_ACCESS_DENIED";

  constructor() {
    super("principal is not authorized for the requested tenant");
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumSubjectLength = 512;

function validatePrincipal(principal: AuthenticatedPrincipal): void {
  if (
    !principal ||
    typeof principal.subject !== "string" ||
    principal.subject.length === 0 ||
    principal.subject.length > maximumSubjectLength
  ) {
    throw new TenantAccessDeniedError();
  }
}

export async function withAuthorizedTenantTransaction<T>(
  pool: TenantPool,
  principal: AuthenticatedPrincipal,
  requestedTenantId: TenantId,
  work: AuthorizedTenantWork<T>
): Promise<T> {
  validatePrincipal(principal);
  if (!uuidPattern.test(requestedTenantId)) {
    throw new TenantAccessDeniedError();
  }

  return withTransaction(
    pool,
    async (client) => {
      await client.query("SELECT set_config($1, $2, true)", ["app.subject", principal.subject]);
    },
    async (client) => {
      const membership = await client.query<{ membership_role: MembershipRole }>(
        "SELECT m.membership_role FROM app.memberships AS m JOIN app.users AS u ON u.tenant_id = m.tenant_id AND u.id = m.user_id WHERE m.tenant_id = $1 AND u.external_subject = $2 LIMIT 1",
        [requestedTenantId, principal.subject]
      );
      const row = membership.rows[0];
      if (!row) {
        throw new TenantAccessDeniedError();
      }

      await client.query("SELECT set_config($1, $2, true)", ["app.tenant_id", requestedTenantId]);
      return work(createTenantRepository(client), {
        tenantId: requestedTenantId,
        membershipRole: row.membership_role
      });
    }
  );
}
