import { dcrAuth } from "../auth";
import { defineService } from "../defineService";
import { remoteMcp } from "../transports/remote";

export default defineService({
  id: "linear",
  displayName: "Linear",
  auth: dcrAuth({
    mcpServerUrl: "https://mcp.linear.app",
    scope: "read write",
  }),
  remote: remoteMcp("https://mcp.linear.app/mcp"),
});
