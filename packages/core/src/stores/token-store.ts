import { createKeychainStore } from "./keychain";
import type { KeyValueStore, TokenBundle } from "./types";

const DEFAULT_SERVICE = "com.tensormcp.tokens";

function isTokenBundle(v: unknown): v is TokenBundle {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).access_token === "string"
  );
}

export interface TokenStoreOptions {
  service?: string;
}

/**
 * OS-keychain-backed `KeyValueStore<TokenBundle>`. JSON-encodes values
 * through the vendored `@tensor-mcp/keyring` `Entry` API. Treats missing
 * entries as `null` on read; idempotent on delete.
 */
export class TokenStore implements KeyValueStore<TokenBundle> {
  private readonly inner: KeyValueStore<TokenBundle>;

  constructor(opts: TokenStoreOptions = {}) {
    this.inner = createKeychainStore<TokenBundle>({
      service: opts.service ?? DEFAULT_SERVICE,
      validate: isTokenBundle,
      label: "TokenStore",
    });
  }

  set = (key: string, value: TokenBundle) => this.inner.set(key, value);
  get = (key: string) => this.inner.get(key);
  delete = (key: string) => this.inner.delete(key);
  list = () => this.inner.list();
}
