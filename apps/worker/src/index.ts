import type { PublicModule } from "../../../packages/contracts/src/index.js";

export const workerModule: PublicModule = {
  name: "worker",
  version: "0.0.0"
};

export function startWorker(): void {
  console.log(`${workerModule.name} start path verified`);
}
