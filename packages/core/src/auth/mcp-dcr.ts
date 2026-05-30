import { auth as sdkAuth } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { TokenBundle } from "../stores/types";
import { startCallbackServer } from "./callback";
import { VaultBackedOAuthProvider } from "./provider";
import type { AuthStrategy, ConnectOptions } from "./types";

export interface McpDcrAuthConfig {
  mcpServerUrl: string;
  scope?: string;
  clientName?: string;
  timeoutMs?: number;
}

export function mcpDcrAuth(config: McpDcrAuthConfig): AuthStrategy {
  return {
    method: "oauth-dcr",
    describe() {
      return {
        instructions: `Opens a browser to authenticate with ${new URL(config.mcpServerUrl).host}.`,
      };
    },
    async connect(opts: ConnectOptions): Promise<TokenBundle> {
      const state = randomState();
      const callback = await startCallbackServer({
        expectedState: state,
        timeoutMs: config.timeoutMs ?? 300_000,
      });

      try {
        const redirectUrl = callback.redirectUri;
        const clientMetadata: OAuthClientMetadata = {
          client_name: config.clientName ?? "tensor-mcp",
          redirect_uris: [redirectUrl],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        };
        if (config.scope) clientMetadata.scope = config.scope;

        const openBrowser = opts.io?.openBrowser ?? defaultOpenBrowser;
        const provider = new VaultBackedOAuthProvider({
          serviceId: opts.serviceId,
          tokenStore: opts.tokenStore,
          oauthClientStore: opts.oauthClientStore,
          redirectUrl,
          clientMetadata,
          state,
          openBrowser,
        });

        const r1 = await sdkAuth(provider, {
          serverUrl: config.mcpServerUrl,
          scope: config.scope,
        });
        if (r1 !== "REDIRECT") {
          throw new Error(`expected REDIRECT, got ${r1}`);
        }

        const { code } = await callback.awaitCode;

        const r2 = await sdkAuth(provider, {
          serverUrl: config.mcpServerUrl,
          authorizationCode: code,
          scope: config.scope,
        });
        if (r2 !== "AUTHORIZED") {
          throw new Error(`expected AUTHORIZED, got ${r2}`);
        }

        const bundle = await opts.tokenStore.get(opts.serviceId);
        if (!bundle) throw new Error("auth succeeded but no token bundle persisted");
        return bundle;
      } finally {
        callback.close();
      }
    },
  };
}

function randomState(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
}

async function defaultOpenBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  await Bun.spawn([cmd, url]).exited;
}
