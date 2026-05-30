import type { ServiceDefinition } from "./types";

const slack: ServiceDefinition = {
  service: "slack",
  displayName: "Slack",
  vendor: {
    dir: "vendored/slack",
    command: [
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
  oauth: { type: "none" },
  authShape: (blob) => ({ access_token: blob.access_token }),
};

export default slack;
