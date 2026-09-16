import { Effect, Queue, Schema, Stream } from "effect";
import { WebMcp, WebMcpTool } from "effect-webmcp";
import { Runtime, Subscription, type Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";

const CounterModel = Schema.Struct({
  count: Schema.Int,
  status: Schema.String,
});
type CounterModel = typeof CounterModel.Type;
const CounterMessage = defineMessageUnion({
  Incremented: {},
  Decremented: {},
  CounterSet: { value: Schema.Int },
  WebMcpStatusChanged: { status: Schema.String },
});
type CounterMessage = typeof CounterMessage.Type;

function updateCounter(
  model: CounterModel,
  message: CounterMessage,
): Update.Return<CounterModel, CounterMessage> {
  return CounterMessage.match(message, {
    Incremented: () => ({ model: { ...model, count: model.count + 1 } }),
    Decremented: () => ({ model: { ...model, count: model.count - 1 } }),
    CounterSet: ({ value }) => ({ model: { ...model, count: value } }),
    WebMcpStatusChanged: ({ status }) => ({ model: { ...model, status } }),
  });
}

// A persistent subscription owns registration; tool calls enter the normal update loop.
const counterSubscriptions = Subscription.make<CounterModel, CounterMessage>()(
  () => ({
    webMcp: Subscription.persistent(
      Stream.callback<CounterMessage>((messages) =>
        Effect.gen(function* () {
          const webMcp = yield* WebMcp;
          const setCounter = WebMcpTool.make({
            name: "set-counter",
            description: "Sets the counter displayed on the current page.",
            input: Schema.Struct({ value: Schema.Int }),
            output: Schema.Struct({ status: Schema.Literal("accepted") }),
            annotations: { consequentialHint: false },
            execute: ({ value }) =>
              Queue.offer(messages, CounterMessage.CounterSet({ value })).pipe(
                Effect.as({ status: "accepted" as const }),
              ),
          });
          yield* webMcp.register(setCounter);
          yield* Queue.offer(
            messages,
            CounterMessage.WebMcpStatusChanged({
              status: "Ready: set-counter is registered.",
            }),
          );
          return yield* Effect.never;
        }).pipe(
          Effect.provide(WebMcp.layerWhenAvailable({ timeout: "5 seconds" })),
          Effect.scoped,
          Effect.catch((error) =>
            Queue.offer(
              messages,
              CounterMessage.WebMcpStatusChanged({
                status:
                  error._tag === "WebMcpUnavailableError"
                    ? "WebMCP unavailable. The counter still works; reload after enabling a compatible host."
                    : `Tool registration failed: ${error.message}`,
              }),
            ),
          ),
        ),
      ),
    ),
  }),
);

function viewCounter(
  model: CounterModel,
  h: HtmlBuilder<CounterMessage>,
): Document {
  return {
    title: `Foldkit + WebMCP · ${model.count}`,
    body: h.main(
      [],
      [
        h.h1([], ["Foldkit + WebMCP"]),
        h.p([], ["Change the same counter with a button or an agent tool."]),
        h.output([h.AriaLive("polite")], [String(model.count)]),
        h.div(
          [h.Class("controls")],
          [
            h.button([h.OnClick(CounterMessage.Decremented())], ["−1"]),
            h.button(
              [h.OnClick(CounterMessage.CounterSet({ value: 0 }))],
              ["Reset"],
            ),
            h.button([h.OnClick(CounterMessage.Incremented())], ["+1"]),
          ],
        ),
        h.p([h.Role("status")], [model.status]),
        h.p(
          [],
          [
            "Ask your agent to call ",
            h.code([], ["set-counter"]),
            " with ",
            h.code([], ['{"value": 42}']),
            ".",
          ],
        ),
      ],
    ),
  };
}

/** Mounts a counter whose subscription unregisters its tool when disposed. */
export function mountCounterApp(container: HTMLElement): Runtime.EmbedHandle {
  return Runtime.embed(
    Runtime.makeApplication({
      Model: CounterModel,
      container,
      init: () => ({
        model: { count: 0, status: "Waiting for document.modelContext…" },
      }),
      update: updateCounter,
      view: viewCounter,
      subscriptions: counterSubscriptions,
    }),
  );
}
