import { apiKeyAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as supabaseActions,
  app as supabaseApp,
} from "./index.mjs";

/**
 * Supabase via Pipedream-as-code. Two-field paste credential: a
 * service-role key (master key with RLS bypass — keep it secret) plus
 * the project subdomain. Supabase URLs are `https://<subdomain>.supabase.co`
 * — `subdomain` is unique per project, no default makes sense.
 *
 * For multi-project setups, reconnect with a different subdomain to swap.
 * A future multi-account patch (see `connectionIdFor`) will let several
 * Supabase projects coexist under different account slots.
 */
export default defineService({
  id: "supabase",
  displayName: "Supabase",
  auth: apiKeyAuth({
    signupUrl: "https://supabase.com/dashboard/project/_/settings/api",
    description:
      "Open your project → Settings → API → 'Service role secret'. This key " +
      "bypasses Row Level Security — keep it server-side only. Anon keys " +
      "won't work because the actions assume admin scope. Paste the key — it " +
      "starts with `eyJ…` (it's a long JWT).",
    extraFields: [
      {
        key: "subdomain",
        label: "Project subdomain",
        description:
          "The unique part of your project URL — e.g. `abcdef` if your project lives at `https://abcdef.supabase.co`.",
      },
    ],
  }),
  pipedream: {
    app: supabaseApp,
    actions: supabaseActions,
    authAliases: {
      service_key: (b) => b.access_token,
      subdomain: (b) => b.metadata?.subdomain ?? "",
    },
  },
});
