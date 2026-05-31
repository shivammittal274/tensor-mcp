import {
  connectionIdFor,
  executeTool,
  getService,
  OAuthClientStore,
  SpawnPool,
  TokenStore,
} from "@tensor-mcp/core";
import { emitErr, emitOk } from "../utils/json";

/**
 * `tensor-mcp execute <app> <tool> '<json>'` — pairs with the MCP `execute`
 * tool. The third argument is the JSON-encoded input matching the tool's
 * `input_schema` (default `{}`).
 *
 * On 401 against a remote-MCP app, silently refreshes the OAuth token
 * (see [[executeTool]]). On refresh failure, surfaces a "re-run connect"
 * message — never re-opens a browser from a non-interactive context.
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

  const tokenStore = new TokenStore({});
  const oauthClientStore = new OAuthClientStore({});
  const pool = new SpawnPool();

  try {
    const result = await executeTool(
      { app, tool, input },
      {
        tokenStore,
        spawnPool: pool,
        getSpawn: (a) => (a === app ? def.spawn : undefined),
        getRemote: (a) => (a === app ? def.remote : undefined),
        tryRefresh: async (a) => {
          if (a !== app) throw new Error(`refresh not wired for '${a}'`);
          return await def.auth.connect({
            serviceId: connectionIdFor(app),
            tokenStore,
            oauthClientStore,
            // Non-interactive: the SDK tries refresh_token first; only if
            // that ALSO fails does it want to open a browser, which we
            // explicitly block so the user gets a clean message.
            io: {
              openBrowser: async () => {
                throw new Error(
                  `token expired and refresh failed — run \`tensor-mcp connect ${app}\` to re-authenticate`,
                );
              },
            },
          });
        },
      },
    );

    if (result.isError) {
      // Tool itself errored — still return its JSON so the agent can read it.
      // Exit non-zero so shell pipelines see the failure.
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 1;
    }
    return emitOk(result);
  } catch (err) {
    return emitErr((err as Error).message);
  } finally {
    await pool.shutdown();
  }
}
