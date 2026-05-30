import type { ServiceDefinition } from "./types";

const linear: ServiceDefinition = {
  service: "linear",
  displayName: "Linear",
  vendor: {
    dir: "vendored/linear",
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
  oauth: {
    type: "dcr",
    wellKnownUrl: "https://mcp.linear.app/.well-known/oauth-authorization-server",
    scope: "read write",
  },
  authShape: (blob) => ({ access_token: blob.access_token }),
};

export default linear;
