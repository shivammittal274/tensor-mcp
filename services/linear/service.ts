import { defineService, mcpDcrAuth, klavisExecutor } from "@tensor-mcp/core";

export default defineService({
  id: "linear",
  displayName: "Linear",
  auth: mcpDcrAuth({
    mcpServerUrl: "https://mcp.linear.app",
    scope: "read write",
  }),
  executor: klavisExecutor({ vendorDir: "vendored/linear", lang: "python" }),
});
