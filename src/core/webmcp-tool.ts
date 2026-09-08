import { Effect, JsonSchema, Schema } from "effect";

/** Safety and trust hints described by the WebMCP imperative API. */
export interface WebMcpToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly untrustedContentHint?: boolean;
  readonly consequentialHint?: boolean;
}

/** Metadata and handler used to define an Effect-native WebMCP tool. */
export interface WebMcpToolOptions<
  InputSchema extends Schema.Top,
  Output,
  Error,
  Requirements,
> {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly input: InputSchema;
  readonly annotations?: WebMcpToolAnnotations;
  readonly execute: (
    input: InputSchema["Type"],
  ) => Effect.Effect<Output, Error, Requirements>;
}

/** Metadata and handler for a WebMCP tool whose output is validated and encoded. */
export interface WebMcpToolWithOutputOptions<
  InputSchema extends Schema.Top,
  OutputSchema extends Schema.Top,
  Error,
  Requirements,
> extends Omit<
  WebMcpToolOptions<InputSchema, OutputSchema["Type"], Error, Requirements>,
  "execute"
> {
  readonly output: OutputSchema;
  readonly execute: (
    input: InputSchema["Type"],
  ) => Effect.Effect<OutputSchema["Type"], Error, Requirements>;
}

/**
 * An Effect-native browser tool whose input is decoded before its handler runs.
 *
 * The `Input` and `Output` parameters represent the JSON-encoded boundary
 * values seen by WebMCP agents.
 */
export class WebMcpTool<Input, Output, Error, Requirements> {
  declare private readonly _input: Input;
  readonly _tag = "WebMcpTool" as const;
  readonly name: string;
  readonly title: string | undefined;
  readonly description: string;
  readonly inputSchema: JsonSchema.JsonSchema;
  readonly annotations: WebMcpToolAnnotations | undefined;
  readonly _execute: (
    input: unknown,
  ) => Effect.Effect<Output, Error, Requirements>;

  private constructor(options: {
    readonly name: string;
    readonly title: string | undefined;
    readonly description: string;
    readonly inputSchema: JsonSchema.JsonSchema;
    readonly annotations: WebMcpToolAnnotations | undefined;
    readonly execute: (
      input: unknown,
    ) => Effect.Effect<Output, Error, Requirements>;
  }) {
    this.name = options.name;
    this.title = options.title;
    this.description = options.description;
    this.inputSchema = options.inputSchema;
    this.annotations = options.annotations;
    this._execute = options.execute;
  }

  static make<
    InputSchema extends Schema.Top,
    OutputSchema extends Schema.Top,
    Error,
    Requirements,
  >(
    options: WebMcpToolWithOutputOptions<
      InputSchema,
      OutputSchema,
      Error,
      Requirements
    >,
  ): WebMcpTool<
    InputSchema["Encoded"],
    OutputSchema["Encoded"],
    Error | Schema.SchemaError,
    | Requirements
    | InputSchema["DecodingServices"]
    | OutputSchema["EncodingServices"]
  >;
  static make<InputSchema extends Schema.Top, Output, Error, Requirements>(
    options: WebMcpToolOptions<InputSchema, Output, Error, Requirements>,
  ): WebMcpTool<
    InputSchema["Encoded"],
    Output,
    Error | Schema.SchemaError,
    Requirements | InputSchema["DecodingServices"]
  >;
  static make(
    options:
      | WebMcpToolOptions<Schema.Top, unknown, unknown, unknown>
      | WebMcpToolWithOutputOptions<Schema.Top, Schema.Top, unknown, unknown>,
  ): WebMcpTool<unknown, unknown, unknown, unknown> {
    const execute = (input: unknown) =>
      Schema.decodeUnknownEffect(options.input)(input, {
        onExcessProperty: "error",
      }).pipe(
        Effect.flatMap(options.execute),
        "output" in options
          ? Effect.flatMap((output) =>
              Schema.encodeUnknownEffect(options.output)(output),
            )
          : (effect) => effect,
      );

    return new WebMcpTool({
      name: options.name,
      title: options.title,
      description: options.description,
      inputSchema: webMcpInputJsonSchema(options.input),
      annotations: options.annotations,
      execute,
    });
  }
}

/** An Effect-native WebMCP tool collection with shared service requirements. */
export type AnyWebMcpTool<Requirements = never> = WebMcpTool<
  unknown,
  unknown,
  unknown,
  Requirements
>;

/** A strict empty object schema for WebMCP tools that take no arguments. */
export const EmptyWebMcpInput = Schema.Record(Schema.String, Schema.Never);

function webMcpInputJsonSchema(inputSchema: Schema.Top): JsonSchema.JsonSchema {
  const document = JsonSchema.toDocumentDraft07(
    Schema.toJsonSchemaDocument(inputSchema, {
      additionalProperties: false,
    }),
  );
  return Object.keys(document.definitions).length === 0
    ? document.schema
    : { ...document.schema, definitions: document.definitions };
}
