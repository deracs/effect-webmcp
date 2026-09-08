# Foldkit counter

A runnable version of the
[Foldkit counter example](https://foldkit.dev/core/counter-example).

## Requirements

- Node.js 22.22.2 or newer

## Run it

```bash
pnpm install
pnpm --filter @effect-webmcp/foldkit-counter dev
```

## Verify it

```bash
pnpm --filter @effect-webmcp/foldkit-counter test
pnpm --filter @effect-webmcp/foldkit-counter typecheck
pnpm --filter @effect-webmcp/foldkit-counter build
```

The Foldkit Vite plugin exposes its development-tools MCP server on port 9988.
The repository's `.mcp.json` config starts the client-side MCP bridge.
