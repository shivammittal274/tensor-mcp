import { Vault, ConnectionsIndex } from "@tensor-mcp/runtime";

export interface RunDisconnectOptions {
  vaultService?: string;
  indexPath?: string;
}

const DEFAULT_VAULT_SERVICE = "com.tensormcp.cli";

export async function runDisconnect(
  args: string[],
  opts: RunDisconnectOptions = {},
): Promise<number> {
  const service = args[0];
  if (!service) {
    process.stderr.write(
      "tensor-mcp disconnect: missing service argument\n\nUsage: tensor-mcp disconnect <service>\n",
    );
    return 1;
  }

  const connectionId = `${service}:default`;
  const vault = new Vault({ service: opts.vaultService ?? DEFAULT_VAULT_SERVICE });
  const index = new ConnectionsIndex({ path: opts.indexPath });

  const existing = await index.get(connectionId);
  if (!existing) {
    process.stderr.write(`tensor-mcp disconnect: '${service}' is not connected\n`);
    return 1;
  }

  await vault.delete(connectionId);
  await index.remove(connectionId);
  process.stdout.write(`Disconnected '${service}' (${connectionId}).\n`);
  return 0;
}
