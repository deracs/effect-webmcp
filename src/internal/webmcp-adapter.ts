import { Effect, FiberSet } from "effect";
import type {
  RegisteredWebMcpTool,
  WebMcpRegisterOptions,
} from "../core/webmcp.js";
import {
  WebMcpRegistrationError,
  WebMcpToolExecutionError,
} from "../core/webmcp-error.js";
import type { WebMcpTool } from "../core/webmcp-tool.js";
import type {
  NativeRegisteredWebMcpTool,
  NativeWebMcpRegisterOptions,
  NativeWebMcpTool,
} from "./native-webmcp.js";

const WEBMCP_TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const WEBMCP_TOOL_NAME_MAX_LENGTH = 128;

/** Converts public discovery metadata while retaining no browser-owned objects. */
export function toRegisteredWebMcpTool(
  tool: NativeRegisteredWebMcpTool,
): RegisteredWebMcpTool {
  return {
    name: tool.name,
    ...(tool.title !== undefined ? { title: tool.title } : {}),
    description: tool.description,
    ...(tool.inputSchema !== undefined
      ? { inputSchema: tool.inputSchema }
      : {}),
    origin: tool.origin,
    ...(tool.annotations !== undefined
      ? { annotations: tool.annotations }
      : {}),
  };
}

/** Applies the WebMCP name and description rules consistently in every layer. */
export function validateWebMcpToolDefinition<
  Input,
  Output,
  Error,
  Requirements,
>(
  tool: WebMcpTool<Input, Output, Error, Requirements>,
): Effect.Effect<void, WebMcpRegistrationError> {
  if (
    tool.name.length === 0 ||
    tool.name.length > WEBMCP_TOOL_NAME_MAX_LENGTH ||
    !WEBMCP_TOOL_NAME_PATTERN.test(tool.name)
  ) {
    return Effect.fail(
      new WebMcpRegistrationError({
        toolName: tool.name,
        cause: new Error(
          `Invalid WebMCP tool name; use 1-128 ASCII letters, digits, "_", "-", or ".": ${tool.name}`,
        ),
      }),
    );
  }
  if (tool.description.length === 0) {
    return Effect.fail(
      new WebMcpRegistrationError({
        toolName: tool.name,
        cause: new Error(
          `Invalid WebMCP tool description; descriptions cannot be empty: ${tool.name}`,
        ),
      }),
    );
  }
  return Effect.void;
}

/** Builds the browser callback while capturing the registration-time Effect context. */
export function makeNativeWebMcpTool<Input, Output, Error, Requirements>(
  tool: WebMcpTool<Input, Output, Error, Requirements>,
): Effect.Effect<
  NativeWebMcpTool,
  never,
  Requirements | import("effect").Scope.Scope
> {
  return Effect.gen(function* () {
    const runPromise = yield* FiberSet.makeRuntimePromise<
      Requirements,
      Output,
      Error
    >();

    return {
      name: tool.name,
      ...(tool.title !== undefined ? { title: tool.title } : {}),
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.annotations !== undefined
        ? { annotations: tool.annotations }
        : {}),
      execute: (input, options) =>
        runPromise(tool._execute(input), {
          signal: options.signal,
          propagateInterruption: true,
        }),
    };
  });
}

/** Owns the AbortController that makes a WebMCP registration scope-bound. */
export function scopedWebMcpRegistrationOptions(
  toolName: string,
  options: WebMcpRegisterOptions | undefined,
): Effect.Effect<
  NativeWebMcpRegisterOptions,
  WebMcpRegistrationError,
  import("effect").Scope.Scope
> {
  return Effect.gen(function* () {
    const controller = new AbortController();
    const externalSignal = options?.signal;

    if (externalSignal?.aborted === true) {
      return yield* Effect.fail(
        new WebMcpRegistrationError({
          toolName,
          cause: externalSignal.reason,
        }),
      );
    }

    if (externalSignal !== undefined) {
      const abort = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener("abort", abort, { once: true });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => externalSignal.removeEventListener("abort", abort)),
      );
    }

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => controller.abort("WebMCP registration scope closed")),
    );

    return {
      signal: controller.signal,
      ...(options?.exposedTo !== undefined
        ? { exposedTo: options.exposedTo }
        : {}),
    };
  });
}

/** Round-trips a handler result exactly as the WebMCP browser algorithm does. */
export function serializeWebMcpResult(
  toolName: string,
  output: unknown,
): Effect.Effect<unknown, WebMcpToolExecutionError> {
  return Effect.try({
    try: () => {
      const serialized = JSON.stringify(output);
      if (serialized === undefined) {
        throw new TypeError(
          `WebMCP tool result is not JSON serializable: ${toolName}`,
        );
      }
      return JSON.parse(serialized) as unknown;
    },
    catch: (cause) => new WebMcpToolExecutionError({ toolName, cause }),
  });
}
