import { defineService, klavisExecutor } from "@tensor-mcp/core";
import type { AuthStrategy } from "@tensor-mcp/core";

const pendingOAuth: AuthStrategy = {
  method: "oauth-dcr",
  describe() {
    return {
      instructions:
        "Gmail OAuth not yet wired — pending GCP project + verification.",
    };
  },
  async connect() {
    throw new Error(
      "Gmail OAuth not yet wired. Pending Google Cloud project setup.",
    );
  },
};

export default defineService({
  id: "gmail",
  displayName: "Gmail",
  auth: pendingOAuth,
  executor: klavisExecutor({ vendorDir: "vendored/gmail", lang: "typescript" }),
});
