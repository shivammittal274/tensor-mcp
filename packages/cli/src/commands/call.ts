import {
  callTool,
  connectionIdFor,
  ConnectionsStore,
  OAuthClientStore,
  SpawnPool,
  TokenStore,
} from "@tensor-mcp/core";
import { getService } from "@tensor-mcp/services";

export async function callCmd(
  service: string,
  tool: string,
  argsJson?: string,
): Promise<number> {
  const def = getService(service);
  if (!def) {
    process.stderr.write(`tensor-mcp call: unknown service '${service}'\n`);
    return 1;
  }

  let input: Record<string, unknown> = {};
  if (argsJson) {
    try {
      input = JSON.parse(argsJson);
    } catch (err) {
      process.stderr.write(
        `tensor-mcp call: invalid JSON: ${(err as Error).message}\n`,
      );
      return 1;
    }
  }

  const tokenStore = new TokenStore({});
  const oauthClientStore = new OAuthClientStore({});
  const pool = new SpawnPool();

  try {
    const result = await callTool(
      { service, tool, input },
      {
        tokenStore,
        spawnPool: pool,
        getSpawn: (s) => (s === service ? def.spawn : undefined),
        getRemote: (s) => (s === service ? def.remote : undefined),
        tryRefresh: async (s) => {
          if (s !== service) {
            throw new Error(`refresh not wired for '${s}'`);
          }
          // Re-run auth.connect with a non-interactive openBrowser. The
          // SDK consults the saved refresh_token first; if it works,
          // returns AUTHORIZED silently and our throw-openBrowser is
          // never hit. If the refresh_token is also expired, the SDK
          // tries to redirect → our throw fires → user sees a clear
          // "re-run connect" message instead of an unexpected browser.
          return await def.auth.connect({
            serviceId: connectionIdFor(service),
            tokenStore,
            oauthClientStore,
            io: {
              openBrowser: async () => {
                throw new Error(
                  `token expired and refresh failed — run \`tensor-mcp connect ${service}\` to re-authenticate`,
                );
              },
            },
          });
        },
      },
    );

    process.stdout.write(`${JSON.stringify(result.content, null, 2)}\n`);
    return result.isError ? 1 : 0;
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  } finally {
    await pool.shutdown();
  }
}
