import type { TokenBundle } from "../../../stores/types";
import type { PipedreamAuthReader } from "./types";

/**
 * Map tensor-mcp's universal `TokenBundle` to the per-key `this.$auth.<key>`
 * shape upstream Pipedream components expect. Service-specific aliases live
 * in the `aliases` map passed by the caller — e.g. Slack maps
 * `oauth_access_token` → `bundle.access_token`, `bot_token` →
 * `bundle.metadata.bot_token`.
 *
 * Unknown keys fall through to `bundle.metadata[key]` so single-API-key
 * services (Brave, Tavily) work without any aliases.
 */
export function makeAuthReader(
  bundle: TokenBundle,
  aliases: Record<string, (b: TokenBundle) => unknown> = {},
): PipedreamAuthReader {
  return (key: string) => {
    const alias = aliases[key];
    if (alias) return alias(bundle);
    return bundle.metadata?.[key];
  };
}
