import { Context, Deferred, Effect, Fiber, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  type AnyWebMcpTool,
  EmptyWebMcpInput,
  WebMcp,
  WebMcpRegistrationError,
  WebMcpTool,
  WebMcpToolExecutionError,
} from "../src/index.js";

const GreetingInput = Schema.Struct({
  name: Schema.NonEmptyString,
});
const GreetingOutput = Schema.Struct({
  greeting: Schema.String,
});

const greetingTool = WebMcpTool.make({
  name: "greet-person",
  title: "Greet person",
  description: "Returns a greeting for one person.",
  input: GreetingInput,
  output: GreetingOutput,
  annotations: { readOnlyHint: true },
  execute: ({ name }) => Effect.succeed({ greeting: `Hello, ${name}!` }),
});
const greetingTools: ReadonlyArray<AnyWebMcpTool> = [greetingTool];

class GreetingPrefix extends Context.Service<
  GreetingPrefix,
  { readonly value: string }
>()("effect-webmcp/test/GreetingPrefix") {}

function runInMemory<A, E>(
  effect: Effect.Effect<A, E, WebMcp | import("effect").Scope.Scope>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(WebMcp.layerInMemory()), Effect.scoped),
  );
}

describe("WebMcp.layerInMemory", () => {
  it("registers, discovers, validates, executes, and encodes a tool", async () => {
    const result = await runInMemory(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        yield* webMcp.register(greetingTool);
        const tools = yield* webMcp.getTools();
        const tool = tools[0];
        if (tool === undefined) return yield* Effect.die("missing tool");
        const output = yield* webMcp.execute(tool, { name: "Ada" });
        return { tool, output };
      }),
    );

    expect(result.tool).toMatchObject({
      name: "greet-person",
      title: "Greet person",
      description: "Returns a greeting for one person.",
      annotations: { readOnlyHint: true },
      origin: "https://effect-webmcp.test",
    });
    expect(result.tool.inputSchema).toMatchObject({
      type: "object",
      required: ["name"],
      additionalProperties: false,
    });
    expect(result.output).toEqual({ greeting: "Hello, Ada!" });
  });

  it("rejects unknown and excess input before the handler runs", async () => {
    let calls = 0;
    const tool = WebMcpTool.make({
      name: "validated-input",
      description: "Accepts only a name.",
      input: GreetingInput,
      execute: ({ name }) =>
        Effect.sync(() => {
          calls += 1;
          return name;
        }),
    });

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        yield* webMcp.register(tool);
        const [registered] = yield* webMcp.getTools();
        if (registered === undefined) return yield* Effect.die("missing tool");
        return yield* webMcp.execute(registered, {
          name: "Ada",
          unexpected: true,
        });
      }).pipe(
        Effect.provide(WebMcp.layerInMemory()),
        Effect.scoped,
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(WebMcpToolExecutionError);
    expect(calls).toBe(0);
  });

  it("rejects duplicate names with a registration error", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        yield* webMcp.register(greetingTool);
        yield* webMcp.register(greetingTool);
      }).pipe(
        Effect.provide(WebMcp.layerInMemory()),
        Effect.scoped,
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(WebMcpRegistrationError);
  });

  it("applies the WebMCP tool-name rules before registration", async () => {
    const tool = WebMcpTool.make({
      name: "invalid tool name",
      description: "Cannot be registered because its name contains spaces.",
      input: EmptyWebMcpInput,
      execute: () => Effect.succeed(null),
    });

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        yield* webMcp.register(tool);
      }).pipe(
        Effect.provide(WebMcp.layerInMemory()),
        Effect.scoped,
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(WebMcpRegistrationError);
  });

  it("rejects results that the browser cannot JSON serialize", async () => {
    const tool = WebMcpTool.make({
      name: "undefined-result",
      description: "Returns an unsupported value.",
      input: EmptyWebMcpInput,
      execute: () => Effect.succeed(undefined),
    });

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        yield* webMcp.register(tool);
        const [registered] = yield* webMcp.getTools();
        if (registered === undefined) return yield* Effect.die("missing tool");
        return yield* webMcp.execute(registered);
      }).pipe(
        Effect.provide(WebMcp.layerInMemory()),
        Effect.scoped,
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(WebMcpToolExecutionError);
  });

  it("removes tools when their registration scope closes", async () => {
    const count = await runInMemory(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        yield* Effect.scoped(webMcp.register(greetingTool));
        return (yield* webMcp.getTools()).length;
      }),
    );

    expect(count).toBe(0);
  });

  it("serves tools until the serving fiber is interrupted", async () => {
    const result = await runInMemory(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        const servingFiber = yield* webMcp
          .serve(greetingTools)
          .pipe(Effect.forkScoped);
        yield* Effect.yieldNow;
        const whileServing = yield* webMcp.getTools();
        yield* Fiber.interrupt(servingFiber);
        const afterInterruption = yield* webMcp.getTools();
        return { whileServing, afterInterruption };
      }),
    );

    expect(result.whileServing.map((tool) => tool.name)).toEqual([
      "greet-person",
    ]);
    expect(result.afterInterruption).toEqual([]);
  });

  it("captures every served tool's Effect service requirements", async () => {
    const contextualGreetingTool = WebMcpTool.make({
      name: "contextual-greeting",
      description: "Returns a greeting from an Effect service.",
      input: GreetingInput,
      execute: ({ name }) =>
        Effect.gen(function* () {
          const prefix = yield* GreetingPrefix;
          return `${prefix.value}, ${name}!`;
        }),
    });
    const output = await runInMemory(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        const servingFiber = yield* webMcp
          .serve([greetingTool, contextualGreetingTool])
          .pipe(Effect.forkScoped);
        yield* Effect.yieldNow;
        const tools = yield* webMcp.getTools();
        const registered = tools.find(
          (tool) => tool.name === contextualGreetingTool.name,
        );
        if (registered === undefined) {
          return yield* Effect.die("missing contextual greeting tool");
        }
        const result = yield* webMcp.execute(registered, { name: "Ada" });
        yield* Fiber.interrupt(servingFiber);
        return result;
      }).pipe(Effect.provideService(GreetingPrefix, { value: "Welcome" })),
    );

    expect(output).toBe("Welcome, Ada!");
  });

  it("interrupts the handler when a tool execution is cancelled", async () => {
    let cleanedUp = false;

    await runInMemory(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const tool = WebMcpTool.make({
          name: "cancellable-tool",
          description: "Waits until its WebMCP execution is cancelled.",
          input: EmptyWebMcpInput,
          execute: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Effect.sync(() => {
                  cleanedUp = true;
                }),
              ),
            ),
        });
        const webMcp = yield* WebMcp;
        yield* webMcp.register(tool);
        const [registered] = yield* webMcp.getTools();
        if (registered === undefined) return yield* Effect.die("missing tool");

        const execution = yield* Effect.forkChild(webMcp.execute(registered));
        yield* Deferred.await(started);
        yield* Fiber.interrupt(execution);
      }),
    );

    expect(cleanedUp).toBe(true);
  });
});
