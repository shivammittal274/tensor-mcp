import {
  Entry,
  KeyringError,
  createDefaultStore,
  hasDefaultStore,
  setDefaultStore,
} from "@tensor-mcp/keyring";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { KeyValueStore } from "./types";

const DEFAULT_SERVICE = "com.tensormcp.oauth-clients";

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

function isOAuthClient(v: unknown): v is OAuthClientInformationFull {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).client_id === "string"
  );
}

export interface OAuthClientStoreOptions {
  service?: string;
}

/**
 * OS-keychain-backed `KeyValueStore<OAuthClientInformationFull>` for
 * DCR-registered OAuth clients. Same `Entry` plumbing as `TokenStore` but
 * a distinct service namespace so token rows and client rows can't
 * collide. Validates only `client_id: string` on read — everything else
 * in the RFC 7591 response is optional.
 */
export class OAuthClientStore implements KeyValueStore<OAuthClientInformationFull> {
  private readonly service: string;

  constructor(opts: OAuthClientStoreOptions = {}) {
    this.service = opts.service ?? DEFAULT_SERVICE;
  }

  async set(key: string, value: OAuthClientInformationFull): Promise<void> {
    await ensureDefaultStore();
    const entry = new Entry(this.service, key);
    await entry.setPassword(JSON.stringify(value));
  }

  async get(key: string): Promise<OAuthClientInformationFull | null> {
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
      throw new Error(`OAuthClientStore: corrupted JSON for key=${key}`);
    }
    if (!isOAuthClient(parsed)) {
      throw new Error(`OAuthClientStore: invalid client shape for key=${key}`);
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

  // See TokenStore.list — same constraint applies here.
  // TODO: back this with a sidecar index when an enumeration use-case appears.
  async list(): Promise<Array<{ key: string; value: OAuthClientInformationFull }>> {
    await ensureDefaultStore();
    return [];
  }
}
