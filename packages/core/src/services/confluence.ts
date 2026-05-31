import { dcrAuth } from "../auth";
import { defineService } from "../defineService";
import { remoteMcp } from "../transports/remote";

export default defineService({
  id: "confluence",
  displayName: "Confluence (Atlassian)",
  auth: dcrAuth({
    mcpServerUrl: "https://mcp.atlassian.com",
    scope:
      "read:confluence-content.all write:confluence-content read:confluence-user",
  }),
  remote: remoteMcp("https://mcp.atlassian.com/v1/sse"),
});
