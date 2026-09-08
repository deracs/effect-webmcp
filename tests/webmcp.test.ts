import { describe, expect, it } from "@effect/vitest";
import { Context, Deferred, Effect, Fiber, Schema } from "effect";

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

const provideInMemoryWebMcp = <A, E, Requirements>(
  effect: Effect.Effect<A, E, Requirements | WebMcp>,
) => effect.pipe(Effect.provide(WebMcp.layerInMemory()));

describe("WebMcp.layerInMemory", () => {
  it.effect(
    "registers, discovers, validates, executes, and encodes a tool",
    () =>
      provideInMemoryWebMcp(
        Effect.gen(function* () {
          const webMcp = yield* WebMcp;
          yield* webMcp.register(greetingTool);
          const tools = yield* webMcp.getTools();
          const tool = tools[0];
          if (tool === undefined) return yield* Effect.die("missing tool");
          const output = yield* webMcp.execute(tool, { name: "Ada" });
          expect(tool).toMatchObject({
            name: "greet-person",
            title: "Greet person",
            description: "Returns a greeting for one person.",
            annotations: { readOnlyHint: true },
            origin: "https://effect-webmcp.test",
          });
          expect(tool.inputSchema).toMatchObject({
            type: "object",
            required: ["name"],
            additionalProperties: false,
          });
          expect(output).toEqual({ greeting: "Hello, Ada!" });
        }),
      ),
  );

  it.effect("rejects unknown and excess input before the handler runs", () => {
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

    return provideInMemoryWebMcp(
      Effect.gen(function* () {
        const error = yield* Effect.gen(function* () {
          const webMcp = yield* WebMcp;
          yield* webMcp.register(tool);
          const [registered] = yield* webMcp.getTools();
          if (registered === undefined)
            return yield* Effect.die("missing tool");
          return yield* webMcp.execute(registered, {
            name: "Ada",
            unexpected: true,
          });
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(WebMcpToolExecutionError);
        expect(calls).toBe(0);
      }),
    );
  });

  it.effect("rejects duplicate names with a registration error", () =>
    provideInMemoryWebMcp(
      Effect.gen(function* () {
        const error = yield* Effect.gen(function* () {
          const webMcp = yield* WebMcp;
          yield* webMcp.register(greetingTool);
          yield* webMcp.register(greetingTool);
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(WebMcpRegistrationError);
      }),
    ),
  );

  it.effect("applies the WebMCP tool-name rules before registration", () => {
    const tool = WebMcpTool.make({
      name: "invalid tool name",
      description: "Cannot be registered because its name contains spaces.",
      input: EmptyWebMcpInput,
      execute: () => Effect.succeed(null),
    });

    return provideInMemoryWebMcp(
      Effect.gen(function* () {
        const error = yield* Effect.gen(function* () {
          const webMcp = yield* WebMcp;
          yield* webMcp.register(tool);
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(WebMcpRegistrationError);
      }),
    );
  });

  it.effect("rejects results that the browser cannot JSON serialize", () => {
    const tool = WebMcpTool.make({
      name: "undefined-result",
      description: "Returns an unsupported value.",
      input: EmptyWebMcpInput,
      // oxlint-disable-next-line effecttsgo/effect-succeed-with-void -- Undefined is the invalid serialization result under test.
      execute: () => Effect.succeed(undefined),
    });

    return provideInMemoryWebMcp(
      Effect.gen(function* () {
        const error = yield* Effect.gen(function* () {
          const webMcp = yield* WebMcp;
          yield* webMcp.register(tool);
          const [registered] = yield* webMcp.getTools();
          if (registered === undefined)
            return yield* Effect.die("missing tool");
          return yield* webMcp.execute(registered);
        }).pipe(Effect.flip);

        expect(error).toBeInstanceOf(WebMcpToolExecutionError);
      }),
    );
  });

  it.effect("removes tools when their registration scope closes", () =>
    provideInMemoryWebMcp(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        yield* Effect.scoped(webMcp.register(greetingTool));
        const count = (yield* webMcp.getTools()).length;

        expect(count).toBe(0);
      }),
    ),
  );

  it.effect("serves tools until the serving fiber is interrupted", () =>
    provideInMemoryWebMcp(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        const servingFiber = yield* webMcp
          .serve(greetingTools)
          .pipe(Effect.forkScoped);
        yield* Effect.yieldNow;
        const whileServing = yield* webMcp.getTools();
        yield* Fiber.interrupt(servingFiber);
        const afterInterruption = yield* webMcp.getTools();

        expect(whileServing.map((tool) => tool.name)).toEqual(["greet-person"]);
        expect(afterInterruption).toEqual([]);
      }),
    ),
  );

  it.effect("captures every served tool's Effect service requirements", () => {
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

    return provideInMemoryWebMcp(
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
        const output = yield* webMcp.execute(registered, { name: "Ada" });
        yield* Fiber.interrupt(servingFiber);

        expect(output).toBe("Welcome, Ada!");
      }).pipe(Effect.provideService(GreetingPrefix, { value: "Welcome" })),
    );
  });

  it.effect("interrupts the handler when a tool execution is cancelled", () =>
    Effect.gen(function* () {
      const cleanedUp = yield* Deferred.make<void>();

      yield* provideInMemoryWebMcp(
        Effect.gen(function* () {
          const started = yield* Deferred.make<void>();
          const tool = WebMcpTool.make({
            name: "cancellable-tool",
            description: "Waits until its WebMCP execution is cancelled.",
            input: EmptyWebMcpInput,
            execute: () =>
              Deferred.succeed(started, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.ensuring(Deferred.succeed(cleanedUp, undefined)),
              ),
          });
          const webMcp = yield* WebMcp;
          yield* webMcp.register(tool);
          const [registered] = yield* webMcp.getTools();
          if (registered === undefined)
            return yield* Effect.die("missing tool");

          const execution = yield* Effect.forkChild(webMcp.execute(registered));
          yield* Deferred.await(started);
          yield* Fiber.interrupt(execution);
        }),
      ).pipe(Effect.scoped);

      yield* Deferred.await(cleanedUp);
    }),
  );
});
