import { Effect, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import { WebMcp, WebMcpTool, WebMcpUnavailableError } from "../src/index.js";
import type { NativeWebMcpModelContext } from "../src/internal/native-webmcp.js";

describe("WebMcp.layer", () => {
  it("bridges Effect handlers and unregisters them with the scope", async () => {
    let registered:
      | Parameters<NativeWebMcpModelContext["registerTool"]>[0]
      | undefined;
    let registrationSignal: AbortSignal | undefined;
    const registerTool = vi.fn<NativeWebMcpModelContext["registerTool"]>(
      async (tool, options) => {
        registered = tool;
        registrationSignal = options?.signal;
      },
    );
    const modelContext: NativeWebMcpModelContext = {
      registerTool,
      getTools: async () => [],
      executeTool: async () => "{}",
    };
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
      }).pipe(Effect.provide(WebMcp.layer({ modelContext })), Effect.scoped),
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
});
