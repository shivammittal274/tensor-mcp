import { apiKeyAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as stripeActions,
  app as stripeApp,
} from "./index.mjs";

/**
 * Stripe via Pipedream-as-code. Auth is a single restricted API key —
 * either a secret key (`sk_test_…` / `sk_live_…`) or a Restricted Key
 * scoped to specific resources. The lifted component reads
 * `$auth.api_key`; the official `stripe` SDK builds Bearer headers itself.
 *
 * Recommend a restricted key in the description — full secret keys grant
 * the full account, restricted keys can be scoped to e.g. `Customers RW`
 * + `Charges R` for read-only sales views.
 */
export default defineService({
  id: "stripe",
  displayName: "Stripe",
  auth: apiKeyAuth({
    signupUrl: "https://dashboard.stripe.com/apikeys",
    description:
      "Open Stripe dashboard → Developers → API keys → 'Restricted keys' " +
      "(safer than the full secret key). Grant only the resources you want " +
      "tensor-mcp to touch. Paste the key — it starts with `rk_…` (restricted) " +
      "or `sk_…` (full secret). Both work.",
  }),
  pipedream: {
    app: stripeApp,
    actions: stripeActions,
    authAliases: {
      api_key: (b) => b.access_token,
    },
  },
});
