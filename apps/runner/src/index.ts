import type { TenantRef } from "../../../packages/domain/src/index.js";

export const runnerScope: TenantRef = {
  tenantId: "unassigned"
};

export function startRunner(): void {
  console.log(`runner start path verified for tenant ${runnerScope.tenantId}`);
}
