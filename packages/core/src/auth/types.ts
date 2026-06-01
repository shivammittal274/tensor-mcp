import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { KeyValueStore, TokenBundle } from "../stores/types";

/**
 * What the user sees when running `tensor-mcp connect <service>`.
 * Each AuthStrategy is responsible for its own UX (open a browser,
 * prompt for input, etc.) and for persisting the result.
 */
export type AuthMethod =
  | "oauth-dcr"
  | "oauth"
  | "pat"
  | "api-key"
  | "no-auth";

export interface AuthStrategy {
  readonly method: AuthMethod;

  /**
   * Can this strategy run? Vendor-specific OAuth strategies return
   * `{ ok: false }` when their `client_id` env var is unset; pat/api-key/
   * no-auth always return `{ ok: true }`. Used by the registry to filter
   * "connectable" services without string-matching on `describe()` prose.
   */
  isConfigured(): { ok: true } | { ok: false; reason: string };

  /**
   * Human-readable description shown in `tensor-mcp connect <service>`
   * before the strategy runs. `fields` enumerates any extra non-secret
   * configuration the user must provide alongside the primary credential
   * (e.g. PostHog's `instance_url`, Supabase's `subdomain`). When absent
   * or empty, the strategy only needs the single pasted token.
   */
  describe(): { instructions: string; fields?: readonly FieldSpec[] };

  /**
   * Run the strategy interactively. On success, persists the bundle and
   * returns it. On failure, throws. Idempotent: re-running overwrites.
   */
  connect(opts: ConnectOptions): Promise<TokenBundle>;

  /**
   * Refresh `bundle` non-interactively (no browser, no prompt). For OAuth
   * strategies: POST a refresh_token grant. For paste-style strategies
   * (api-key, pat) and no-auth: returns the bundle unchanged. Throws
   * `AuthRefreshFailedError` if the vendor rejects the refresh — the
   * caller surfaces a "re-run connect" prompt.
   *
   * Implementations should persist the new bundle to `opts.tokenStore`
   * before returning so subsequent reads see the refreshed token.
   */
  refresh(bundle: TokenBundle, opts: RefreshOptions): Promise<TokenBundle>;
}

export interface ConnectOptions {
  /** Service slug (e.g. "linear", "github"). Becomes the key in stores. */
  serviceId: string;
  /** Encrypted token store. Strategy persists here on success. */
  tokenStore: KeyValueStore<TokenBundle>;
  /** Encrypted DCR client info store. OAuth strategies persist here. */
  oauthClientStore: KeyValueStore<OAuthClientInformationFull>;
  /** Optional injection for tests (overrides browser-opening, prompt, etc). */
  io?: AuthIO;
  /**
   * Pre-filled credential — when supplied, the strategy skips interactive
   * prompts. Used by the MCP `connect_app` path (no TTY) and by the CLI
   * `connect <app> <token>` shortcut. For multi-field PAT services
   * (PostHog, Supabase) the metadata map carries the extras alongside the
   * primary token.
   */
  prefilled?: {
    access_token: string;
    metadata?: Record<string, string>;
  };
}

/**
 * One extra field a paste-token strategy needs in addition to the primary
 * credential. Used by services where a single Bearer token isn't enough:
 * PostHog needs the `instance_url`, Supabase needs the project `subdomain`,
 * self-hosted GitLab needs `base_api_url`.
 */
export interface FieldSpec {
  /** Storage key under `TokenBundle.metadata`. */
  key: string;
  /** UI label — what the CLI prompt + MCP form display. */
  label: string;
  /** Optional helper text shown next to the prompt / form field. */
  description?: string;
  /** When set, an empty user response uses this. CLI shows it in the prompt. */
  default?: string;
  /** `true` for secrets (CLI/MCP should mask input). Defaults to `false`. */
  isSecret?: boolean;
}

export interface RefreshOptions {
  /** Connection id — same key the bundle was stored under. */
  serviceId: string;
  /** Where to persist the refreshed bundle. */
  tokenStore: KeyValueStore<TokenBundle>;
  /** Required for DCR strategies that look up the registered client. */
  oauthClientStore: KeyValueStore<OAuthClientInformationFull>;
}

/**
 * Injection point for tests. Implementations of strategies must accept this
 * and never call `prompt()` / `Bun.spawn(["open", url])` directly.
 */
export interface AuthIO {
  openBrowser?: (url: string) => Promise<void>;
  promptUser?: (message: string) => Promise<string>;
  /** Called by OAuth strategy when it has the redirect URL. Tests override. */
  awaitCallback?: (expectedState: string, redirectUri: string) => Promise<string>;
}
