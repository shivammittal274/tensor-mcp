import {
  Entry,
  KeyringError,
  createDefaultStore,
  hasDefaultStore,
  setDefaultStore,
} from "@tensor-mcp/keyring";

export interface TokenBlob {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scopes?: string[];
}

let storeInit: Promise<void> | null = null;

function ensureDefaultStore(): Promise<void> {
  if (hasDefaultStore()) return Promise.resolve();
  if (storeInit) return storeInit;
  storeInit = createDefaultStore().then((store) => {
    if (!hasDefaultStore()) setDefaultStore(store);
  });
  return storeInit;
}

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
    try {
      const raw = await entry.getPassword();
      return JSON.parse(raw) as TokenBlob;
    } catch (err) {
      if (err instanceof KeyringError && err.kind === "NoEntry") return null;
      throw err;
    }
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
