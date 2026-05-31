import { patAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as githubActions,
  app as githubApp,
} from "./index.mjs";

/**
 * GitHub via Pipedream-as-code, authenticated with a Personal Access Token.
 *
 * Why PAT over OAuth: GitHub uniquely requires `client_secret` on the
 * token-exchange endpoint for both OAuth Apps and GitHub Apps —
 * publishing one in an OSS binary would let anyone spoof tensor-mcp.
 * The clean public-CLI alternative would be Device Flow, but PAT is
 * zero-infrastructure on our side and gives users full control over
 * which scopes they grant. Octokit accepts PATs and OAuth tokens
 * identically (both are sent as `Authorization: Bearer <token>`), so
 * the lifted Pipedream component code is unchanged.
 *
 * Two PAT shapes work:
 *   • Classic PAT (`ghp_…`) — pick scopes from the standard list (`repo`,
 *     `read:user`, `read:org`, `notifications`).
 *   • Fine-grained PAT (`github_pat_…`) — choose per-repo permissions.
 *     Long-term safer; recommended.
 */
export default defineService({
  id: "github",
  displayName: "GitHub",
  auth: patAuth({
    tokenUrl: "https://github.com/settings/tokens?type=beta",
    description:
      "Generate a Fine-grained Personal Access Token with Repository access " +
      "(Contents: Read, Issues: Read & Write, Pull requests: Read & Write) " +
      "and Account access (Read). For Classic PATs, the equivalent scopes " +
      "are `repo`, `read:user`, `read:org`, `notifications`.",
  }),
  pipedream: {
    app: githubApp,
    actions: githubActions,
    authAliases: {
      // The Pipedream component reads `$auth.oauth_access_token` — we map
      // it to the bundle's access_token regardless of whether the user
      // pasted a PAT or completed an OAuth flow.
      oauth_access_token: (b) => b.access_token,
    },
  },
});
