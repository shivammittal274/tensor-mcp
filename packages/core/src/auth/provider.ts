import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { KeyValueStore, TokenBundle } from "../stores/types";

export interface VaultBackedProviderOpts {
  serviceId: string;
  tokenStore: KeyValueStore<TokenBundle>;
  oauthClientStore: KeyValueStore<OAuthClientInformationFull>;
  redirectUrl: string;
  clientMetadata: OAuthClientMetadata;
  state: string;
  openBrowser: (url: string) => Promise<void>;
}

export class VaultBackedOAuthProvider implements OAuthClientProvider {
  #verifier: string | null = null;

  constructor(private opts: VaultBackedProviderOpts) {}

  get redirectUrl(): string {
    return this.opts.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.opts.clientMetadata;
  }

  state(): string {
    return this.opts.state;
  }

  async clientInformation(): Promise<OAuthClientInformationFull | undefined> {
    return (await this.opts.oauthClientStore.get(this.opts.serviceId)) ?? undefined;
  }

  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    await this.opts.oauthClientStore.set(this.opts.serviceId, info);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const bundle = await this.opts.tokenStore.get(this.opts.serviceId);
    if (!bundle) return undefined;
    const tokens: OAuthTokens = {
      access_token: bundle.access_token,
      token_type: "Bearer",
    };
    if (bundle.refresh_token) tokens.refresh_token = bundle.refresh_token;
    if (typeof bundle.expires_at === "number") {
      const remaining = Math.max(0, Math.floor((bundle.expires_at - Date.now()) / 1000));
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
      throw new Error("OAuthClientProvider: code verifier not saved");
    }
    return this.#verifier;
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    await this.opts.openBrowser(url.toString());
  }
}
