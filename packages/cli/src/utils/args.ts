/**
 * MCP tool arguments arrive as `Record<string, unknown>` (per the SDK's
 * `CallToolRequestSchema`). Our core functions accept strict request types
 * with required fields — TypeScript can't safely narrow one to the other,
 * so we cast through `unknown`.
 *
 * Centralizing it here keeps each call site one line and makes the trust
 * boundary explicit: the core meta-tool functions are responsible for
 * runtime validation (missing fields, wrong types) — we don't double-validate
 * at the MCP transport layer.
 */
export function asMcpRequest<T>(
  args: Record<string, unknown> | undefined,
): T {
  return (args ?? {}) as unknown as T;
}
