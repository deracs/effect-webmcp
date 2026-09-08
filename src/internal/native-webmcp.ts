import type { WebMcpToolAnnotations } from "../core/webmcp-tool.js";

/** Minimal structural type for the draft browser API, kept private to the adapter. */
export interface NativeWebMcpModelContext {
  readonly registerTool: (
    tool: NativeWebMcpTool,
    options?: NativeWebMcpRegisterOptions,
  ) => Promise<void>;
  readonly getTools: (
    options?: NativeWebMcpGetToolsOptions,
  ) => Promise<ReadonlyArray<NativeRegisteredWebMcpTool>>;
  readonly executeTool: (
    tool: NativeRegisteredWebMcpTool,
    input?: object,
    options?: NativeWebMcpExecuteOptions,
  ) => Promise<string>;
}

export interface NativeWebMcpTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly annotations?: WebMcpToolAnnotations;
  readonly execute: (
    input: object,
    options: NativeWebMcpExecuteOptions,
  ) => Promise<unknown>;
}

export interface NativeRegisteredWebMcpTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: unknown;
  readonly window?: Window;
  readonly origin: string;
  readonly annotations?: WebMcpToolAnnotations;
}

export interface NativeWebMcpRegisterOptions {
  readonly exposedTo?: ReadonlyArray<string>;
  readonly signal?: AbortSignal;
}

export interface NativeWebMcpGetToolsOptions {
  readonly fromOrigins?: ReadonlyArray<string>;
}

export interface NativeWebMcpExecuteOptions {
  readonly signal: AbortSignal;
}
