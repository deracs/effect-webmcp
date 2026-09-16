# Foldkit

From the repository root:

```bash
pnpm install
pnpm dev:foldkit
```

This Vite app uses [Foldkit](https://github.com/foldkit/foldkit)'s model, message,
update, view and subscription APIs.

- [`src/counter-app.ts`](./src/counter-app.ts) defines the counter and its WebMCP
  subscription. `Subscription.persistent` keeps registration alive across model
  changes. `Stream.callback` supplies a message queue; the `set-counter` handler
  offers a `CounterSet` message to it.
- The normal `updateCounter` function owns state changes from both buttons and
  agent tools. The handler acknowledges queueing the message, without claiming
  the DOM has already rendered it.
- [`src/main.ts`](./src/main.ts) mounts the app. `Runtime.embed` supplies a
  disposal handle; hot replacement disposes the previous runtime, interrupts the
  subscription and closes the registration scope.

To integrate with an existing Foldkit app, add the WebMCP subscription to that
app's subscriptions and its messages to your update function. Keep it persistent
if registration should survive ordinary model updates. No external mutable copy
of the model is needed.

See the [examples guide](../README.md) for browser requirements, manual tool
invocation, the pinned Effect version, and validation commands.
