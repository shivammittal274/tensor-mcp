import {
  Entry,
  KeyringError,
  createDefaultStore,
  hasDefaultStore,
  setDefaultStore,
} from "@tensor-mcp/keyring";
import type { KeyValueStore, TokenBundle } from "./types";

const DEFAULT_SERVICE = "com.tensormcp.tokens";

let storeInit: Promise<void> | null = null;

function ensureDefaultStore(): Promise<void> {
  if (hasDefaultStore()) return Promise.resolve();
  storeInit ??= createDefaultStore().then(
    (store) => {
      if (!hasDefaultStore()) setDefaultStore(store);
    },
    (err) => {
      storeInit = null;
      throw err;
    },
  );
  return storeInit;
}

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
  private readonly service: string;

  constructor(opts: TokenStoreOptions = {}) {
    this.service = opts.service ?? DEFAULT_SERVICE;
  }

  async set(key: string, value: TokenBundle): Promise<void> {
    await ensureDefaultStore();
    const entry = new Entry(this.service, key);
    await entry.setPassword(JSON.stringify(value));
  }

  async get(key: string): Promise<TokenBundle | null> {
    await ensureDefaultStore();
    const entry = new Entry(this.service, key);
    let raw: string;
    try {
      raw = await entry.getPassword();
    } catch (err) {
      if (err instanceof KeyringError && err.kind === "NoEntry") return null;
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`TokenStore: corrupted JSON for key=${key}`);
    }
    if (!isTokenBundle(parsed)) {
      throw new Error(`TokenStore: invalid token shape for key=${key}`);
    }
    return parsed;
  }

  async delete(key: string): Promise<void> {
    await ensureDefaultStore();
    const entry = new Entry(this.service, key);
    try {
      await entry.deleteCredential();
    } catch (err) {
      if (err instanceof KeyringError && err.kind === "NoEntry") return;
      throw err;
    }
  }

  // Vendored keyring's CredentialStore has no enumeration primitive — the
  // OS APIs we wrap (Security.framework / Secret Service) require either a
  // separate index or a wildcard query we don't model. Until we add an
  // index, list() is not a hot path; return empty.
  // TODO: back this with a sidecar index when an enumeration use-case appears.
  async list(): Promise<Array<{ key: string; value: TokenBundle }>> {
    await ensureDefaultStore();
    return [];
  }
}
