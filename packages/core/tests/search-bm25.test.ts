import { describe, expect, it } from "bun:test";
import { BM25Search, type ToolIndexable } from "../src/search/bm25";

function makeTool(
  service: string,
  toolName: string,
  description: string,
  paramText = "",
): ToolIndexable {
  return { service, toolName, description, paramText };
}

const LINEAR_TOOLS: ToolIndexable[] = [
  makeTool("linear", "linear_create_issue", "Create a new issue in Linear"),
  makeTool("linear", "linear_update_issue", "Update an existing issue"),
  makeTool("linear", "linear_list_issues", "List issues with optional filters"),
  makeTool("linear", "linear_get_issue", "Get a single issue by id"),
  makeTool("linear", "linear_create_comment", "Add a comment to an issue"),
  makeTool("linear", "linear_list_teams", "List teams in the workspace"),
  makeTool("linear", "linear_get_team", "Get a single team by id"),
  makeTool("linear", "linear_list_projects", "List projects across teams"),
  makeTool("linear", "linear_list_initiatives", "List strategic initiatives"),
];

const SLACK_TOOLS: ToolIndexable[] = [
  makeTool("slack", "slack_send_message", "Send a message to a channel"),
  makeTool("slack", "slack_list_channels", "List channels"),
  makeTool("slack", "slack_search_messages", "Search messages in history"),
];

const ALL_TOOLS = [...LINEAR_TOOLS, ...SLACK_TOOLS];

describe("BM25Search", () => {
  it("returns empty for empty query", () => {
    const s = new BM25Search(ALL_TOOLS);
    expect(s.search("")).toEqual([]);
    expect(s.search("   ")).toEqual([]);
  });

  it("returns top-K results sorted by descending score", () => {
    const s = new BM25Search(ALL_TOOLS);
    const hits = s.search("create issue", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].score).toBeLessThanOrEqual(hits[i - 1].score);
    }
  });

  it("ranks linear_create_issue first for 'create issue'", () => {
    const s = new BM25Search(ALL_TOOLS);
    const hits = s.search("create issue", 5);
    expect(hits[0].tool.toolName).toBe("linear_create_issue");
  });

  it("ranks slack_send_message high for 'send message slack'", () => {
    const s = new BM25Search(ALL_TOOLS);
    const hits = s.search("send message slack", 5);
    expect(hits[0].tool.toolName).toBe("slack_send_message");
  });

  it("handles camelCase tool names by splitting", () => {
    const camel = [makeTool("test", "createNewWidget", "Creates a widget")];
    const s = new BM25Search(camel);
    expect(s.search("create widget", 1)[0].tool.toolName).toBe(
      "createNewWidget",
    );
  });

  it("filters out zero-score tools (no matching terms)", () => {
    const s = new BM25Search(ALL_TOOLS);
    const hits = s.search("xyzabcnonexistent", 10);
    expect(hits.length).toBe(0);
  });

  it("topK defaults to 5", () => {
    const s = new BM25Search(ALL_TOOLS);
    const hits = s.search("list");
    expect(hits.length).toBeLessThanOrEqual(5);
  });

  it("ranks list_teams above list_initiatives for 'list teams'", () => {
    const s = new BM25Search(ALL_TOOLS);
    const hits = s.search("list teams", 5);
    expect(hits[0].tool.toolName).toBe("linear_list_teams");
  });

  it("synonym handling — 'find issue' should still surface issue tools (BM25 doesn't do synonyms; this test documents the limitation)", () => {
    const s = new BM25Search(ALL_TOOLS);
    const hits = s.search("find issue", 5);
    expect(hits.some((h) => /issue/i.test(h.tool.toolName))).toBe(true);
  });

  it("works on the actual Linear catalog size (~28 tools)", () => {
    const linearFull: ToolIndexable[] = [];
    for (let i = 0; i < 28; i++) {
      linearFull.push(
        makeTool("linear", `linear_tool_${i}`, `Description ${i}`),
      );
    }
    linearFull[5] = makeTool(
      "linear",
      "linear_create_issue",
      "Create a new issue",
    );
    const s = new BM25Search(linearFull);
    const hits = s.search("create issue", 3);
    expect(hits[0].tool.toolName).toBe("linear_create_issue");
  });
});
