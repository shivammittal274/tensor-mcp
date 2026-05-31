import type { TokenBundle } from "../stores/types";

/**
 * For services that ship their own hosted MCP (Linear, Notion, Atlassian,
 * Asana, Cal.com, …). Skips the local Klavis subprocess entirely — we
 * connect the MCP client straight to the vendor's URL and pass our stored
 * token as a Bearer header.
 *
 * The DCR-issued access tokens for these vendors are scoped to the hosted
 * MCP endpoint (not the regular REST/GraphQL API), so this is the only
 * code path that actually works for them.
 */
export interface RemoteMcpConfig {
  /** Hosted MCP endpoint, e.g. "https://mcp.linear.app/mcp". */
  mcpUrl: string;
  /**
   * Customize how the stored token becomes request headers. Default:
   * `{ Authorization: \`Bearer ${token.access_token}\` }`. Override for
   * vendors that want a different header name or shape.
   */
  authHeaders?: (token: TokenBundle) => Record<string, string>;
}

/**
 * Build a RemoteMcpConfig with sensible defaults.
 *
 * Usage in a service definition:
 *   linear: defineService({
 *     id: "linear",
 *     auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.linear.app", scope: "read write" }),
 *     remote: remoteMcp("https://mcp.linear.app/mcp"),
 *   })
 */
export function remoteMcp(
  mcpUrl: string,
  opts: Partial<Omit<RemoteMcpConfig, "mcpUrl">> = {},
): RemoteMcpConfig {
  return { mcpUrl, ...opts };
}

/**
 * Default header derivation: `Authorization: Bearer <token>`.
 */
export function defaultAuthHeaders(token: TokenBundle): Record<string, string> {
  return { Authorization: `Bearer ${token.access_token}` };
}
