// Service abstraction

export * from "./auth";
export type {
  AuthIO,
  AuthMethod,
  AuthStrategy,
  ConnectOptions,
} from "./auth/types";
export * from "./catalog";
export * from "./mcp";
export * from "./search";
export { defineService, type Service } from "./service";
// Re-exported sub-modules for convenience
export * from "./stores";
// Type contracts
export type { KeyValueStore, TokenBundle } from "./stores/types";
export * from "./subprocess";
export type {
  SpawnConfig,
  SpawnedProcess,
  SpawnOptions,
} from "./subprocess/types";
