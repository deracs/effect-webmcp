# Web project examples

Both examples expose `set-counter` with input `{ "value": 42 }`. The handler
returns `{ "status": "accepted" }` after handing the update to the UI; rendering
may happen on the next frame. Buttons and tool calls change the same counter.

| Example | Integration | Start from the repository root |
| --- | --- | --- |
| [TanStack Router + React](./tanstack) | `useEffect` owns a registration scope; leaving the route interrupts it | `pnpm dev:tanstack` |
| [Foldkit](./foldkit) | A persistent subscription owns registration and emits counter messages | `pnpm dev:foldkit` |

## Run

Use Node.js 24 and the repository's pinned pnpm version. Run `pnpm install`, then
one of the commands above. Each command builds the local library before starting
Vite. Follow the localhost URL printed in the terminal; Vite selects another port
if the first example is already running.

## Connect a browser agent

These examples use the package's draft **`document.modelContext`** contract.
An API exposed only at `navigator.modelContext` is not sufficient. Enable a
compatible browser or extension before loading the example. The page waits up to
five seconds for injection, then reports that WebMCP is unavailable while keeping
the ordinary buttons usable. Reload after enabling or installing the host.

With a compatible host, ask your browser agent to set the counter to 42. To try
the browser API directly, run this in the page's developer console:

```js
const tools = await document.modelContext.getTools();
const counter = tools.find((tool) => tool.name === "set-counter");
if (!counter) throw new Error("Counter tool is not registered on this page");
await document.modelContext.executeTool(counter, { value: 42 });
```

`{ value: "42" }` and `{ value: 42, extra: true }` are rejected by the input
schema. These examples do not install a polyfill or silently substitute the
in-memory layer, so “Ready” means registration with the browser host succeeded.

## Copy into your own project

Each app keeps its runtime code within its own directory. Replace the
`effect-webmcp: workspace:*` dependency with the published package version when
copying it out of this workspace. For these pinned examples:

```bash
pnpm add effect-webmcp@0.1.3 effect@4.0.0-rc.112
```

Keep a single Effect version in the app. Foldkit `0.158.2` requires
`4.0.0-rc.112`, so both examples use that version. The library itself still tests
against its `4.0.0-beta.47` baseline. The example TypeScript `paths` and Vite
`resolve.dedupe` settings make the locally linked library use the app's Effect
types and runtime. A standalone app with one Effect version does not need those
workspace settings.

The test files import the shared `examples/counter-integration.ts` harness;
copy it too (preserving the relative layout), or replace those tests with your
project's own integration tests. It records native registration and calls the
actual browser-facing handlers; it does not require an installed WebMCP host.

## Check

```bash
pnpm run build
pnpm run check:examples
# Full library and example validation:
pnpm run check
```

Example checks include strict typechecking, DOM integration tests for tool
execution, input rejection, cleanup and browser unavailability, and production
builds. The tests use a recording browser context in Happy DOM; they do not
certify compatibility with a particular browser extension.
