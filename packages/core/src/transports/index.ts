// MCP execution transports. Two siblings. A Service picks exactly one via
// its `remote` or `pipedream` field — never both. Migrating between them
// is a one-line change to that Service's `defineService({...})` entry.
//
//   remote    → vendor-hosted MCP at a public URL. Streamable HTTP, Bearer
//               header. Vendor runs the tool code. Zero per-vendor
//               maintenance on our side. Example: Linear (mcp.linear.app),
//               Stripe (mcp.stripe.com), Sentry (mcp.sentry.dev).
//
//   pipedream → in-process runner that executes lifted Pipedream component
//               code from services/<name>/. Tokens stay in the OS keychain,
//               every API call goes from the user's machine direct to the
//               vendor. We maintain the lifted code. Example: Slack.
//
// Strategic direction: as more vendors ship hosted MCP endpoints, services
// migrate from `pipedream` → `remote`. The Service interface treats both
// fields as equals so migration is one-line.

export {
  connectMcpClient,
  defaultAuthHeaders,
  looksUnauthorized,
  remoteMcp,
  UnauthorizedToolCallError,
  type McpClientHandle,
  type McpToolDef,
  type McpToolResult,
  type RemoteMcpConfig,
} from "./remote";

export {
  listPipedreamTools,
  makeAuthReader,
  runPipedreamAction,
  type PipedreamActionModule,
  type PipedreamAppModule,
  type PipedreamAuthReader,
} from "./pipedream";
