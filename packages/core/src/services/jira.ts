import { mcpDcrAuth } from "../auth";
import { defineService } from "../defineService";
import { remoteMcp } from "../transports/remote";

export default defineService({
  id: "jira",
  displayName: "Jira (Atlassian)",
  auth: mcpDcrAuth({
    mcpServerUrl: "https://mcp.atlassian.com",
    scope: "read:jira-work write:jira-work read:jira-user",
  }),
  remote: remoteMcp("https://mcp.atlassian.com/v1/sse"),
});
