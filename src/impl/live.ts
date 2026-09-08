import type { Duration } from "effect";
import { Effect, Layer, Option } from "effect";
import type {
  RegisteredWebMcpTool,
  WebMcp,
  WebMcpGetToolsOptions,
} from "../core/webmcp.js";
import { makeWebMcpServe, WebMcpTag } from "../core/webmcp.js";
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

/** Browser-provided WebMCP model context accepted by the live service Layer. */
export interface WebMcpModelContext extends NativeWebMcpModelContext {}

/** Options for selecting a WebMCP browser context explicitly or from `document`. */
export interface WebMcpLiveOptions {
  readonly modelContext?: WebMcpModelContext;
}

/** Polling options used while waiting for delayed WebMCP browser injection. */
export interface WebMcpWhenAvailableOptions {
  /** Maximum time to wait for `document.modelContext`. */
  readonly timeout?: Duration.Input;
  /** Delay between checks for `document.modelContext`. */
  readonly interval?: Duration.Input;
}

const DEFAULT_AVAILABILITY_TIMEOUT = "30 seconds";
const DEFAULT_AVAILABILITY_INTERVAL = "500 millis";

/** Creates the Effect WebMCP service backed by the draft browser API. */
export function makeWebMcpLive(options: {
  readonly modelContext: WebMcpModelContext;
}): Effect.Effect<WebMcp>;
export function makeWebMcpLive(
  options?: WebMcpLiveOptions,
): Effect.Effect<WebMcp, WebMcpUnavailableError>;
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
    const register: WebMcp["register"] = (tool, registerOptions) =>
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
      });

    return WebMcpTag.of({
      register,
      serve: makeWebMcpServe(register),
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
export function webMcpLiveLayer(options: {
  readonly modelContext: WebMcpModelContext;
}): Layer.Layer<WebMcp>;
export function webMcpLiveLayer(
  options?: WebMcpLiveOptions,
): Layer.Layer<WebMcp, WebMcpUnavailableError>;
export function webMcpLiveLayer(
  options?: WebMcpLiveOptions,
): Layer.Layer<WebMcp, WebMcpUnavailableError> {
  return Layer.effect(WebMcpTag, makeWebMcpLive(options));
}

/** Creates the live WebMCP service after delayed browser injection becomes available. */
export function makeWebMcpWhenAvailable(
  options: WebMcpWhenAvailableOptions = {},
): Effect.Effect<WebMcp, WebMcpUnavailableError> {
  const timeout = options.timeout ?? DEFAULT_AVAILABILITY_TIMEOUT;
  const interval = options.interval ?? DEFAULT_AVAILABILITY_INTERVAL;

  return waitForWebMcpModelContext(interval).pipe(
    Effect.timeoutOption(timeout),
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new WebMcpUnavailableError({
              message:
                "WebMCP is unavailable: document.modelContext was not injected before the timeout",
            }),
          ),
        onSome: (modelContext) => makeWebMcpLive({ modelContext }),
      }),
    ),
  );
}

/** Provides WebMCP after polling for delayed `document.modelContext` injection. */
export function webMcpWhenAvailableLayer(
  options?: WebMcpWhenAvailableOptions,
): Layer.Layer<WebMcp, WebMcpUnavailableError> {
  return Layer.effect(WebMcpTag, makeWebMcpWhenAvailable(options));
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

function waitForWebMcpModelContext(
  interval: Duration.Input,
): Effect.Effect<WebMcpModelContext> {
  return Effect.suspend(() => {
    const modelContext = modelContextFromDocument();
    return modelContext === undefined
      ? Effect.sleep(interval).pipe(
          Effect.andThen(waitForWebMcpModelContext(interval)),
        )
      : Effect.succeed(modelContext);
  });
}
