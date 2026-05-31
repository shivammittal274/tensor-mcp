import { propsToJsonSchema } from "./propsToJsonSchema";
import type { PipedreamActionModule } from "./types";

export interface PipedreamToolDescriptor {
  name: string;
  description: string;
  inputSchema: unknown;
  /** Pointer back to the action module — used at execute time. */
  action: PipedreamActionModule;
}

/**
 * Turn a Pipedream action's `key` (e.g. `slack_v2-send-message`) into a
 * tensor-mcp tool name (e.g. `send_message_to_channel`). We strip the
 * leading `<app>-` segment and replace hyphens with underscores so the
 * names match the catalog's snake_case convention.
 */
export function toolNameForAction(key: string): string {
  const stripped = key.replace(/^[a-z0-9_]+-/, "");
  const underscored = stripped.replace(/-/g, "_");
  // Domain rename: Pipedream's "send-message" maps to the spec name
  // "send_message_to_channel" for parity with other tensor-mcp services.
  if (underscored === "send_message") return "send_message_to_channel";
  if (underscored === "find_message") return "search_messages";
  return underscored;
}

export function listPipedreamTools(
  actions: PipedreamActionModule[],
): PipedreamToolDescriptor[] {
  return actions.map((action) => ({
    name: toolNameForAction(action.key),
    description: action.description ?? action.name ?? action.key,
    inputSchema: propsToJsonSchema(action),
    action,
  }));
}
