import { defineService, mcpDcrAuth, klavisExecutor } from "@tensor-mcp/core";

export default defineService({
  id: "notion",
  displayName: "Notion",
  auth: mcpDcrAuth({
    mcpServerUrl: "https://mcp.notion.com",
  }),
  executor: klavisExecutor({ vendorDir: "vendored/notion", lang: "python" }),
});
