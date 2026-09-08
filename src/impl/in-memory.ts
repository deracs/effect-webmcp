import { Effect, Layer } from "effect";

import {
  WebMcpRegistrationError,
  WebMcpToolExecutionError,
} from "../core/webmcp-error.js";
import type { RegisteredWebMcpTool, WebMcp } from "../core/webmcp.js";
import { makeWebMcpServe, WebMcpTag } from "../core/webmcp.js";
import type { NativeWebMcpTool } from "../internal/native-webmcp.js";
import {
  makeNativeWebMcpTool,
  scopedWebMcpRegistrationOptions,
  serializeWebMcpResult,
  toRegisteredWebMcpTool,
  validateWebMcpToolDefinition,
} from "../internal/webmcp-adapter.js";

interface InMemoryToolEntry {
  readonly definition: NativeWebMcpTool;
  readonly exposedTo: ReadonlyArray<string>;
}

/** Creates a fresh, scoped WebMCP implementation for deterministic tests. */
export const makeWebMcpInMemory: Effect.Effect<WebMcp> = Effect.sync(() => {
  const tools = new Map<string, InMemoryToolEntry>();
  const registeredEntries = new WeakMap<
    RegisteredWebMcpTool,
    InMemoryToolEntry
  >();
  const register: WebMcp["register"] = (tool, options) =>
    Effect.gen(function* () {
      yield* validateWebMcpToolDefinition(tool);
      if (tools.has(tool.name)) {
        return yield* new WebMcpRegistrationError({
          toolName: tool.name,
          cause: new Error(
            `WebMCP tool name is already registered: ${tool.name}`,
          ),
        });
      }
      const definition = yield* makeNativeWebMcpTool(tool);
      const nativeOptions = yield* scopedWebMcpRegistrationOptions(
        tool.name,
        options,
      );
      const signal = nativeOptions.signal;
      if (signal?.aborted === true) {
        return yield* new WebMcpRegistrationError({
          toolName: tool.name,
          cause: signal.reason,
        });
      }

      const entry: InMemoryToolEntry = {
        definition,
        exposedTo: nativeOptions.exposedTo ?? [],
      };
      tools.set(tool.name, entry);
      signal?.addEventListener(
        "abort",
        () => {
          if (tools.get(tool.name) === entry) tools.delete(tool.name);
        },
        { once: true },
      );
    });

  return WebMcpTag.of({
    register,
    serve: makeWebMcpServe(register),
    getTools: () =>
      Effect.sync(() =>
        [...tools.values()]
          .sort((left, right) =>
            left.definition.name.localeCompare(right.definition.name),
          )
          .map((entry) => {
            const registered = toRegisteredWebMcpTool({
              name: entry.definition.name,
              ...(entry.definition.title !== undefined
                ? { title: entry.definition.title }
                : {}),
              description: entry.definition.description,
              inputSchema: entry.definition.inputSchema,
              origin: "https://effect-webmcp.test",
              ...(entry.definition.annotations !== undefined
                ? { annotations: entry.definition.annotations }
                : {}),
            });
            registeredEntries.set(registered, entry);
            return registered;
          }),
      ),
    execute: (tool, input = {}) => {
      const entry = registeredEntries.get(tool);
      if (entry === undefined || tools.get(tool.name) !== entry) {
        return Effect.fail(
          new WebMcpToolExecutionError({
            toolName: tool.name,
            cause: new Error(
              `WebMCP tool handle is unknown or no longer registered: ${tool.name}`,
            ),
          }),
        );
      }
      return Effect.tryPromise({
        try: (signal) => entry.definition.execute(input, { signal }),
        catch: (cause) =>
          new WebMcpToolExecutionError({
            toolName: tool.name,
            cause,
          }),
      }).pipe(
        Effect.flatMap((output) => serializeWebMcpResult(tool.name, output)),
      );
    },
  });
});

/** Provides a fresh in-process WebMCP registry for tests. */
// oxlint-disable-next-line effecttsgo/lazy-effect -- Each call communicates that the registry is isolated.
export function webMcpInMemoryLayer(): Layer.Layer<WebMcp> {
  return Layer.effect(WebMcpTag, makeWebMcpInMemory);
}
