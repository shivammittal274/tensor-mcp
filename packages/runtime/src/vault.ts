import {
  Entry,
  KeyringError,
  createDefaultStore,
  hasDefaultStore,
  setDefaultStore,
} from "@tensor-mcp/keyring";

// Matches OAuth2 token-endpoint JSON shape (snake_case is intentional).
export interface TokenBlob {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scopes?: string[];
}

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

function isTokenBlob(v: unknown): v is TokenBlob {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).access_token === "string"
  );
}

/**
 * Thin OAuth-token-blob wrapper over @tensor-mcp/keyring's Entry API.
 * JSON-encodes TokenBlob values for the OS keychain. Treats missing entries
 * as null on read; idempotent on delete.
 */
export class Vault {
  private readonly service: string;

  constructor(opts: { service: string }) {
    this.service = opts.service;
  }

  async set(connectionId: string, blob: TokenBlob): Promise<void> {
    await ensureDefaultStore();
    const entry = new Entry(this.service, connectionId);
    await entry.setPassword(JSON.stringify(blob));
  }

  async get(connectionId: string): Promise<TokenBlob | null> {
    await ensureDefaultStore();
    const entry = new Entry(this.service, connectionId);
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
      throw new Error(
        `Vault: corrupted JSON for connectionId=${connectionId}`,
      );
    }
    if (!isTokenBlob(parsed)) {
      throw new Error(
        `Vault: invalid token shape for connectionId=${connectionId}`,
      );
    }
    return parsed;
  }

  async delete(connectionId: string): Promise<void> {
    await ensureDefaultStore();
    const entry = new Entry(this.service, connectionId);
    try {
      await entry.deleteCredential();
    } catch (err) {
      if (err instanceof KeyringError && err.kind === "NoEntry") return;
      throw err;
    }
  }
}
