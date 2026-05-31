// Service abstraction

export * from "./auth";
export type {
  AuthIO,
  AuthMethod,
  AuthStrategy,
  ConnectOptions,
} from "./auth/types";
// Re-export the SDK's auth-server metadata type so service entries can declare
// `staticOAuthAuth` configs without a direct dependency on the SDK.
export type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
export * from "./catalog";
export * from "./mcp";
export * from "./search";
export {
  defaultAuthHeaders,
  remoteMcp,
  type RemoteMcpConfig,
} from "./remote-mcp";
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
