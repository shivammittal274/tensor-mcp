import { describe, expect, test } from "bun:test";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { KeyValueStore, TokenBundle } from "../src/stores/types";
import { apiKeyAuth, patAuth } from "../src/auth/paste-token";

class InlineMemoryStore<T> implements KeyValueStore<T> {
  #data = new Map<string, T>();
  async get(key: string): Promise<T | null> {
    return this.#data.has(key) ? (this.#data.get(key) as T) : null;
  }
  async set(key: string, value: T): Promise<void> {
    this.#data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.#data.delete(key);
  }
  async list(): Promise<Array<{ key: string; value: T }>> {
    return Array.from(this.#data.entries()).map(([key, value]) => ({ key, value }));
  }
}

function makeConnectOpts(promptResponse: string | (() => string | Promise<string>)) {
  const tokenStore = new InlineMemoryStore<TokenBundle>();
  const oauthClientStore = new InlineMemoryStore<OAuthClientInformationFull>();
  const promptUser = async (_msg: string) => {
    return typeof promptResponse === "function" ? await promptResponse() : promptResponse;
  };
  return {
    opts: {
      serviceId: "svc",
      tokenStore,
      oauthClientStore,
      io: { promptUser },
    },
    tokenStore,
  };
}

describe("patAuth", () => {
  test("describe() includes tokenUrl + description", () => {
    const s = patAuth({ tokenUrl: "https://x.example/tokens", description: "needs read scope" });
    const d = s.describe();
    expect(d.instructions).toContain("https://x.example/tokens");
    expect(d.instructions).toContain("needs read scope");
  });

  test("method tag is 'pat'", () => {
    const s = patAuth({ tokenUrl: "https://x", description: "y" });
    expect(s.method).toBe("pat");
  });

  test("trims whitespace and persists bundle", async () => {
    const s = patAuth({ tokenUrl: "https://x", description: "y" });
    const { opts, tokenStore } = makeConnectOpts("   secret-tok   \n");
    const result = await s.connect(opts);
    expect(result.access_token).toBe("secret-tok");
    const stored = await tokenStore.get("svc");
    expect(stored?.access_token).toBe("secret-tok");
  });

  test("empty token throws", async () => {
    const s = patAuth({ tokenUrl: "https://x", description: "y" });
    const { opts } = makeConnectOpts("   ");
    await expect(s.connect(opts)).rejects.toThrow(/Empty (token|Personal Access Token)/);
  });

  test("uses injected promptUser (no default prompt() invoked)", async () => {
    const s = patAuth({ tokenUrl: "https://x", description: "y" });
    let prompted = false;
    const { opts } = makeConnectOpts(() => {
      prompted = true;
      return "abc";
    });
    await s.connect(opts);
    expect(prompted).toBe(true);
  });
});

describe("apiKeyAuth", () => {
  test("method tag is 'api-key'", () => {
    const s = apiKeyAuth({ signupUrl: "https://x", description: "y" });
    expect(s.method).toBe("api-key");
  });

  test("describe() mentions signupUrl + description", () => {
    const s = apiKeyAuth({ signupUrl: "https://cal.com/keys", description: "scope explanation" });
    const d = s.describe();
    expect(d.instructions).toContain("https://cal.com/keys");
    expect(d.instructions).toContain("scope explanation");
  });

  test("persists trimmed bundle on success", async () => {
    const s = apiKeyAuth({ signupUrl: "https://x", description: "y" });
    const { opts, tokenStore } = makeConnectOpts("  ak-12345  ");
    const result = await s.connect(opts);
    expect(result.access_token).toBe("ak-12345");
    expect((await tokenStore.get("svc"))?.access_token).toBe("ak-12345");
  });

  test("empty key throws", async () => {
    const s = apiKeyAuth({ signupUrl: "https://x", description: "y" });
    const { opts } = makeConnectOpts("");
    await expect(s.connect(opts)).rejects.toThrow(/Empty API key/);
  });
});
