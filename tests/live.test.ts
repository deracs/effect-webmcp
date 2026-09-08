import { Effect, Fiber, type Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";
import {
  WebMcp,
  type WebMcpModelContext,
  WebMcpTool,
  WebMcpUnavailableError,
} from "../src/index.js";

describe("WebMcp.layer", () => {
  it("bridges Effect handlers and unregisters them with the scope", async () => {
    let registered:
      | Parameters<WebMcpModelContext["registerTool"]>[0]
      | undefined;
    let registrationSignal: AbortSignal | undefined;
    const registerTool = vi.fn<WebMcpModelContext["registerTool"]>(
      async (tool, options) => {
        registered = tool;
        registrationSignal = options?.signal;
      },
    );
    const modelContext: WebMcpModelContext = {
      registerTool,
      getTools: async () => [],
      executeTool: async () => "{}",
    };
    const liveLayer: Layer.Layer<WebMcp> = WebMcp.layer({ modelContext });
    const tool = WebMcpTool.make({
      name: "live-greeting",
      description: "Greets from a live browser adapter.",
      input: Schema.Struct({ name: Schema.String }),
      execute: ({ name }) => Effect.succeed(`Hello, ${name}!`),
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const webMcp = yield* WebMcp;
        yield* webMcp.register(tool, {
          exposedTo: ["https://agent.example"],
        });
        expect(registrationSignal?.aborted).toBe(false);
        expect(
          yield* Effect.promise(
            () =>
              registered?.execute(
                { name: "Grace" },
                { signal: new AbortController().signal },
              ) ?? Promise.reject(new Error("tool was not registered")),
          ),
        ).toBe("Hello, Grace!");
      }).pipe(Effect.provide(liveLayer), Effect.scoped),
    );

    expect(registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "live-greeting",
        inputSchema: expect.objectContaining({ type: "object" }),
      }),
      expect.objectContaining({
        exposedTo: ["https://agent.example"],
        signal: expect.any(AbortSignal),
      }),
    );
    expect(registrationSignal?.aborted).toBe(true);
  });

  it("fails its layer when document.modelContext is unavailable", async () => {
    const error = await Effect.runPromise(
      Effect.service(WebMcp).pipe(
        Effect.provide(WebMcp.layer()),
        Effect.scoped,
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(WebMcpUnavailableError);
  });

  it("waits for delayed document.modelContext injection", async () => {
    const originalDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );
    const modelContext: WebMcpModelContext = {
      registerTool: async () => {},
      getTools: async () => [],
      executeTool: async () => "{}",
    };

    const service = await Effect.runPromise(
      Effect.acquireUseRelease(
        Effect.sync(() => {
          Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: {},
          });
        }),
        () =>
          Effect.gen(function* () {
            const serviceFiber = yield* Effect.service(WebMcp).pipe(
              Effect.provide(
                WebMcp.layerWhenAvailable({
                  timeout: "1 second",
                  interval: "100 millis",
                }),
              ),
              Effect.scoped,
              Effect.forkChild,
            );
            yield* Effect.yieldNow;
            yield* Effect.sync(() => {
              Object.defineProperty(document, "modelContext", {
                configurable: true,
                value: modelContext,
              });
            });
            yield* TestClock.adjust("100 millis");
            return yield* Fiber.join(serviceFiber);
          }),
        () =>
          Effect.sync(() => {
            if (originalDocument === undefined) {
              Reflect.deleteProperty(globalThis, "document");
            } else {
              Object.defineProperty(globalThis, "document", originalDocument);
            }
          }),
      ).pipe(Effect.provide(TestClock.layer()), Effect.scoped),
    );

    expect(service).toBeDefined();
  });

  it("fails when delayed document.modelContext injection times out", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const serviceFiber = yield* Effect.service(WebMcp).pipe(
          Effect.provide(
            WebMcp.layerWhenAvailable({
              timeout: "1 second",
              interval: "100 millis",
            }),
          ),
          Effect.scoped,
          Effect.flip,
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        yield* TestClock.adjust("1 second");
        return yield* Fiber.join(serviceFiber);
      }).pipe(Effect.provide(TestClock.layer()), Effect.scoped),
    );

    expect(error).toBeInstanceOf(WebMcpUnavailableError);
  });
});
