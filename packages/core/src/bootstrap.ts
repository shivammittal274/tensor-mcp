import { Catalog } from "./catalog/catalog";
import { ingestService } from "./catalog/ingest";
import { listPipedreamTools } from "./transports/pipedream";
import { listServices } from "./services";
import type { Service } from "./defineService";
import { ConnectionsStore } from "./stores/connections-store";

/**
 * Open the catalog and bring it in line with the bundled registry. Single
 * entry point for both `tensor-mcp <verb>` and `tensor-mcp serve` — neither
 * the CLI nor the MCP stdio server should construct a `Catalog` directly.
 *
 * Symmetric on purpose: the catalog you get back is guaranteed to reflect
 * the registry shape this binary was built with, regardless of which entry
 * point opened it.
 *
 * Fast path: the catalog's stored contract hash matches what this binary
 * computes from `listServices()` — return immediately (~100 µs warm). 99%+
 * of invocations exit here.
 *
 * Slow path: the hash differs (rename, sync, schema change). Drop orphan
 * rows whose `service` is no longer in the registry, then re-ingest every
 * connected Pipedream service so renames/new actions/schema drift land in
 * search results. Remote services aren't re-ingested here — they require
 * an auth bundle and naturally re-ingest on the next `connect`. Total cold
 * cost on a real catalog (15 services / ~300 tools) is single-digit ms.
 */
export interface BootstrapOptions {
  catalogPath?: string;
  connectionsPath?: string;
  /** Override registered services. Tests inject mocks; production omits. */
  services?: readonly Service[];
}

export async function bootstrap(
  opts: BootstrapOptions = {},
): Promise<Catalog> {
  const catalog = new Catalog({ path: opts.catalogPath });
  await catalog.open();

  const services = opts.services ?? listServices();
  const expected = computeContractHash(services);
  const stored = await catalog.getMeta("cache_contract_version");
  if (stored === expected) return catalog;

  const registeredIds = services.map((s) => s.id);
  const registeredSet = new Set(registeredIds);
  await catalog.dropOrphans(registeredIds);

  // Sweep orphan connection records too. When a service id is renamed
  // (slack → slack_v2) or removed, the record left behind in
  // connections.json is invisible to `apps` (the registry filter hides
  // it) but lingers as clutter. The catalog is already cleaned by
  // `dropOrphans` above; doing connections in the same pass keeps both
  // stores aligned with the registry.
  const connections = new ConnectionsStore({ path: opts.connectionsPath });
  const allConns = await connections.list();
  const stillConnected = new Set<string>();
  for (const { key, value } of allConns) {
    if (registeredSet.has(value.service)) {
      stillConnected.add(value.service);
    } else {
      await connections.delete(key);
    }
  }

  for (const service of services) {
    if (!stillConnected.has(service.id)) continue;
    const pd = "pipedream" in service ? service.pipedream : undefined;
    if (!pd) continue;
    await ingestService(catalog, { service: service.id, pipedream: pd });
  }

  await catalog.setMeta("cache_contract_version", expected);
  return catalog;
}

/**
 * Hash everything the catalog actually persists per row, so any change a
 * reconcile would need to fix triggers a mismatch by construction.
 *
 * Pipedream services are fully introspected (we own the action code in
 * this binary). Remote services contribute only their id — their tool
 * shape comes from the upstream MCP server at connect time, not from us.
 */
export function computeContractHash(services: readonly Service[]): string {
  const lines: string[] = [];
  for (const s of services) {
    const pd = "pipedream" in s ? s.pipedream : undefined;
    if (pd) {
      for (const tool of listPipedreamTools(pd.actions)) {
        const schema = JSON.stringify(tool.inputSchema);
        const desc = tool.description ?? "";
        lines.push(`${s.id}|${tool.name}|${hash(schema)}|${hash(desc)}`);
      }
      continue;
    }
    lines.push(`${s.id}|<remote>`);
  }
  lines.sort();
  return hash(lines.join("\n"));
}

function hash(s: string): string {
  const h = new Bun.CryptoHasher("sha256");
  h.update(s);
  return h.digest("hex").slice(0, 16);
}
