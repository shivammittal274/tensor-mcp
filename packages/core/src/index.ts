// Service abstraction
export { defineService, type Service } from "./service";

// Type contracts
export type { KeyValueStore, TokenBundle } from "./stores/types";
export type { AuthStrategy, AuthMethod, ConnectOptions, AuthIO } from "./auth/types";
export type { Executor, SpawnOptions, SpawnedProcess } from "./subprocess/types";

// Re-exported sub-modules for convenience
export * from "./stores";
export * from "./auth";
export * from "./subprocess";
export * from "./catalog";
export * from "./search";
export * from "./mcp";
