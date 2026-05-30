import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Vault,
  connectMcpClient,
  forgeAuthData,
  spawnService,
  type SpawnedService,
} from "@tensor-mcp/runtime";

export interface RunDevCallOptions {
  vaultService?: string;
  tensorMcpRoot?: string;
}

const DEFAULT_VAULT_SERVICE = "com.tensormcp.cli";

interface ServiceSpawnConfig {
  vendorDir: string;
  commandTemplate: string[];
}

const SERVICE_REGISTRY: Record<string, ServiceSpawnConfig> = {
  linear: {
    vendorDir: "vendored/linear",
    commandTemplate: [
      "uv",
      "run",
      "--with-requirements",
      "requirements.txt",
      "python",
      "server.py",
      "--port",
      "{{PORT}}",
    ],
  },
};

function findWorkspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const data = require(pkg);
        if (data?.name === "tensor-mcp") return dir;
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export async function runDevCall(
  args: string[],
  opts: RunDevCallOptions = {},
): Promise<number> {
  const [service, tool, jsonArgs] = args;
  if (!service || !tool) {
    process.stderr.write(
      "tensor-mcp dev:call: missing args\n\nUsage: tensor-mcp dev:call <service> <tool> [json-args]\n",
    );
    return 1;
  }

  const registryEntry = SERVICE_REGISTRY[service];
  if (!registryEntry) {
    process.stderr.write(
      `tensor-mcp dev:call: unknown service '${service}' (supported: ${Object.keys(SERVICE_REGISTRY).join(", ")})\n`,
    );
    return 1;
  }

  let parsedArgs: Record<string, unknown> = {};
  if (jsonArgs) {
    try {
      parsedArgs = JSON.parse(jsonArgs);
    } catch (err) {
      process.stderr.write(
        `tensor-mcp dev:call: invalid JSON args: ${(err as Error).message}\n`,
      );
      return 1;
    }
  }

  const connectionId = `${service}:default`;
  const vault = new Vault({
    service: opts.vaultService ?? DEFAULT_VAULT_SERVICE,
  });
  const blob = await vault.get(connectionId);
  if (!blob) {
    process.stderr.write(
      `tensor-mcp dev:call: '${service}' is not connected. Run 'tensor-mcp connect ${service}' first.\n`,
    );
    return 1;
  }

  const tensorMcpRoot = opts.tensorMcpRoot ?? findWorkspaceRoot();
  const vendorCwd = join(tensorMcpRoot, registryEntry.vendorDir);
  const authData = forgeAuthData(service, blob);

  process.stderr.write(`dev:call: spawning ${service} subprocess...\n`);
  let handle: SpawnedService;
  try {
    handle = await spawnService({
      service,
      cwd: vendorCwd,
      command: registryEntry.commandTemplate,
      authData,
      readinessTimeoutMs: 60_000,
    });
  } catch (err) {
    process.stderr.write(`dev:call: spawn failed: ${(err as Error).message}\n`);
    return 1;
  }

  try {
    process.stderr.write(
      `dev:call: connected ${handle.mcpUrl}; calling ${tool}...\n`,
    );
    const client = await connectMcpClient(handle.mcpUrl);
    try {
      const result = await client.callTool(tool, parsedArgs);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return result.isError ? 1 : 0;
    } finally {
      await client.close();
    }
  } catch (err) {
    process.stderr.write(`dev:call: error: ${(err as Error).message}\n`);
    return 1;
  } finally {
    await handle.kill();
  }
}
