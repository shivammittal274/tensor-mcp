import { callTool, SpawnPool, TokenStore } from "@tensor-mcp/core";
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
  const pool = new SpawnPool();

  try {
    const result = await callTool(
      { service, tool, input },
      {
        tokenStore,
        spawnPool: pool,
        getSpawn: (s) => (s === service ? def.spawn : undefined),
        getRemote: (s) => (s === service ? def.remote : undefined),
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
