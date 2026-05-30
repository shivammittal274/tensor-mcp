import {
  Vault,
  ConnectionsIndex,
  connectLinear,
  type TokenBlob,
} from "@tensor-mcp/runtime";

export interface RunConnectOptions {
  vaultService?: string;
  indexPath?: string;
  connectImpl?: (
    service: string,
  ) => Promise<{ blob: TokenBlob; client_id?: string }>;
}

const DEFAULT_VAULT_SERVICE = "com.tensormcp.cli";

const SUPPORTED_SERVICES: Record<
  string,
  {
    displayName: string;
    connect: () => Promise<{ blob: TokenBlob; client_id?: string }>;
  }
> = {
  linear: {
    displayName: "Linear",
    connect: async () => {
      const r = await connectLinear();
      return { blob: r.blob, client_id: r.client_id };
    },
  },
};

const supportedList = () => Object.keys(SUPPORTED_SERVICES).join(", ");

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

  const entry = SUPPORTED_SERVICES[service];
  if (!entry) {
    process.stderr.write(
      `tensor-mcp connect: '${service}' is not supported in this build (supported: ${supportedList()})\n`,
    );
    return 1;
  }

  process.stderr.write(
    `Starting OAuth for ${service}... A browser tab will open.\n`,
  );

  const connectImpl = opts.connectImpl ?? ((_svc: string) => entry.connect());
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
    displayName: entry.displayName,
    connectedAt: Date.now(),
  });

  process.stdout.write(
    `Connected ${service} (${connectionId}). Token stored in OS keychain.\n`,
  );
  return 0;
}
