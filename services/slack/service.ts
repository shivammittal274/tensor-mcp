import { defineService, klavisExecutor } from "@tensor-mcp/core";
import type { AuthStrategy } from "@tensor-mcp/core";

const pendingOAuth: AuthStrategy = {
  method: "oauth-dcr",
  describe() {
    return {
      instructions:
        "Slack OAuth not yet wired — pending OAuth App registration.",
    };
  },
  async connect() {
    throw new Error(
      "Slack OAuth not yet wired. Pending vendor app registration.",
    );
  },
};

export default defineService({
  id: "slack",
  displayName: "Slack",
  auth: pendingOAuth,
  executor: klavisExecutor({ vendorDir: "vendored/slack", lang: "python" }),
});
