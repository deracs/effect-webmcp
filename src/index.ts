import type { Context } from "effect";
import type * as internal from "./core/webmcp.js";
import { WebMcpTag } from "./core/webmcp.js";
import { webMcpInMemoryLayer } from "./impl/in-memory.js";
import { type WebMcpLiveOptions, webMcpLiveLayer } from "./impl/live.js";

export type {
  RegisteredWebMcpTool,
  WebMcpGetToolsOptions,
  WebMcpRegisterOptions,
} from "./core/webmcp.js";
export {
  WebMcpDiscoveryError,
  WebMcpRegistrationError,
  WebMcpToolExecutionError,
  WebMcpUnavailableError,
} from "./core/webmcp-error.js";
export {
  EmptyWebMcpInput,
  WebMcpTool,
  type WebMcpToolAnnotations,
  type WebMcpToolOptions,
  type WebMcpToolWithOutputOptions,
} from "./core/webmcp-tool.js";
export type { WebMcpLiveOptions } from "./impl/live.js";

/** Effect service for registering, discovering, and invoking browser WebMCP tools. */
export interface WebMcp extends internal.WebMcp {}

/** WebMCP service tag with browser and in-memory layer constructors. */
export const WebMcp: Context.Service<WebMcp, WebMcp> & {
  readonly layer: (
    options?: WebMcpLiveOptions,
  ) => ReturnType<typeof webMcpLiveLayer>;
  readonly layerInMemory: () => ReturnType<typeof webMcpInMemoryLayer>;
} = Object.assign(WebMcpTag, {
  layer: (options?: WebMcpLiveOptions) => webMcpLiveLayer(options),
  layerInMemory: () => webMcpInMemoryLayer(),
});
