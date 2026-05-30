import type { ServiceDefinition } from "./types";

const gmail: ServiceDefinition = {
  service: "gmail",
  displayName: "Gmail",
  vendor: {
    dir: "vendored/gmail",
    command: ["bun", "run", "src/index.ts"],
    envInject: { PORT: "{{PORT}}" },
  },
  oauth: { type: "none" },
  authShape: (blob) => ({ access_token: blob.access_token }),
};

export default gmail;
