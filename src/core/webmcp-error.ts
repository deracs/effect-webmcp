import { Data } from "effect";

/** Indicates that the host does not expose the WebMCP `document.modelContext` API. */
export class WebMcpUnavailableError extends Data.TaggedError(
  "WebMcpUnavailableError",
)<{
  readonly message: string;
}> {}

/** Reports a browser refusal or invalid definition encountered during WebMCP tool registration. */
export class WebMcpRegistrationError extends Data.TaggedError(
  "WebMcpRegistrationError",
)<{
  readonly toolName: string;
  readonly cause: unknown;
}> {}

/** Reports a failure while discovering the WebMCP tools visible to the current document. */
export class WebMcpDiscoveryError extends Data.TaggedError(
  "WebMcpDiscoveryError",
)<{
  readonly cause: unknown;
}> {}

/** Reports invalid input, handler failure, cancellation, or serialization during a WebMCP call. */
export class WebMcpToolExecutionError extends Data.TaggedError(
  "WebMcpToolExecutionError",
)<{
  readonly toolName: string;
  readonly cause: unknown;
}> {}
