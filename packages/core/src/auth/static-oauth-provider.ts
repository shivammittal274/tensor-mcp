import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { KeyValueStore, TokenBundle } from "../stores/types";

export interface StaticOAuthProviderOpts {
  serviceId: string;
  tokenStore: KeyValueStore<TokenBundle>;
  redirectUrl: string;
  clientMetadata: OAuthClientMetadata;
  /** Hardcoded client_id (+ optional secret for confidential clients). */
  clientInfo: { client_id: string; client_secret?: string };
  /** Hardcoded authorization-server URL — skips RFC 9728. */
  authServerUrl: string;
  /** Hardcoded authorization-server metadata — skips RFC 8414. */
  authServerMetadata: AuthorizationServerMetadata;
  state: string;
  openBrowser: (url: string) => Promise<void>;
}

/**
 * OAuthClientProvider that bypasses RFC 9728 + RFC 8414 discovery AND RFC
 * 7591 dynamic client registration. Used by vendors that ship a static
 * OAuth client (Slack, Gmail, …) — we register the app once, then bake the
 * client_id + auth-server metadata into the service definition.
 *
 * The SDK consults `discoveryState()` first (auth.js:166): if it returns a
 * non-undefined object with `authorizationServerUrl`, the discovery branch
 * is fully skipped. Returning `clientInformation()` non-undefined likewise
 * skips DCR (auth.js:227).
 *
 * Token persistence + code-verifier handling mirror VaultBackedOAuthProvider.
 */
export class StaticOAuthProvider implements OAuthClientProvider {
  #verifier: string | null = null;

  constructor(private opts: StaticOAuthProviderOpts) {}

  get redirectUrl(): string {
    return this.opts.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.opts.clientMetadata;
  }

  state(): string {
    return this.opts.state;
  }

  // Non-undefined return short-circuits discovery in the SDK orchestrator.
  async discoveryState(): Promise<OAuthDiscoveryState> {
    return {
      authorizationServerUrl: this.opts.authServerUrl,
      authorizationServerMetadata: this.opts.authServerMetadata,
    };
  }

  // No-op: metadata is static, nothing to persist between calls.
  async saveDiscoveryState(_state: OAuthDiscoveryState): Promise<void> {
    /* static config — no persistence */
  }

  // Non-undefined return short-circuits DCR in the SDK orchestrator.
  async clientInformation(): Promise<OAuthClientInformationFull> {
    return this.opts.clientInfo as OAuthClientInformationFull;
  }

  // No-op: client info is static. We deliberately do not implement
  // `saveClientInformation`; the SDK only calls it after a DCR round-trip,
  // which we never trigger.

  async tokens(): Promise<OAuthTokens | undefined> {
    const bundle = await this.opts.tokenStore.get(this.opts.serviceId);
    if (!bundle) return undefined;
    const tokens: OAuthTokens = {
      access_token: bundle.access_token,
      token_type: "Bearer",
    };
    if (bundle.refresh_token) tokens.refresh_token = bundle.refresh_token;
    if (typeof bundle.expires_at === "number") {
      const remaining = Math.max(
        0,
        Math.floor((bundle.expires_at - Date.now()) / 1000),
      );
      tokens.expires_in = remaining;
    }
    if (bundle.scopes && bundle.scopes.length > 0) {
      tokens.scope = bundle.scopes.join(" ");
    }
    return tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const prior = await this.opts.tokenStore.get(this.opts.serviceId);
    const bundle: TokenBundle = {
      access_token: tokens.access_token,
    };
    if (tokens.refresh_token) {
      bundle.refresh_token = tokens.refresh_token;
    } else if (prior?.refresh_token) {
      bundle.refresh_token = prior.refresh_token;
    }
    if (typeof tokens.expires_in === "number") {
      bundle.expires_at = Date.now() + tokens.expires_in * 1000;
    }
    if (tokens.scope) {
      const scopes = tokens.scope.split(/\s+/).filter(Boolean);
      if (scopes.length > 0) bundle.scopes = scopes;
    } else if (prior?.scopes) {
      bundle.scopes = prior.scopes;
    }
    if (prior?.metadata) bundle.metadata = prior.metadata;
    await this.opts.tokenStore.set(this.opts.serviceId, bundle);
  }

  async saveCodeVerifier(v: string): Promise<void> {
    this.#verifier = v;
  }

  async codeVerifier(): Promise<string> {
    if (!this.#verifier) {
      throw new Error("StaticOAuthProvider: code verifier not saved");
    }
    return this.#verifier;
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    await this.opts.openBrowser(url.toString());
  }
}
