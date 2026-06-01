import { patAuth } from "../../auth";
import { defineService } from "../../defineService";
import {
  actions as telegramActions,
  app as telegramApp,
} from "./index.mjs";

/**
 * Telegram via Pipedream-as-code, authenticated with a **Bot Token**
 * issued by @BotFather. Lifted from Pipedream's `telegram_bot_api`
 * component — covers send/edit/delete messages, media uploads, chat +
 * member admin.
 *
 * Setup:
 *   1. Open @BotFather in Telegram, run `/newbot`, pick a name +
 *      username (must end in `bot`).
 *   2. BotFather returns a token of the form
 *      `123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`. Paste it.
 *   3. Add the bot to a chat / channel for sending — Telegram bots
 *      can't message users who haven't started a conversation with
 *      them first.
 */
export default defineService({
  id: "telegram_bot_api",
  displayName: "Telegram",
  auth: patAuth({
    tokenUrl: "https://t.me/BotFather",
    description:
      "Open @BotFather on Telegram → /newbot → paste the token it returns " +
      "(format: 123456789:ABC...).",
  }),
  pipedream: {
    app: telegramApp,
    actions: telegramActions,
    // telegram_bot_api reads `$auth.token`. Our paste-style storage puts
    // the pasted string at `bundle.access_token`.
    authAliases: {
      token: (b) => b.access_token,
    },
  },
});
