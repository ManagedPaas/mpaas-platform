export type ModuleName =
  | "web"
  | "api"
  | "worker"
  | "runner"
  | "domain"
  | "contracts"
  | "tool-sdk";

export interface PublicModule {
  readonly name: ModuleName;
  readonly version: string;
}
