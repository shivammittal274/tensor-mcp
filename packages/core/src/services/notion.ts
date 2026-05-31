import { mcpDcrAuth } from "../auth";
import { defineService } from "../defineService";
import { remoteMcp } from "../transports/remote";

export default defineService({
  id: "notion",
  displayName: "Notion",
  auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.notion.com" }),
  remote: remoteMcp("https://mcp.notion.com/mcp"),
});
