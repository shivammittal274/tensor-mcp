import type { SpawnConfig } from "./types";

/**
 * Klavis Python conventions: `uv run --with-requirements requirements.txt
 * python server.py --port <ephemeral>`, executed inside `vendorDir`.
 *
 * Use the second argument for service-specific overrides — Slack's nested
 * authed_user, Jira's selected_cloud_id, debug log levels, etc.
 */
export function klavisPython(
  vendorDir: string,
  opts: Pick<SpawnConfig, "forgeAuthData" | "envInject"> = {},
): SpawnConfig {
  return {
    vendorDir,
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
    forgeAuthData: opts.forgeAuthData,
    envInject: opts.envInject,
  };
}

/**
 * Klavis TypeScript conventions: `bun run index.ts` with `PORT={{PORT}}`
 * injected into the environment. Caller-provided envInject merges on top
 * (and may override PORT for unusual services).
 */
export function klavisTypescript(
  vendorDir: string,
  opts: Pick<SpawnConfig, "forgeAuthData" | "envInject"> = {},
): SpawnConfig {
  return {
    vendorDir,
    command: ["bun", "run", "index.ts"],
    envInject: { PORT: "{{PORT}}", ...opts.envInject },
    forgeAuthData: opts.forgeAuthData,
  };
}
