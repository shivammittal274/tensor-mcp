import { patAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as discordActions,
  app as discordApp,
} from "./index.mjs";

/**
 * Discord via Pipedream-as-code, authenticated with a **Bot Token**
 * (not an OAuth user token). Lifted from Pipedream's `discord_bot`
 * component — covers messaging, channel/guild management, role + member
 * admin, reactions, etc.
 *
 * Setup: create a Discord application + bot at
 *
 *   https://discord.com/developers/applications
 *
 * Under the "Bot" tab, copy the token. Then **add the bot to a guild**
 * (Discord's `OAuth2 → URL Generator` with the `bot` scope creates an
 * invite URL) — actions silently no-op if the bot isn't a member of the
 * target guild.
 */
export default defineService({
  id: "discord_bot",
  displayName: "Discord",
  auth: patAuth({
    tokenUrl: "https://discord.com/developers/applications",
    description:
      "Create a Discord application, enable a Bot under the 'Bot' tab, " +
      "copy the Token, then invite the bot to your guild before pasting.",
  }),
  pipedream: {
    app: discordApp,
    actions: discordActions,
    // discord_bot component reads `$auth.bot_token`. Our paste-style
    // storage puts the pasted string at `bundle.access_token`.
    authAliases: {
      bot_token: (b) => b.access_token,
    },
  },
});
