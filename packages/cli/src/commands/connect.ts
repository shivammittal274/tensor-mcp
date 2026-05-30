import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Catalog,
  ConnectionsIndex,
  DEFAULT_SERVICE_REGISTRY,
  connectViaDCR,
  getService,
  ingestService,
  listOAuthCapableServices,
  Vault,
  type SpawnPoolEntry,
  type TokenBlob,
} from "@tensor-mcp/runtime";

export interface RunConnectOptions {
  vaultService?: string;
  indexPath?: string;
  catalogPath?: string;
  tensorMcpRoot?: string;
  skipIngest?: boolean;
  connectImpl?: (
    service: string,
  ) => Promise<{ blob: TokenBlob; client_id?: string }>;
}

const DEFAULT_VAULT_SERVICE = "com.tensormcp.cli";

function supportedList(): string {
  return (
    listOAuthCapableServices()
      .map((s) => s.service)
      .join(", ") || "none yet"
  );
}

function validateService(service: string): string | null {
  const def = getService(service);
  if (!def) {
    return `'${service}' is not supported in this build (supported: ${supportedList()})`;
  }
  if (def.oauth.type === "none") {
    return `'${service}' is vendored but OAuth is not yet wired (Phase 3 work)`;
  }
  return null;
}

async function callConnectImpl(
  service: string,
): Promise<{ blob: TokenBlob; client_id?: string }> {
  const def = getService(service);
  if (!def) throw new Error(`unknown service '${service}'`);
  if (def.oauth.type === "none") {
    throw new Error(
      `'${service}' OAuth client not yet registered (Phase 3 work). Service is vendored but OAuth flow pending.`,
    );
  }
  if (def.oauth.type === "static") {
    throw new Error(
      `'${service}' static OAuth not yet implemented (Phase 3 work).`,
    );
  }
  const result = await connectViaDCR({
    wellKnownUrl: def.oauth.wellKnownUrl,
    scope: def.oauth.scope,
    clientName: "tensor-mcp",
  });
  return result;
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

async function runAutoIngest(
  service: string,
  registryEntry: SpawnPoolEntry,
  tensorMcpRoot: string,
  catalogPath?: string,
): Promise<void> {
  process.stderr.write(
    `Connected. Ingesting ${service} tools into the catalog...\n`,
  );
  const catalog = new Catalog({ path: catalogPath });
  await catalog.open();
  try {
    const n = await ingestService(catalog, {
      service,
      cwd: join(tensorMcpRoot, registryEntry.vendorDir),
      command: registryEntry.commandTemplate,
      envInject: registryEntry.envInject,
      readinessTimeoutMs: 60_000,
    });
    process.stderr.write(`Indexed ${n} ${service} tools.\n`);
  } catch (err) {
    process.stderr.write(
      `Warning: ingest failed (${(err as Error).message}). You can retry with 'tensor-mcp ingest ${service}'.\n`,
    );
  } finally {
    catalog.close();
  }
}

export async function runConnect(
  args: string[],
  opts: RunConnectOptions = {},
): Promise<number> {
  const service = args[0];
  if (!service) {
    process.stderr.write(
      `tensor-mcp connect: missing service argument\n\nUsage: tensor-mcp connect <service>\n\nSupported services: ${supportedList()}\n`,
    );
    return 1;
  }

  const validationError = validateService(service);
  if (validationError) {
    process.stderr.write(`tensor-mcp connect: ${validationError}\n`);
    return 1;
  }

  const def = getService(service);
  if (!def) {
    process.stderr.write(
      `tensor-mcp connect: '${service}' is not supported in this build (supported: ${supportedList()})\n`,
    );
    return 1;
  }

  process.stderr.write(
    `Starting OAuth for ${service}... A browser tab will open.\n`,
  );

  const connectImpl = opts.connectImpl ?? callConnectImpl;
  let result: { blob: TokenBlob; client_id?: string };
  try {
    result = await connectImpl(service);
  } catch (err) {
    process.stderr.write(
      `tensor-mcp connect: ${(err as Error).message}\n`,
    );
    return 1;
  }

  const connectionId = `${service}:default`;
  const vault = new Vault({
    service: opts.vaultService ?? DEFAULT_VAULT_SERVICE,
  });
  const index = new ConnectionsIndex({ path: opts.indexPath });

  await vault.set(connectionId, result.blob);
  await index.upsert({
    service,
    connectionId,
    displayName: def.displayName,
    connectedAt: Date.now(),
  });

  process.stdout.write(
    `Connected ${service} (${connectionId}). Token stored in OS keychain.\n`,
  );

  if (!opts.skipIngest) {
    const registryEntry = DEFAULT_SERVICE_REGISTRY[service];
    if (registryEntry) {
      const tensorMcpRoot = opts.tensorMcpRoot ?? findWorkspaceRoot();
      await runAutoIngest(
        service,
        registryEntry,
        tensorMcpRoot,
        opts.catalogPath,
      );
    }
  }

  return 0;
}
