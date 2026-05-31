import type {
  PipedreamActionModule,
  PipedreamAppModule,
  PipedreamAuthReader,
  PipedreamDollar,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RunResult {
  return: unknown;
  summary: string | null;
  exports: Record<string, unknown>;
}

/**
 * Build the `this` value Pipedream's `run()` expects, then invoke it.
 *
 * The action's `props` declares dependencies. Static props become
 * `this.<name> = input[name] ?? default`. App-typed props become
 * `this.<name> = <bound app instance>`. App methods on that instance close
 * over a `$auth` proxy backed by the caller's `PipedreamAuthReader`.
 *
 * The action's own `methods` are bound onto the same `this`, so calls like
 * `this.searchWithAssistant(...)` inside `run()` route correctly.
 */
export async function runPipedreamAction(opts: {
  app: PipedreamAppModule;
  action: PipedreamActionModule;
  input: Record<string, unknown>;
  readAuth: PipedreamAuthReader;
}): Promise<RunResult> {
  const { app, action, input, readAuth } = opts;

  const appInstance = buildAppInstance(app, readAuth);

  const ctx: Record<string, any> = Object.create(null);

  for (const [name, rawProp] of Object.entries(action.props ?? {})) {
    if (isAppLike(rawProp)) {
      // The action's app dependency — bind the live instance.
      ctx[name] = appInstance;
      continue;
    }
    const provided = input[name];
    if (provided !== undefined) {
      ctx[name] = provided;
      continue;
    }
    // Pipedream uses `default` for both required (with sane default) and
    // optional fields. We mirror that — the JSON Schema marks `default`-
    // bearing props as not required.
    const def = (rawProp as { default?: unknown }).default;
    if (def !== undefined) ctx[name] = def;
  }

  for (const [name, fn] of Object.entries(action.methods ?? {})) {
    ctx[name] = fn.bind(ctx);
  }

  const exportsBag: Record<string, unknown> = {};
  let summary: string | null = null;
  const $: PipedreamDollar = {
    export(key, value) {
      if (key === "$summary" && typeof value === "string") summary = value;
      exportsBag[key] = value;
    },
    flow: {
      exit(reason: string) {
        // Pipedream stops the workflow on `$.flow.exit`. We surface the
        // reason as the summary so the CLI prints something useful.
        if (summary == null) summary = reason;
      },
    },
  };

  const ret = await action.run.call(ctx, { $ });
  return { return: ret, summary, exports: exportsBag };
}

function buildAppInstance(
  app: PipedreamAppModule,
  readAuth: PipedreamAuthReader,
): Record<string, any> {
  const instance: Record<string, any> = Object.create(null);

  // `this.$auth.<key>` — proxy so we don't materialize unused keys, and so
  // service-specific aliases (oauth_access_token, bot_token, base_url) can
  // compute on demand.
  instance.$auth = new Proxy(
    {},
    {
      get: (_t, prop) => (typeof prop === "string" ? readAuth(prop) : undefined),
    },
  );

  // PropDefinitions on the app are not exposed at runtime — the action
  // already received concrete values via `props`.
  for (const [name, fn] of Object.entries(app.methods ?? {})) {
    instance[name] = (fn as (...a: any[]) => any).bind(instance);
  }

  return instance;
}

function isAppLike(p: unknown): p is PipedreamAppModule {
  return (
    typeof p === "object" &&
    p != null &&
    (p as PipedreamAppModule).type === "app" &&
    typeof (p as PipedreamAppModule).propDefinitions === "object"
  );
}
