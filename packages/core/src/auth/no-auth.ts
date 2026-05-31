import type { TokenBundle } from "../stores/types";
import type { AuthStrategy, ConnectOptions } from "./types";

/**
 * For services that don't require authentication (public APIs, search
 * endpoints, etc.). `connect` immediately persists an anonymous bundle so
 * the rest of the system (catalog, callTool, isConnected checks) works
 * uniformly across authenticated and anonymous services.
 */
export function noAuth(): AuthStrategy {
  return {
    method: "no-auth",
    isConfigured() {
      return { ok: true };
    },
    describe() {
      return { instructions: "No authentication required." };
    },
    async connect(opts: ConnectOptions): Promise<TokenBundle> {
      const bundle: TokenBundle = { access_token: "anonymous" };
      await opts.tokenStore.set(opts.serviceId, bundle);
      return bundle;
    },
    async refresh(bundle: TokenBundle): Promise<TokenBundle> {
      return bundle;
    },
  };
}
