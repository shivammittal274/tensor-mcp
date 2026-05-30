export { Vault, type TokenBlob } from "./vault";
export { ConnectionsIndex, type ConnectionRecord } from "./connections-index";
export {
  connectLinear,
  connectViaDCR,
  type ConnectLinearResult,
  type LinearOAuthConfig,
  type DCRConnectConfig,
} from "./oauth/flow";
export { forgeAuthData, decodeAuthData } from "./subprocess/auth_data";
export { spawnService, type ServiceConfig, type SpawnedService } from "./subprocess/spawner";
export {
  connectMcpClient,
  type McpClientHandle,
  type McpToolDef,
  type McpToolResult,
} from "./subprocess/mcp_client";
export { SpawnPool, type SpawnPoolEntry } from "./subprocess/spawn-pool";
export { Catalog, type CatalogTool, type CatalogOptions } from "./catalog/catalog";
export { ingestService, type IngestServiceConfig } from "./catalog/ingest";
export { DEFAULT_SERVICE_REGISTRY } from "./service-registry";
export {
  SERVICES,
  getService,
  listServices,
  listOAuthCapableServices,
  type ServiceDefinition,
  type VendorConfig,
  type OAuthConfig,
  type DCROAuthConfig,
  type StaticOAuthConfig,
} from "./services";
export {
  runMcpServer,
  handleSearch,
  handleCall,
  type RunMcpServerConfig,
  type ToolHit,
  type SearchToolsResult,
} from "./server";
