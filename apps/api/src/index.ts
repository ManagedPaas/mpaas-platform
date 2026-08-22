import type { PublicModule } from "../../../packages/contracts/src/index.js";

export { withAuthorizedTenantRequest } from "./tenant-boundary.js";

export const apiModule: PublicModule = {
  name: "api",
  version: "0.0.0"
};

export function startApi(): void {
  console.log(`${apiModule.name} start path verified`);
}
