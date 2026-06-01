import { describe, expect, test } from "bun:test";
import { listServices } from "../src/services";
import { listPipedreamTools } from "../src/transports/pipedream";

/**
 * Regression guard for the v0.5.0 catalog-ingest bug: two distinct
 * upstream slack actions (`slack_v2-send-message` and
 * `slack_v2-send-message-to-channel`) both collapsed to the same tool
 * name `send_message_to_channel` because `toolNameForAction` carried a
 * legacy domain rename. Catalog's PRIMARY KEY is (service, tool_name) so
 * the second INSERT inside `upsertService` blew up with `UNIQUE
 * constraint failed`, killing every fresh `connect` for the service.
 *
 * This test scans every Pipedream service in the registry and asserts
 * that `listPipedreamTools` returns one row per name. Catches any future
 * sync that lifts a new action whose stripped key happens to overlap
 * with an existing one.
 */
describe("Pipedream tool names are unique within a service", () => {
  for (const s of listServices()) {
    const pd = "pipedream" in s ? s.pipedream : undefined;
    if (!pd) continue;
    test(s.id, () => {
      const tools = listPipedreamTools(pd.actions);
      const counts = new Map<string, string[]>();
      for (let i = 0; i < tools.length; i++) {
        const name = tools[i].name;
        if (!counts.has(name)) counts.set(name, []);
        counts.get(name)!.push(pd.actions[i].key);
      }
      const dupes = [...counts.entries()]
        .filter(([_, keys]) => keys.length > 1)
        .map(([name, keys]) => `${name} ← [${keys.join(", ")}]`);
      expect(dupes).toEqual([]);
    });
  }
});
