import type { Context, Effect, Scope } from "effect";
import { Context as EffectContext } from "effect";
import type {
  WebMcpDiscoveryError,
  WebMcpRegistrationError,
  WebMcpToolExecutionError,
} from "./webmcp-error.js";
import type { WebMcpTool, WebMcpToolAnnotations } from "./webmcp-tool.js";

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
  readonly getTools: (
    options?: WebMcpGetToolsOptions,
  ) => Effect.Effect<ReadonlyArray<RegisteredWebMcpTool>, WebMcpDiscoveryError>;
  readonly execute: (
    tool: RegisteredWebMcpTool,
    input?: object,
  ) => Effect.Effect<unknown, WebMcpToolExecutionError>;
}

/** Internal service tag used by the live and in-memory WebMCP layers. */
export const WebMcpTag: Context.Service<WebMcp, WebMcp> =
  EffectContext.Service<WebMcp>("effect-webmcp/WebMcp");
