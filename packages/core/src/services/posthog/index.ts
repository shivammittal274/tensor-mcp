import { apiKeyAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as posthogActions,
  app as posthogApp,
} from "./index.mjs";

/**
 * PostHog via Pipedream-as-code. Two-field paste credential: a Personal
 * API key (Bearer token) plus the instance host the user's project lives
 * on. PostHog Cloud US is the default; EU users override to
 * `eu.i.posthog.com`, self-hosted users provide their own subdomain.
 *
 * The host is non-secret config (it's just a subdomain) so it goes in
 * `TokenBundle.metadata.instance_url` and the lifted component reads it
 * back via `$auth.instance_url`.
 */
export default defineService({
  id: "posthog",
  displayName: "PostHog",
  auth: apiKeyAuth({
    signupUrl: "https://app.posthog.com/settings/user-api-keys",
    description:
      "Open PostHog → Settings → User API keys → 'Create personal API key'. " +
      "Recommend giving it the scopes for the resources you want tensor-mcp " +
      "to touch (Events, Cohorts, Insights, etc.). Paste the key — it starts " +
      "with `phx_…`.",
    extraFields: [
      {
        key: "instance_url",
        label: "Instance URL",
        description:
          "Host where your PostHog project lives. Defaults to PostHog Cloud US.",
        default: "us.i.posthog.com",
      },
    ],
  }),
  pipedream: {
    app: posthogApp,
    actions: posthogActions,
    authAliases: {
      api_key: (b) => b.access_token,
      instance_url: (b) => b.metadata?.instance_url ?? "us.i.posthog.com",
    },
  },
});
