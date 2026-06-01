import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrap, computeContractHash } from "../src/bootstrap";
import { Catalog } from "../src/catalog/catalog";
import { defineService } from "../src/defineService";
import { ConnectionsStore } from "../src/stores/connections-store";

const FAKE_APP = {
  type: "app" as const,
  app: "fake",
  propDefinitions: {},
  methods: {},
};

function pipedreamService(id: string, toolNames: readonly string[]) {
  return defineService({
    id,
    displayName: id,
    auth: {
      kind: "no-auth",
      method: "no-auth",
      connect: async () => ({ access_token: "x" }),
      refresh: async (b: unknown) => b,
      isConfigured: () => ({ ok: true }),
    } as never,
    pipedream: {
      app: FAKE_APP as never,
      actions: toolNames.map((name) => ({
        type: "action",
        key: `${id}-${name}`,
        name,
        description: `${name} on ${id}`,
        version: "0.0.1",
        props: {},
        async run() {
          return {};
        },
      })) as never,
      authAliases: {},
    },
  });
}

describe("computeContractHash", () => {
  it("is stable for the same registry shape", () => {
    const s1 = pipedreamService("alpha", ["one", "two"]);
    const s2 = pipedreamService("alpha", ["one", "two"]);
    expect(computeContractHash([s1])).toBe(computeContractHash([s2]));
  });

  it("changes when a service id is renamed", () => {
    const before = pipedreamService("alpha", ["one"]);
    const after = pipedreamService("alpha_v2", ["one"]);
    expect(computeContractHash([before])).not.toBe(computeContractHash([after]));
  });

  it("changes when a tool name is renamed", () => {
    const before = pipedreamService("alpha", ["send-message"]);
    const after = pipedreamService("alpha", ["send-channel-message"]);
    expect(computeContractHash([before])).not.toBe(computeContractHash([after]));
  });

  it("changes when a tool is added", () => {
    const before = pipedreamService("alpha", ["one"]);
    const after = pipedreamService("alpha", ["one", "two"]);
    expect(computeContractHash([before])).not.toBe(computeContractHash([after]));
  });

  it("changes when a tool is removed", () => {
    const before = pipedreamService("alpha", ["one", "two"]);
    const after = pipedreamService("alpha", ["one"]);
    expect(computeContractHash([before])).not.toBe(computeContractHash([after]));
  });

  it("is invariant to service ordering", () => {
    const a = pipedreamService("alpha", ["x"]);
    const b = pipedreamService("beta", ["y"]);
    expect(computeContractHash([a, b])).toBe(computeContractHash([b, a]));
  });
});

describe("Catalog.dropOrphans", () => {
  let tempDir: string;
  let catalog: Catalog;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-orphans-"));
    catalog = new Catalog({ path: join(tempDir, "catalog.sqlite") });
    await catalog.open();
    await catalog.upsertService("alpha", [
      {
        service: "alpha",
        toolName: "one",
        description: "",
        inputSchema: {},
        versionHash: "v",
        indexedAt: 0,
      },
    ]);
    await catalog.upsertService("zombie", [
      {
        service: "zombie",
        toolName: "ghost",
        description: "",
        inputSchema: {},
        versionHash: "v",
        indexedAt: 0,
      },
    ]);
  });

  afterEach(() => {
    catalog.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("drops rows for ids not in the allow-list", async () => {
    const removed = await catalog.dropOrphans(["alpha"]);
    expect(removed).toBe(1);
    expect((await catalog.listByService("zombie")).length).toBe(0);
    expect((await catalog.listByService("alpha")).length).toBe(1);
  });

  it("removes all rows when allow-list is empty", async () => {
    const removed = await catalog.dropOrphans([]);
    expect(removed).toBe(2);
    expect((await catalog.listAll()).length).toBe(0);
  });

  it("is a no-op when nothing is orphaned", async () => {
    expect(await catalog.dropOrphans(["alpha", "zombie"])).toBe(0);
  });
});

describe("bootstrap", () => {
  let tempDir: string;
  let catalogPath: string;
  let connectionsPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-bootstrap-"));
    catalogPath = join(tempDir, "catalog.sqlite");
    connectionsPath = join(tempDir, "connections.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes contract version on first open and skips work on second", async () => {
    const services = [pipedreamService("alpha", ["one"])];
    const c1 = await bootstrap({ catalogPath, connectionsPath, services });
    const v1 = await c1.getMeta("cache_contract_version");
    expect(v1).not.toBeNull();
    c1.close();

    // Second open with same registry must observe the same stamp.
    const c2 = await bootstrap({ catalogPath, connectionsPath, services });
    expect(await c2.getMeta("cache_contract_version")).toBe(v1);
    c2.close();
  });

  it("drops zombie rows when a service id disappears", async () => {
    const c1 = await bootstrap({
      catalogPath,
      connectionsPath,
      services: [pipedreamService("zombie", ["x"])],
    });
    // Manually seed a row under the soon-to-be-zombie id.
    await c1.upsertService("zombie", [
      {
        service: "zombie",
        toolName: "x",
        description: "",
        inputSchema: {},
        versionHash: "v",
        indexedAt: 0,
      },
    ]);
    c1.close();

    // Registry no longer includes 'zombie'.
    const c2 = await bootstrap({
      catalogPath,
      connectionsPath,
      services: [pipedreamService("alpha", ["one"])],
    });
    expect((await c2.listByService("zombie")).length).toBe(0);
    c2.close();
  });

  it("re-ingests a connected Pipedream service when its tool set changes", async () => {
    const before = pipedreamService("alpha", ["one"]);
    const after = pipedreamService("alpha", ["one", "two"]);

    // Mark 'alpha' as connected so bootstrap will re-ingest it.
    const connections = new ConnectionsStore({ path: connectionsPath });
    await connections.set("alpha:default", {
      service: "alpha",
      connectionId: "alpha:default",
      connectedAt: Date.now(),
    });

    const c1 = await bootstrap({
      catalogPath,
      connectionsPath,
      services: [before],
    });
    expect((await c1.listByService("alpha")).map((t) => t.toolName)).toEqual([
      "one",
    ]);
    c1.close();

    const c2 = await bootstrap({
      catalogPath,
      connectionsPath,
      services: [after],
    });
    expect(
      (await c2.listByService("alpha")).map((t) => t.toolName).sort(),
    ).toEqual(["one", "two"]);
    c2.close();
  });
});
