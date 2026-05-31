import {
  ConnectionsStore,
  OAuthClientStore,
  TokenStore,
} from "@tensor-mcp/core";
import { getService } from "@tensor-mcp/services";

export async function connectCmd(service: string): Promise<number> {
  const def = getService(service);
  if (!def) {
    process.stderr.write(`tensor-mcp connect: unknown service '${service}'\n`);
    return 1;
  }

  const tokenStore = new TokenStore({});
  const oauthClientStore = new OAuthClientStore({});
  const connections = new ConnectionsStore({});

  process.stderr.write(`Connecting ${def.displayName}...\n`);
  const { instructions } = def.auth.describe();
  // Skip describe() when it's the "not configured" warning — `connect()`
  // throws the same message below, and printing it twice is noisy.
  const isNotConfigured = instructions
    .toLowerCase()
    .includes("not configured");
  if (instructions && !isNotConfigured) {
    process.stderr.write(`${instructions}\n\n`);
  }

  try {
    const bundle = await def.auth.connect({
      serviceId: `${service}:default`,
      tokenStore,
      oauthClientStore,
    });

    await connections.set(`${service}:default`, {
      service,
      connectionId: `${service}:default`,
      displayName: def.displayName,
      connectedAt: Date.now(),
    });

    process.stdout.write(
      `Connected ${def.displayName}. Token stored in OS keychain.\n`,
    );

    process.stderr.write(`Ingesting ${service} catalog...\n`);
    try {
      const { Catalog, ingestService } = await import("@tensor-mcp/core");
      const catalog = new Catalog({});
      await catalog.open();
      try {
        const n = await ingestService(catalog, {
          service,
          spawn: def.spawn,
          remote: def.remote,
          token: bundle,
        });
        process.stdout.write(`Indexed ${n} ${service} tools.\n`);
      } finally {
        catalog.close();
      }
    } catch (err) {
      process.stderr.write(
        `Warning: ingest failed — ${(err as Error).message}\n`,
      );
      process.stderr.write(
        `You can retry by re-running 'tensor-mcp connect ${service}'.\n`,
      );
    }

    return 0;
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}
