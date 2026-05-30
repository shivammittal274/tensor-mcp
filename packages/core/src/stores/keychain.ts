import {
  Entry,
  KeyringError,
  createDefaultStore,
  hasDefaultStore,
  setDefaultStore,
} from "@tensor-mcp/keyring";
import type { KeyValueStore } from "./types";

/**
 * Shared implementation for OS-keychain-backed `KeyValueStore<T>` stores.
 *
 * Both `TokenStore` (TokenBundle) and `OAuthClientStore` (OAuthClientInformationFull)
 * are thin wrappers around this factory — they differ only in the keychain service
 * namespace and the type predicate that validates parsed JSON on read.
 *
 * The vendored `@tensor-mcp/keyring` `CredentialStore` interface has no
 * enumeration primitive (the underlying OS APIs require a sidecar index for
 * listing), so `list()` returns `[]`. We accept this trade-off until a
 * use-case demands enumeration.
 */

let storeInit: Promise<void> | null = null;

async function ensureDefaultStore(): Promise<void> {
  if (hasDefaultStore()) return;
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

export interface KeychainStoreConfig<T> {
  /** Keychain service namespace (e.g. `"com.tensormcp.tokens"`). */
  service: string;
  /** Predicate validating a parsed-JSON value matches `T`. */
  validate: (v: unknown) => v is T;
  /** Label used in error messages (e.g. `"TokenStore"`, `"OAuthClientStore"`). */
  label: string;
}

export function createKeychainStore<T>(config: KeychainStoreConfig<T>): KeyValueStore<T> {
  const { service, validate, label } = config;

  return {
    async set(key: string, value: T): Promise<void> {
      await ensureDefaultStore();
      await new Entry(service, key).setPassword(JSON.stringify(value));
    },

    async get(key: string): Promise<T | null> {
      await ensureDefaultStore();
      let raw: string;
      try {
        raw = await new Entry(service, key).getPassword();
      } catch (err) {
        if (err instanceof KeyringError && err.kind === "NoEntry") return null;
        throw err;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`${label}: corrupted JSON for key=${key}`);
      }
      if (!validate(parsed)) {
        throw new Error(`${label}: invalid value shape for key=${key}`);
      }
      return parsed;
    },

    async delete(key: string): Promise<void> {
      await ensureDefaultStore();
      try {
        await new Entry(service, key).deleteCredential();
      } catch (err) {
        if (err instanceof KeyringError && err.kind === "NoEntry") return;
        throw err;
      }
    },

    async list(): Promise<Array<{ key: string; value: T }>> {
      await ensureDefaultStore();
      return [];
    },
  };
}
