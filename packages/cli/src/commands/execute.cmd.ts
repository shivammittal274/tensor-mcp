import {
  connectionIdFor,
  ConnectionsStore,
  executeTool,
  getService,
  OAuthClientStore,
  TokenStore,
} from "@tensor-mcp/core";
import { emitErr, emitOk } from "../utils/json";

/**
 * `tensor-mcp execute <app> <tool> '<json>'` — pairs with the MCP `execute`
 * tool. The third argument is the JSON-encoded input matching the tool's
 * `input_schema` (default `{}`).
 *
 * On 401 (either remote MCP or Pipedream-component path), silently refreshes
 * the OAuth token via the auth strategy's `refresh()` method and retries
 * once. On refresh failure, surfaces a "re-run connect" message — we never
 * re-open a browser from a non-interactive CLI context.
 */
export async function executeCmd(
  app: string,
  tool: string,
  argsJson?: string,
): Promise<number> {
  const def = getService(app);
  if (!def) return emitErr(`unknown app '${app}'`);

  let input: Record<string, unknown> = {};
  if (argsJson) {
    try {
      input = JSON.parse(argsJson);
    } catch (err) {
      return emitErr(`invalid JSON: ${(err as Error).message}`);
    }
  }

  const tokenStore = new TokenStore();
  const oauthClientStore = new OAuthClientStore();
  const connections = new ConnectionsStore();

  try {
    const result = await executeTool(
      { app, tool, input },
      {
        tokenStore,
        connections,
        getRemote: (a) => (a === app ? def.remote : undefined),
        getPipedream: (a) => (a === app ? def.pipedream : undefined),
        tryRefresh: async (a) => {
          if (a !== app) throw new Error(`refresh not wired for '${a}'`);
          const id = connectionIdFor(app);
          const bundle = await tokenStore.get(id);
          if (!bundle) {
            throw new Error(
              `'${app}' has no stored bundle — run \`tensor-mcp connect ${app}\` first`,
            );
          }
          return await def.auth.refresh(bundle, {
            serviceId: id,
            tokenStore,
            oauthClientStore,
          });
        },
      },
    );

    if (result.isError) {
      // Tool errored — still return its JSON so the agent can read it.
      // Exit non-zero so shell pipelines see the failure.
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 1;
    }
    return emitOk(result);
  } catch (err) {
    return emitErr((err as Error).message);
  }
}
