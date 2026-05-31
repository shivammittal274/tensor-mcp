// Single source of truth for the CLI + MCP server version. Bumped in lock
// step with `packages/cli/package.json` — the JSON file stays canonical for
// npm/Bun tooling; this constant is what runtime code reads.
//
// Why not `import pkg from "../package.json"`? `bun --compile` would embed
// the whole package.json contents (dev dependencies + scripts + …) into
// the binary as a JSON blob — wasteful for a single version string.
export const VERSION = "0.3.0";
