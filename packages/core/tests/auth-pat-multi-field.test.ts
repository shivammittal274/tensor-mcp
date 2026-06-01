import { describe, expect, test } from "bun:test";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { apiKeyAuth } from "../src/auth/paste-token";
import type { KeyValueStore, TokenBundle } from "../src/stores/types";

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
    return [...this.#data.entries()].map(([key, value]) => ({ key, value }));
  }
}

function makeOpts() {
  const tokenStore = new InlineMemoryStore<TokenBundle>();
  const oauthClientStore = new InlineMemoryStore<OAuthClientInformationFull>();
  return { tokenStore, oauthClientStore };
}

// Drives sequential `promptUser` calls: first response goes to the primary
// token prompt, the rest map onto `extraFields` in declaration order.
function sequentialPrompt(responses: readonly string[]) {
  let i = 0;
  return async (_msg: string) => {
    if (i >= responses.length) {
      throw new Error(
        `sequentialPrompt exhausted at call ${i}: ${responses.length} responses configured`,
      );
    }
    return responses[i++];
  };
}

describe("apiKeyAuth + extraFields", () => {
  test("describe() surfaces fields so the MCP layer can prompt structurally", () => {
    const s = apiKeyAuth({
      signupUrl: "https://example/keys",
      description: "needs read scope",
      extraFields: [
        { key: "instance_url", label: "Instance URL", default: "us.example.com" },
      ],
    });
    const d = s.describe();
    expect(d.fields).toHaveLength(1);
    expect(d.fields?.[0].key).toBe("instance_url");
    expect(d.fields?.[0].default).toBe("us.example.com");
  });

  test("interactive: prompts primary then each extra in order", async () => {
    const s = apiKeyAuth({
      signupUrl: "https://x",
      description: "y",
      extraFields: [
        { key: "instance_url", label: "Instance URL", default: "us.example.com" },
        { key: "region", label: "Region" },
      ],
    });
    const { tokenStore, oauthClientStore } = makeOpts();
    const bundle = await s.connect({
      serviceId: "svc",
      tokenStore,
      oauthClientStore,
      io: { promptUser: sequentialPrompt(["phx_abc", "eu.example.com", "us-west-2"]) },
    });
    expect(bundle.access_token).toBe("phx_abc");
    expect(bundle.metadata).toEqual({ instance_url: "eu.example.com", region: "us-west-2" });
    expect((await tokenStore.get("svc"))?.metadata?.region).toBe("us-west-2");
  });

  test("interactive: empty response uses field default", async () => {
    const s = apiKeyAuth({
      signupUrl: "https://x",
      description: "y",
      extraFields: [
        { key: "instance_url", label: "Instance URL", default: "us.example.com" },
      ],
    });
    const { tokenStore, oauthClientStore } = makeOpts();
    const bundle = await s.connect({
      serviceId: "svc",
      tokenStore,
      oauthClientStore,
      io: { promptUser: sequentialPrompt(["phx_abc", ""]) },
    });
    expect(bundle.metadata?.instance_url).toBe("us.example.com");
  });

  test("interactive: empty response on a no-default field throws", async () => {
    const s = apiKeyAuth({
      signupUrl: "https://x",
      description: "y",
      extraFields: [{ key: "subdomain", label: "Subdomain" }],
    });
    const { tokenStore, oauthClientStore } = makeOpts();
    await expect(
      s.connect({
        serviceId: "svc",
        tokenStore,
        oauthClientStore,
        io: { promptUser: sequentialPrompt(["phx_abc", ""]) },
      }),
    ).rejects.toThrow(/Subdomain/);
  });

  test("prefilled: MCP path skips prompts, stores access_token + metadata", async () => {
    const s = apiKeyAuth({
      signupUrl: "https://x",
      description: "y",
      extraFields: [
        { key: "instance_url", label: "Instance URL", default: "us.example.com" },
      ],
    });
    const { tokenStore, oauthClientStore } = makeOpts();
    const bundle = await s.connect({
      serviceId: "svc",
      tokenStore,
      oauthClientStore,
      prefilled: {
        access_token: "phx_abc",
        metadata: { instance_url: "eu.example.com" },
      },
    });
    expect(bundle.access_token).toBe("phx_abc");
    expect(bundle.metadata?.instance_url).toBe("eu.example.com");
  });

  test("prefilled: missing extra falls back to field default", async () => {
    const s = apiKeyAuth({
      signupUrl: "https://x",
      description: "y",
      extraFields: [
        { key: "instance_url", label: "Instance URL", default: "us.example.com" },
      ],
    });
    const { tokenStore, oauthClientStore } = makeOpts();
    const bundle = await s.connect({
      serviceId: "svc",
      tokenStore,
      oauthClientStore,
      prefilled: { access_token: "phx_abc" /* no metadata */ },
    });
    expect(bundle.metadata?.instance_url).toBe("us.example.com");
  });

  test("prefilled: missing extra on a no-default field throws", async () => {
    const s = apiKeyAuth({
      signupUrl: "https://x",
      description: "y",
      extraFields: [{ key: "subdomain", label: "Subdomain" }],
    });
    const { tokenStore, oauthClientStore } = makeOpts();
    await expect(
      s.connect({
        serviceId: "svc",
        tokenStore,
        oauthClientStore,
        prefilled: { access_token: "x" /* no metadata.subdomain */ },
      }),
    ).rejects.toThrow(/Subdomain/);
  });

  test("back-compat: single-field PAT still stores access_token only (no metadata)", async () => {
    const s = apiKeyAuth({ signupUrl: "https://x", description: "y" });
    const { tokenStore, oauthClientStore } = makeOpts();
    const bundle = await s.connect({
      serviceId: "svc",
      tokenStore,
      oauthClientStore,
      io: { promptUser: sequentialPrompt(["phx_abc"]) },
    });
    expect(bundle.access_token).toBe("phx_abc");
    expect(bundle.metadata).toBeUndefined();
  });
});
