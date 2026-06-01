import { propsToJsonSchema } from "./props-to-json-schema";
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
 * tensor-mcp tool name (e.g. `send_message`). Strips the leading `<app>-`
 * segment and replaces hyphens with underscores so the names match the
 * catalog's snake_case convention.
 *
 * No domain-level renames — they collide once upstream ships multiple
 * actions whose stripped keys overlap (e.g. `slack_v2-send-message` and
 * `slack_v2-send-message-to-channel` both collapsed to
 * `send_message_to_channel` and broke catalog ingest).
 */
export function toolNameForAction(key: string): string {
  const stripped = key.replace(/^[a-z0-9_]+-/, "");
  return stripped.replace(/-/g, "_");
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
