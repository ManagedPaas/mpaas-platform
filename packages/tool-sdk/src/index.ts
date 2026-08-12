import type { TenantRef } from "../../domain/src/index.js";

export interface ToolContext extends TenantRef {
  readonly taskId: string;
}

export interface ToolDefinition {
  readonly name: string;
  readonly execute: (context: ToolContext) => Promise<void>;
}
