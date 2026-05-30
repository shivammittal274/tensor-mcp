import { defineService, mcpDcrAuth, klavisExecutor } from "@tensor-mcp/core";

export default defineService({
  id: "jira",
  displayName: "Jira (Atlassian)",
  auth: mcpDcrAuth({
    mcpServerUrl: "https://mcp.atlassian.com",
    scope: "read:jira-work write:jira-work read:jira-user",
  }),
  executor: klavisExecutor({ vendorDir: "vendored/jira", lang: "typescript" }),
});
