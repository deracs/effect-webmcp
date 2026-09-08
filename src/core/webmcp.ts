import type { Context, Scope } from "effect";
import { Effect, Context as EffectContext } from "effect";
import type {
  WebMcpDiscoveryError,
  WebMcpRegistrationError,
  WebMcpToolExecutionError,
} from "./webmcp-error.js";
import type {
  AnyWebMcpTool,
  WebMcpTool,
  WebMcpToolAnnotations,
} from "./webmcp-tool.js";

type WebMcpToolRequirements<Tool> =
  Tool extends WebMcpTool<unknown, unknown, unknown, infer Requirements>
    ? Requirements
    : never;

/** Options controlling the documents to which a registered WebMCP tool is exposed. */
export interface WebMcpRegisterOptions {
  readonly exposedTo?: ReadonlyArray<string>;
  readonly signal?: AbortSignal;
}

/** Options controlling the origins included in WebMCP tool discovery. */
export interface WebMcpGetToolsOptions {
  readonly fromOrigins?: ReadonlyArray<string>;
}

/** Public metadata for a tool discovered through the current WebMCP context. */
export interface RegisteredWebMcpTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: unknown;
  readonly origin: string;
  readonly annotations?: WebMcpToolAnnotations;
}

/** Effect service for registering, discovering, and invoking browser WebMCP tools. */
export interface WebMcp {
  readonly register: <Input, Output, Error, Requirements>(
    tool: WebMcpTool<Input, Output, Error, Requirements>,
    options?: WebMcpRegisterOptions,
  ) => Effect.Effect<void, WebMcpRegistrationError, Requirements | Scope.Scope>;
  /**
   * Registers every tool and remains active until interrupted.
   *
   * Interrupting this effect closes its scope and unregisters every tool.
   */
  readonly serve: <const Tools extends ReadonlyArray<AnyWebMcpTool<unknown>>>(
    tools: Tools,
    options?: WebMcpRegisterOptions,
  ) => Effect.Effect<
    never,
    WebMcpRegistrationError,
    WebMcpToolRequirements<Tools[number]>
  >;
  readonly getTools: (
    options?: WebMcpGetToolsOptions,
  ) => Effect.Effect<ReadonlyArray<RegisteredWebMcpTool>, WebMcpDiscoveryError>;
  readonly execute: (
    tool: RegisteredWebMcpTool,
    input?: object,
  ) => Effect.Effect<unknown, WebMcpToolExecutionError>;
}

/** Builds the long-lived WebMCP tool-serving operation shared by service implementations. */
export function makeWebMcpServe(register: WebMcp["register"]): WebMcp["serve"] {
  const serveTools = (
    tools: ReadonlyArray<AnyWebMcpTool<unknown>>,
    registerOptions: WebMcpRegisterOptions | undefined,
  ) =>
    Effect.forEach(tools, (tool) => register(tool, registerOptions), {
      discard: true,
    }).pipe(Effect.andThen(Effect.never), Effect.scoped);
  // SAFETY: Each tool is passed to `register` inside an owned scope, so the combined
  // Effect requires exactly the union of the services carried by the input tool tuple.
  return serveTools as WebMcp["serve"];
}

/** Internal service tag used by the live and in-memory WebMCP layers. */
export const WebMcpTag: Context.Service<WebMcp, WebMcp> =
  EffectContext.Service<WebMcp>("effect-webmcp/WebMcp");
