import { describe, expect, it } from "bun:test";
import type { CatalogTool } from "../src/catalog/catalog";
import type { SearchHit, ToolIndexable } from "../src/search/bm25";
import { searchTools, type SearchToolsDeps } from "../src/mcp/search-tools";

interface FakeTool {
  service: string;
  toolName: string;
  description: string;
  inputSchema: unknown;
}

function makeDeps(opts: {
  tools: FakeTool[];
  connected?: Set<string>;
  scoreFor?: (query: string, tool: FakeTool) => number;
}): SearchToolsDeps {
  const connected = opts.connected ?? new Set<string>();
  const scoreFor =
    opts.scoreFor ??
    ((query, tool) => {
      const hay = `${tool.service} ${tool.toolName} ${tool.description}`.toLowerCase();
      const needle = query.toLowerCase().trim();
      if (!needle) return 0;
      return hay.includes(needle) ? 1 : 0;
    });

  const searchIndex: SearchToolsDeps["searchIndex"] = {
    search(query: string, limit: number): SearchHit<ToolIndexable>[] {
      const ranked = opts.tools
        .map((t) => ({
          tool: { service: t.service, toolName: t.toolName, description: t.description },
          score: scoreFor(query, t),
        }))
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return ranked;
    },
  };

  const catalog: SearchToolsDeps["catalog"] = {
    async get(service: string, toolName: string): Promise<CatalogTool | null> {
      const found = opts.tools.find(
        (t) => t.service === service && t.toolName === toolName,
      );
      if (!found) return null;
      return {
        service: found.service,
        toolName: found.toolName,
        description: found.description,
        inputSchema: found.inputSchema,
        versionHash: "v1",
        indexedAt: 0,
      };
    },
  };

  return {
    searchIndex,
    catalog,
    isConnected: async (service) => connected.has(service),
  };
}

describe("searchTools", () => {
  const TOOLS: FakeTool[] = [
    {
      service: "linear",
      toolName: "linear_create_issue",
      description: "Create a Linear issue",
      inputSchema: { type: "object", properties: { title: { type: "string" } } },
    },
    {
      service: "linear",
      toolName: "linear_list_issues",
      description: "List Linear issues",
      inputSchema: { type: "object" },
    },
    {
      service: "slack",
      toolName: "slack_send_message",
      description: "Send a Slack message",
      inputSchema: { type: "object", properties: { text: { type: "string" } } },
    },
    {
      service: "slack",
      toolName: "slack_list_channels",
      description: "List Slack channels",
      inputSchema: { type: "object" },
    },
    {
      service: "jira",
      toolName: "jira_create_ticket",
      description: "Create a Jira ticket",
      inputSchema: { type: "object" },
    },
  ];

  it("returns top-K ranked tools with hydrated schemas", async () => {
    const deps = makeDeps({
      tools: TOOLS,
      connected: new Set(["linear", "slack", "jira"]),
    });
    const result = await searchTools({ query: "linear", topK: 2 }, deps);

    expect(result.primary_tools.length).toBeGreaterThan(0);
    expect(result.primary_tools.length).toBeLessThanOrEqual(2);
    for (const hit of result.primary_tools) {
      expect(hit.service).toBe("linear");
      expect(hit.connection_status).toBe("active");
      expect(hit.input_schema).toBeDefined();
      expect(typeof hit.description).toBe("string");
      expect(hit.description.length).toBeGreaterThan(0);
    }
    expect(result.missing_connections).toEqual([]);
  });

  it("marks unconnected services as missing and aggregates missing_connections", async () => {
    const deps = makeDeps({
      tools: TOOLS,
      connected: new Set(["linear"]),
    });
    const result = await searchTools(
      { query: "slack", topK: 5 },
      deps,
    );

    const slackHits = result.primary_tools.filter((t) => t.service === "slack");
    expect(slackHits.length).toBeGreaterThan(0);
    for (const hit of slackHits) {
      expect(hit.connection_status).toBe("missing");
    }
    expect(result.missing_connections).toHaveLength(1);
    expect(result.missing_connections[0]?.service).toBe("slack");
    expect(result.missing_connections[0]?.reason).toContain("tensor-mcp connect slack");
  });

  it("respects the services filter", async () => {
    const deps = makeDeps({
      tools: TOOLS,
      connected: new Set(["linear", "slack", "jira"]),
      scoreFor: () => 1,
    });
    const result = await searchTools(
      { query: "anything", topK: 10, services: ["slack"] },
      deps,
    );
    expect(result.primary_tools.length).toBeGreaterThan(0);
    for (const hit of result.primary_tools) {
      expect(hit.service).toBe("slack");
    }
  });

  it("clamps topK and limits the returned list", async () => {
    const deps = makeDeps({
      tools: TOOLS,
      connected: new Set(["linear", "slack", "jira"]),
      scoreFor: () => 1,
    });
    const tiny = await searchTools({ query: "x", topK: 1 }, deps);
    expect(tiny.primary_tools).toHaveLength(1);

    const zero = await searchTools({ query: "x", topK: 0 }, deps);
    expect(zero.primary_tools).toHaveLength(1);
  });

  it("returns empty results when nothing matches", async () => {
    const deps = makeDeps({
      tools: TOOLS,
      connected: new Set(["linear"]),
    });
    const result = await searchTools(
      { query: "nonexistent-zzz-query" },
      deps,
    );
    expect(result.primary_tools).toEqual([]);
    expect(result.missing_connections).toEqual([]);
  });
});
