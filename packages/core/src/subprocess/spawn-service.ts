import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TokenBundle } from "../stores/types";
import { type SpawnSubprocessOptions, spawnSubprocess } from "./spawn";
import type { SpawnConfig, SpawnedProcess, SpawnOptions } from "./types";

/**
 * Pure: compute the subprocess args from a SpawnConfig + a TokenBundle.
 * Extracted so tests can assert on the result without mocking spawn.
 */
export function buildSpawnArgs(
  service: string,
  spawn: SpawnConfig,
  opts: SpawnOptions,
): SpawnSubprocessOptions {
  const root = opts.tensorMcpRoot ?? findWorkspaceRoot();
  const cwd = isAbsolute(spawn.vendorDir)
    ? spawn.vendorDir
    : join(root, spawn.vendorDir);

  const forge = spawn.forgeAuthData ?? defaultForge;
  const authData = Buffer.from(JSON.stringify(forge(opts.token))).toString(
    "base64",
  );

  return {
    service,
    cwd,
    command: spawn.command,
    authData,
    envInject: spawn.envInject,
    port: opts.port,
    readinessTimeoutMs: opts.readinessTimeoutMs,
  };
}

/**
 * Start a service's subprocess from its SpawnConfig + a TokenBundle.
 *
 * Resolves vendorDir against the tensor-mcp workspace root, forges
 * AUTH_DATA (base64 JSON), and delegates to `spawnSubprocess`.
 */
export async function spawnService(
  service: string,
  spawn: SpawnConfig,
  opts: SpawnOptions,
): Promise<SpawnedProcess> {
  return spawnSubprocess(buildSpawnArgs(service, spawn, opts));
}

function defaultForge(bundle: TokenBundle): Record<string, unknown> {
  return { access_token: bundle.access_token };
}

/**
 * Walk upward from this module's location looking for the tensor-mcp
 * workspace root (the package.json named "tensor-mcp"). Falls back to cwd.
 */
export function findWorkspaceRoot(): string {
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
