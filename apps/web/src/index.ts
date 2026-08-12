import type { PublicModule } from "../../../packages/contracts/src/index.js";

export const webModule: PublicModule = {
  name: "web",
  version: "0.0.0"
};

export function startWeb(): void {
  console.log(`${webModule.name} start path verified`);
}
