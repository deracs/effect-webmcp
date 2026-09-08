import { Effect, Layer } from "effect";
import type {
  RegisteredWebMcpTool,
  WebMcp,
  WebMcpGetToolsOptions,
} from "../core/webmcp.js";
import { WebMcpTag } from "../core/webmcp.js";
import {
  WebMcpDiscoveryError,
  WebMcpRegistrationError,
  WebMcpToolExecutionError,
  WebMcpUnavailableError,
} from "../core/webmcp-error.js";
import type {
  NativeRegisteredWebMcpTool,
  NativeWebMcpModelContext,
} from "../internal/native-webmcp.js";
import {
  makeNativeWebMcpTool,
  scopedWebMcpRegistrationOptions,
  toRegisteredWebMcpTool,
  validateWebMcpToolDefinition,
} from "../internal/webmcp-adapter.js";

/** Options for selecting a WebMCP browser context explicitly or from `document`. */
export interface WebMcpLiveOptions {
  readonly modelContext?: NativeWebMcpModelContext;
}

/** Creates the Effect WebMCP service backed by the draft browser API. */
export function makeWebMcpLive(
  options: WebMcpLiveOptions = {},
): Effect.Effect<WebMcp, WebMcpUnavailableError> {
  return Effect.gen(function* () {
    const modelContext = options.modelContext ?? modelContextFromDocument();
    if (modelContext === undefined) {
      return yield* Effect.fail(
        new WebMcpUnavailableError({
          message:
            "WebMCP is unavailable: this host does not expose document.modelContext",
        }),
      );
    }

    const nativeTools = new WeakMap<
      RegisteredWebMcpTool,
      NativeRegisteredWebMcpTool
    >();

    return WebMcpTag.of({
      register: (tool, registerOptions) =>
        Effect.gen(function* () {
          yield* validateWebMcpToolDefinition(tool);
          const nativeTool = yield* makeNativeWebMcpTool(tool);
          const nativeOptions = yield* scopedWebMcpRegistrationOptions(
            tool.name,
            registerOptions,
          );
          yield* Effect.tryPromise({
            try: () => modelContext.registerTool(nativeTool, nativeOptions),
            catch: (cause) =>
              new WebMcpRegistrationError({
                toolName: tool.name,
                cause,
              }),
          });
        }),
      getTools: (getToolsOptions) =>
        getNativeTools(modelContext, getToolsOptions).pipe(
          Effect.map((tools) =>
            tools.map((nativeTool) => {
              const tool = toRegisteredWebMcpTool(nativeTool);
              nativeTools.set(tool, nativeTool);
              return tool;
            }),
          ),
        ),
      execute: (tool, input = {}) => {
        const nativeTool = nativeTools.get(tool);
        if (nativeTool === undefined) {
          return Effect.fail(
            new WebMcpToolExecutionError({
              toolName: tool.name,
              cause: new Error(
                `WebMCP tool handle does not belong to this service: ${tool.name}`,
              ),
            }),
          );
        }
        return Effect.tryPromise({
          try: (signal) =>
            modelContext
              .executeTool(nativeTool, input, { signal })
              .then((result) => JSON.parse(result) as unknown),
          catch: (cause) =>
            new WebMcpToolExecutionError({
              toolName: tool.name,
              cause,
            }),
        });
      },
    });
  });
}

/** Provides the Effect WebMCP service backed by `document.modelContext`. */
export function webMcpLiveLayer(
  options?: WebMcpLiveOptions,
): Layer.Layer<WebMcp, WebMcpUnavailableError> {
  return Layer.effect(WebMcpTag, makeWebMcpLive(options));
}

function getNativeTools(
  modelContext: NativeWebMcpModelContext,
  options: WebMcpGetToolsOptions | undefined,
): Effect.Effect<
  ReadonlyArray<NativeRegisteredWebMcpTool>,
  WebMcpDiscoveryError
> {
  return Effect.tryPromise({
    try: () =>
      modelContext.getTools(
        options?.fromOrigins !== undefined
          ? { fromOrigins: options.fromOrigins }
          : undefined,
      ),
    catch: (cause) => new WebMcpDiscoveryError({ cause }),
  });
}

function modelContextFromDocument(): NativeWebMcpModelContext | undefined {
  if (typeof document === "undefined") return undefined;
  return (
    document as Document & {
      readonly modelContext?: NativeWebMcpModelContext;
    }
  ).modelContext;
}
