/**
 * Typed key-value store interface.
 *
 * Implementations:
 *   - TokenStore        — OS keychain (vendored Composio keyring), encrypted
 *   - OAuthClientStore  — OS keychain, separate namespace, encrypted
 *   - ConnectionsStore  — JSON file (non-secret metadata)
 *   - MemoryStore       — in-memory, for tests
 */
export interface KeyValueStore<T> {
  /** Returns the value or `null` if not present. Throws on storage errors. */
  get(key: string): Promise<T | null>;

  /** Insert or overwrite. */
  set(key: string, value: T): Promise<void>;

  /** Idempotent — does NOT throw if `key` is absent. */
  delete(key: string): Promise<void>;

  /** Returns all entries, in implementation-defined order. */
  list(): Promise<Array<{ key: string; value: T }>>;
}

/**
 * Universal credential bundle. Decoupled from OAuth specifics so PATs and
 * API keys fit in the same store.
 *
 * For OAuth flows, `access_token` is the bearer token, `expires_at` is the
 * absolute deadline (unix ms; we compute from `expires_in`). For PAT/API key,
 * only `access_token` is populated.
 *
 * `metadata` holds service-specific extras that `forgeAuthData` may need:
 *   - Jira: { selected_cloud_id: "..." }
 *   - Slack: { slack_user_token: "xoxp-..." }
 */
export interface TokenBundle {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scopes?: string[];
  metadata?: Record<string, string>;
}
