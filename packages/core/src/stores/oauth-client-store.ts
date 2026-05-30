import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { createKeychainStore } from "./keychain";
import type { KeyValueStore } from "./types";

const DEFAULT_SERVICE = "com.tensormcp.oauth-clients";

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
  private readonly inner: KeyValueStore<OAuthClientInformationFull>;

  constructor(opts: OAuthClientStoreOptions = {}) {
    this.inner = createKeychainStore<OAuthClientInformationFull>({
      service: opts.service ?? DEFAULT_SERVICE,
      validate: isOAuthClient,
      label: "OAuthClientStore",
    });
  }

  set = (key: string, value: OAuthClientInformationFull) => this.inner.set(key, value);
  get = (key: string) => this.inner.get(key);
  delete = (key: string) => this.inner.delete(key);
  list = () => this.inner.list();
}
