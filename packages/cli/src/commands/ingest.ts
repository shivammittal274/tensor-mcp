import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Catalog,
  DEFAULT_SERVICE_REGISTRY,
  ingestService,
  type SpawnPoolEntry,
} from "@tensor-mcp/runtime";

export interface RunIngestOptions {
  catalogPath?: string;
  tensorMcpRoot?: string;
  registry?: Record<string, SpawnPoolEntry>;
}

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

export async function runIngest(
  args: string[],
  opts: RunIngestOptions = {},
): Promise<number> {
  const tensorMcpRoot = opts.tensorMcpRoot ?? findWorkspaceRoot();
  const registry = opts.registry ?? DEFAULT_SERVICE_REGISTRY;
  const services = args.length > 0 ? args : Object.keys(registry);

  for (const service of services) {
    if (!registry[service]) {
      process.stderr.write(
        `tensor-mcp ingest: unknown service '${service}' (known: ${Object.keys(registry).join(", ")})\n`,
      );
      return 1;
    }
  }

  const catalog = new Catalog({ path: opts.catalogPath });
  await catalog.open();
  try {
    let total = 0;
    for (const service of services) {
      const entry = registry[service];
      if (!entry) continue;
      process.stderr.write(`Ingesting ${service}...\n`);
      try {
        const n = await ingestService(catalog, {
          service,
          cwd: join(tensorMcpRoot, entry.vendorDir),
          command: entry.commandTemplate,
          envInject: entry.envInject,
          readinessTimeoutMs: 90_000,
        });
        process.stdout.write(`  ${service}: ${n} tools\n`);
        total += n;
      } catch (err) {
        process.stderr.write(
          `  ${service}: FAILED - ${(err as Error).message}\n`,
        );
        return 1;
      }
    }
    process.stdout.write(
      `Done. Indexed ${total} tools across ${services.length} services.\n`,
    );
    return 0;
  } finally {
    catalog.close();
  }
}
