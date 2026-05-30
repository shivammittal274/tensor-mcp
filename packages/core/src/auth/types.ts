import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { KeyValueStore, TokenBundle } from "../stores/types";

/**
 * What the user sees when running `tensor-mcp connect <service>`.
 * Each AuthStrategy is responsible for its own UX (open a browser,
 * prompt for input, etc.) and for persisting the result.
 */
export type AuthMethod = "oauth-dcr" | "pat" | "api-key";

export interface AuthStrategy {
  readonly method: AuthMethod;

  /**
   * Human-readable description shown in `tensor-mcp connect <service>`
   * before the strategy runs. Returns instructions or empty string.
   */
  describe(): { instructions: string };

  /**
   * Run the strategy interactively. On success, persists the bundle and
   * returns it. On failure, throws. Idempotent: re-running overwrites.
   */
  connect(opts: ConnectOptions): Promise<TokenBundle>;
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
