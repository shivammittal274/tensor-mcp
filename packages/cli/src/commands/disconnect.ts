import {
  ConnectionsStore,
  OAuthClientStore,
  TokenStore,
} from "@tensor-mcp/core";
import { getService } from "@tensor-mcp/services";

export async function disconnectCmd(service: string): Promise<number> {
  const def = getService(service);
  if (!def) {
    process.stderr.write(
      `tensor-mcp disconnect: unknown service '${service}'\n`,
    );
    return 1;
  }

  const connectionId = `${service}:default`;
  const tokenStore = new TokenStore({});
  const oauthClientStore = new OAuthClientStore({});
  const connections = new ConnectionsStore({});

  const existing = await connections.get(connectionId);
  if (!existing) {
    process.stderr.write(
      `tensor-mcp disconnect: '${service}' is not connected\n`,
    );
    return 1;
  }

  await tokenStore.delete(connectionId);
  await oauthClientStore.delete(connectionId);
  await connections.delete(connectionId);

  process.stdout.write(`Disconnected ${def.displayName}.\n`);
  return 0;
}
