import { dcrAuth } from "../auth";
import { defineService } from "../defineService";
import { remoteMcp } from "../transports/remote";

export default defineService({
  id: "cal_com",
  displayName: "Cal.com",
  auth: dcrAuth({ mcpServerUrl: "https://mcp.cal.com" }),
  remote: remoteMcp("https://mcp.cal.com/mcp"),
});
