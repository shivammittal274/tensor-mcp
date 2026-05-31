import { mcpDcrAuth } from "../auth";
import { defineService } from "../defineService";
import { remoteMcp } from "../transports/remote";

export default defineService({
  id: "asana",
  displayName: "Asana",
  auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.asana.com" }),
  remote: remoteMcp("https://mcp.asana.com/sse"),
});
