/**
 * Adapter layer between tensor-mcp's `execute` dispatcher and an
 * Activepieces `createAction({...})` definition. We build the
 * `ActionContext` the lifted code expects out of a TokenBundle + input
 * map, then call `action.run(ctx)`.
 *
 * The context is intentionally minimal — flows / store / agent / files /
 * connections all degrade to no-ops or throw on access. That's fine for
 * the actions a tensor-mcp user actually calls (chat ops); pieces that
 * lean on the orchestration runtime (waitpoints, flow context) are out
 * of scope for this POC.
 */

import type { TokenBundle } from "../../../stores/types";
import type { ActivepiecesAction, ActivepiecesPiece } from "./framework";

export interface RunActionArgs {
  piece: ActivepiecesPiece;
  toolName: string;
  input: Record<string, unknown>;
  token: TokenBundle;
}

export interface RunActionResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: shape varies per piece auth strategy
function buildAuthValue(token: TokenBundle): any {
  // Slack-style: OAuth2 connection with a bot token in access_token and
  // a user token tucked into data.authed_user.access_token. The lifted
  // helpers (`getBotToken`, `getUserToken`) read these fields directly.
  return {
    type: "OAUTH2",
    access_token: token.access_token,
    data: {
      authed_user: token.metadata?.slack_user_token
        ? { access_token: token.metadata.slack_user_token }
        : undefined,
      team_id: token.metadata?.team_id,
    },
    scope: token.scopes?.join(",") ?? "",
  };
}

function notSupported(area: string) {
  return () => {
    throw new Error(
      `tensor-mcp activepieces shim does not implement context.${area}; this action is outside the supported subset`,
    );
  };
}

// biome-ignore lint/suspicious/noExplicitAny: shape mirrors the lifted ActionContext
function buildContext(input: Record<string, unknown>, token: TokenBundle): any {
  return {
    executionType: "BEGIN",
    auth: buildAuthValue(token),
    propsValue: input,
    server: { apiUrl: "", publicUrl: "", token: "" },
    files: {
      async write({ data }: { data: Buffer }) {
        // Inline as a data URL — agents rarely need a real filename.
        return `data:application/octet-stream;base64,${data.toString("base64")}`;
      },
    },
    store: {
      get: notSupported("store.get"),
      put: notSupported("store.put"),
      delete: notSupported("store.delete"),
    },
    flows: {
      list: notSupported("flows.list"),
      current: { id: "tensor-mcp", version: { id: "tensor-mcp" } },
    },
    project: {
      id: "tensor-mcp",
      externalId: async () => undefined,
    },
    connections: { get: notSupported("connections.get") },
    tags: { add: async () => {} },
    output: { update: async () => {} },
    agent: { tools: notSupported("agent.tools") },
    step: { name: "tensor-mcp" },
    run: {
      id: "tensor-mcp",
      stop: () => {},
      respond: () => {},
      createWaitpoint: notSupported("run.createWaitpoint"),
      waitForWaitpoint: notSupported("run.waitForWaitpoint"),
    },
  };
}

export async function runAction({
  piece,
  toolName,
  input,
  token,
}: RunActionArgs): Promise<RunActionResult> {
  const action = piece.getAction(toolName);
  if (!action) {
    throw new Error(
      `tool '${toolName}' not found in piece '${piece.displayName}'`,
    );
  }
  const ctx = buildContext(input, token);
  try {
    const result = await action.run(ctx);
    return {
      content: [
        { type: "text", text: JSON.stringify(result ?? null, null, 2) },
      ],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: (err as Error).message }],
    };
  }
}

export function listToolsForPiece(
  piece: ActivepiecesPiece,
): ActivepiecesAction[] {
  return Object.values(piece.actions).filter(
    (a) => a.name !== "custom_api_call",
  );
}
