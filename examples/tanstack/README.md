# TanStack Router + React

From the repository root:

```bash
pnpm install
pnpm dev:tanstack
```

This is a client-rendered Vite app using TanStack Router's
[code-based routes](https://tanstack.com/router/latest/docs/routing/code-based-routing).

- [`src/main.tsx`](./src/main.tsx) wires the counter and About routes.
- [`src/counter-page.tsx`](./src/counter-page.tsx) defines `set-counter` and
  registers it inside `useEffect`. The Effect fiber keeps its registration scope
  open with `Effect.never`; the cleanup interrupts that fiber on unmount.
- The tool passes its decoded value to React's state setter. It does not capture
  a stale copy of the count or register again on every render.

Click **About** to unregister the tool, then **Counter** to register a fresh one.
The app uses React Strict Mode, so the integration also handles development's
mount/cleanup/remount cycle. Vite hot replacement unmounts the previous root.

For TanStack Start, put the same `useEffect` integration in a client-rendered
component. Do not register browser tools in server loaders or during rendering.

See the [examples guide](../README.md) for browser requirements, manual tool
invocation, copying this into another project, and validation commands.
