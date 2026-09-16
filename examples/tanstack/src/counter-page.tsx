import { Effect, Schema } from "effect";
import { WebMcp, WebMcpTool } from "effect-webmcp";
import { type ReactElement, useEffect, useState } from "react";

/** Registers the counter tool only while this route is mounted. */
export function CounterPage(): ReactElement {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("Waiting for document.modelContext…");

  useEffect(() => {
    const setCounter = WebMcpTool.make({
      name: "set-counter",
      description: "Sets the counter displayed on the current page.",
      input: Schema.Struct({ value: Schema.Int }),
      output: Schema.Struct({ status: Schema.Literal("accepted") }),
      annotations: { consequentialHint: false },
      execute: ({ value }) =>
        Effect.sync(() => {
          setCount(value);
          return { status: "accepted" as const };
        }),
    });

    const fiber = Effect.gen(function* () {
      const webMcp = yield* WebMcp;
      yield* webMcp.register(setCounter);
      yield* Effect.sync(() => setStatus("Ready: set-counter is registered."));
      // Keep the registration scope alive until React runs the cleanup below.
      return yield* Effect.never;
    }).pipe(
      Effect.provide(WebMcp.layerWhenAvailable({ timeout: "5 seconds" })),
      Effect.scoped,
      Effect.catch((error) =>
        Effect.sync(() =>
          setStatus(
            error._tag === "WebMcpUnavailableError"
              ? "WebMCP unavailable. The counter still works; reload after enabling a compatible host."
              : `Tool registration failed: ${error.message}`,
          ),
        ),
      ),
      Effect.runFork,
    );

    return () => fiber.interruptUnsafe();
  }, []);

  return (
    <section>
      <h1>TanStack + WebMCP</h1>
      <p>Change the same counter with a button or an agent tool.</p>
      <output aria-live="polite">{count}</output>
      <div className="controls">
        <button onClick={() => setCount((value) => value - 1)}>−1</button>
        <button onClick={() => setCount(0)}>Reset</button>
        <button onClick={() => setCount((value) => value + 1)}>+1</button>
      </div>
      <p role="status">{status}</p>
      <p>
        Ask your agent to call <code>set-counter</code> with{" "}
        <code>{'{"value": 42}'}</code>.
      </p>
      <p>Visit About to unmount this route and unregister its tool.</p>
    </section>
  );
}
