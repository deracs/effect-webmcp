# effect-webmcp

Effect-native tools and layers for the
[WebMCP](https://github.com/webmachinelearning/webmcp) browser API.

Define each browser tool once with `Effect` and `Schema`. `WebMcp.layer()`
registers it with `document.modelContext`; `WebMcp.layerInMemory()` runs the
same registration and execution lifecycle in tests.

## Install

```bash
pnpm add effect-webmcp effect@rc
```

The package targets Effect 4 because its schemas, scoped runtime bridges, and
service APIs are used directly. Its supported range starts at
`4.0.0-beta.47`, the Effect version currently used by Sevenfall.

## Examples

- [`examples/foldkit`](./examples/foldkit) contains a runnable Foldkit counter
  application.

## Define and register a tool

```ts
import { Effect, Schema } from "effect";
import { WebMcp, WebMcpTool } from "effect-webmcp";

const AddTodoInput = Schema.Struct({
  text: Schema.NonEmptyString.annotate({
    description: "Text for the new todo item",
  }),
});

const AddTodoOutput = Schema.Struct({
  status: Schema.Literal("created"),
  text: Schema.String,
});

const addTodo = WebMcpTool.make({
  name: "add-todo",
  title: "Add todo",
  description: "Adds a new item to the active todo list.",
  input: AddTodoInput,
  output: AddTodoOutput,
  annotations: {
    consequentialHint: false,
  },
  execute: ({ text }) =>
    Effect.succeed({
      status: "created" as const,
      text,
    }),
});

const application = Effect.gen(function* () {
  const webMcp = yield* WebMcp;
  yield* webMcp.serve([addTodo]);
});

application.pipe(
  Effect.provide(WebMcp.layer()),
  Effect.scoped,
  Effect.runPromise,
);
```

`input` is required so every agent-supplied value is decoded before reaching
application code. Use `EmptyWebMcpInput` for a no-argument tool.

The optional `output` schema validates and encodes successful handler results.
Without it, the handler result is passed to the browser unchanged and must
still be JSON serializable.

## Dependencies and lifecycle

A handler has the normal `Effect.Effect<Output, Error, Requirements>` shape.
Its requirements are captured when `webMcp.register(tool)` runs:

```ts
const program = Effect.gen(function* () {
  const webMcp = yield* WebMcp;
  yield* webMcp.register(toolWithApplicationServices);
});
```

Registration requires `Scope`. Closing that scope aborts the browser
registration signal, unregistering the tool. A browser cancellation signal
interrupts the handler fiber, so `Effect.ensuring`, `Effect.onInterrupt`, and
handler-owned scopes run their cleanup normally.

`webMcp.serve(tools)` registers every tool and remains active until interrupted.
Run it inside the application's long-lived root scope. UI integrations should
fork the scoped `serve` effect when mounting and interrupt that fiber when
unmounting.

The lower-level `webMcp.register(tool)` operation completes after registering
one tool. Do not run and await a scoped effect that only calls `register`: the
scope then closes immediately and unregisters the tool.

Use `exposedTo` to share a tool with secure cross-origin frames:

```ts
yield* webMcp.register(tool, {
  exposedTo: ["https://trusted-agent.example"],
});
```

## Delayed browser injection

Browser extensions may inject `document.modelContext` after application
startup. Use the polling Layer when the context is not guaranteed to exist yet:

```ts
application.pipe(
  Effect.provide(
    WebMcp.layerWhenAvailable({
      timeout: "30 seconds",
      interval: "500 millis",
    }),
  ),
  Effect.scoped,
  Effect.runPromise,
);
```

The Layer fails with `WebMcpUnavailableError` when the timeout expires. Supplying
a known `WebMcpModelContext` directly is typed as error-free:

```ts
WebMcp.layer({ modelContext });
```

Use `AnyWebMcpTool` for a heterogeneous tool collection when preserving each
tool's individual input and output types is unnecessary:

```ts
const tools: ReadonlyArray<AnyWebMcpTool> = [addTodo, anotherTool];
```

## Test through the WebMCP interface

The in-memory layer implements registration, discovery, execution,
cancellation, duplicate-name checks, JSON serialization, and scoped
unregistration.

```ts
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { WebMcp } from "effect-webmcp";

it.effect("executes the registered tool", () =>
  Effect.gen(function* () {
    const webMcp = yield* WebMcp;
    yield* webMcp.register(addTodo);

    const tools = yield* webMcp.getTools();
    const result = yield* webMcp.execute(tools[0]!, { text: "Ship it" });

    expect(result).toEqual({ status: "created", text: "Ship it" });
  }).pipe(Effect.provide(WebMcp.layerInMemory())),
);
```

`RegisteredWebMcpTool` values are opaque capabilities. Execute the exact value
returned by `getTools()` on the same `WebMcp` service; constructing or copying
one is rejected.

## Typed failures

- `WebMcpUnavailableError`: `document.modelContext` is absent.
- `WebMcpRegistrationError`: the browser refused registration, the name is a
  duplicate, or registration was already aborted.
- `WebMcpDiscoveryError`: `getTools()` failed.
- `WebMcpToolExecutionError`: input decoding, the handler, output encoding,
  cancellation, or JSON serialization failed.

Handler failures are intentionally collapsed into
`WebMcpToolExecutionError` at the agent/browser boundary. Inside application
services, keep expected failures typed as usual.
