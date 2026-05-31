import { describe, expect, it } from "bun:test";
import type { TokenBundle } from "../src/stores/types";
import {
  listPipedreamTools,
  makeAuthReader,
  runPipedreamAction,
  type PipedreamActionModule,
  type PipedreamAppModule,
} from "../src/transports/pipedream";

// Minimal Pipedream-shaped fixtures. The shim is the production code; these
// tests assert the round-trip: action/app definitions → JSON schema +
// runnable invocation that picks up `$auth.<key>` proxied through our
// TokenBundle.

function makeApp(overrides: Partial<PipedreamAppModule> = {}): PipedreamAppModule {
  return {
    type: "app",
    app: "fake",
    propDefinitions: {
      channel: {
        type: "string",
        label: "Channel",
        description: "Channel slug",
      },
    },
    methods: {
      async post(this: { $auth: { token: unknown } }, payload: unknown) {
        return { ok: true, sentBy: this.$auth.token, payload };
      },
    },
    ...overrides,
  };
}

function makeAction(
  app: PipedreamAppModule,
  overrides: Partial<PipedreamActionModule> = {},
): PipedreamActionModule {
  return {
    key: "fake-post-message",
    name: "Post message",
    description: "Send a message",
    type: "action",
    props: {
      fake: app,
      channel: { propDefinition: [app, "channel"] },
      text: { type: "string", label: "Text", description: "Body" },
    },
    async run(this: any) {
      const sent = await (this.fake as any).post.call(this.fake, {
        channel: this.channel,
        text: this.text,
      });
      return { ok: true, sent };
    },
    ...overrides,
  };
}

describe("listPipedreamTools", () => {
  it("converts an action to a tool descriptor with derived JSON schema", () => {
    const app = makeApp();
    const action = makeAction(app);

    const tools = listPipedreamTools([action]);
    expect(tools).toHaveLength(1);
    const t = tools[0];
    // toolNameForAction strips the leading `<app>-` segment and kebab→snake.
    expect(t.name).toBe("post_message");
    expect(t.description).toBe("Send a message");

    const schema = t.inputSchema as {
      type: string;
      properties: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    // The `fake` prop is the app dependency — never user-visible.
    expect(schema.properties.fake).toBeUndefined();
    // `channel` comes from the propDefinition lookup; `text` is inline.
    expect(schema.properties.channel.type).toBe("string");
    expect(schema.properties.channel.description).toBe("Channel slug");
    expect(schema.properties.text.type).toBe("string");
    // Both are required (no `default`, no `optional: true`).
    expect(schema.required).toEqual(
      expect.arrayContaining(["channel", "text"]),
    );
  });
});

describe("makeAuthReader", () => {
  const bundle: TokenBundle = {
    access_token: "tok-abc",
    metadata: { bot_token: "xoxb-bot", room: "r1" },
  };

  it("resolves aliased keys against TokenBundle", () => {
    const reader = makeAuthReader(bundle, {
      access: (b) => b.access_token,
      bot: (b) => b.metadata?.bot_token,
    });
    expect(reader("access")).toBe("tok-abc");
    expect(reader("bot")).toBe("xoxb-bot");
  });

  it("falls through to metadata for unknown keys", () => {
    const reader = makeAuthReader(bundle, {});
    expect(reader("room")).toBe("r1");
    expect(reader("nope")).toBeUndefined();
  });
});

describe("runPipedreamAction", () => {
  it("binds the app instance, exposes $auth, and runs the action", async () => {
    const app = makeApp();
    const action = makeAction(app);
    const reader = makeAuthReader({ access_token: "tok-xyz" } as TokenBundle, {
      token: (b) => b.access_token,
    });

    const result = await runPipedreamAction({
      app,
      action,
      input: { channel: "general", text: "hello" },
      readAuth: reader,
    });

    expect(result.return).toMatchObject({
      ok: true,
      sent: { ok: true, sentBy: "tok-xyz", payload: { channel: "general", text: "hello" } },
    });
  });

  it("uses default values for omitted props", async () => {
    const app = makeApp();
    const action = makeAction(app, {
      props: {
        fake: app,
        channel: { propDefinition: [app, "channel"] },
        text: { type: "string", label: "Text", default: "fallback" },
      },
    });

    const result = await runPipedreamAction({
      app,
      action,
      input: { channel: "general" },
      readAuth: () => null,
    });
    expect((result.return as { sent: { payload: { text: string } } }).sent.payload.text).toBe(
      "fallback",
    );
  });

  it("captures $.export('$summary', ...)", async () => {
    const app = makeApp();
    const action: PipedreamActionModule = {
      key: "fake-summary",
      props: {},
      async run({ $ }) {
        $.export("$summary", "did the thing");
        return { ok: true };
      },
    };
    const result = await runPipedreamAction({
      app,
      action,
      input: {},
      readAuth: () => null,
    });
    expect(result.summary).toBe("did the thing");
  });
});
