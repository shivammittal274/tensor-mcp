import type { SpawnPoolEntry } from "./subprocess/spawn-pool";

export const DEFAULT_SERVICE_REGISTRY: Record<string, SpawnPoolEntry> = {
  linear: {
    vendorDir: "vendored/linear",
    commandTemplate: [
      "uv",
      "run",
      "--with-requirements",
      "requirements.txt",
      "python",
      "server.py",
      "--port",
      "{{PORT}}",
    ],
  },
  slack: {
    vendorDir: "vendored/slack",
    commandTemplate: [
      "uv",
      "run",
      "--with-requirements",
      "requirements.txt",
      "python",
      "server.py",
      "--port",
      "{{PORT}}",
    ],
  },
  gmail: {
    vendorDir: "vendored/gmail",
    commandTemplate: ["bun", "run", "src/index.ts"],
    envInject: { PORT: "{{PORT}}" },
  },
};
