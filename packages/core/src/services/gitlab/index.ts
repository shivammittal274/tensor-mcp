import { patAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as gitlabActions,
  app as gitlabApp,
} from "./index.mjs";

/**
 * GitLab via Pipedream-as-code. Auth is a Personal Access Token — GitLab's
 * REST API accepts a PAT in the same `Authorization: Bearer …` header
 * shape as an OAuth token, so we can drive the Pipedream component (which
 * expects `$auth.oauth_access_token`) with a pasted PAT via authAliases.
 *
 * Defaults to gitlab.com. Self-hosted instances aren't wired through the
 * paste flow yet — the lifted code already falls back to gitlab.com when
 * `$auth.base_api_url` is undefined, so we leave that alias unset.
 */
export default defineService({
  id: "gitlab",
  displayName: "GitLab",
  auth: patAuth({
    tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
    description:
      "Open GitLab → User Settings → Access Tokens. Recommended scopes: " +
      "`api` (full read+write) or `read_api` for read-only. Paste the " +
      "token — it starts with `glpat-…`.",
  }),
  pipedream: {
    app: gitlabApp,
    actions: gitlabActions,
    authAliases: {
      oauth_access_token: (b) => b.access_token,
    },
  },
});
