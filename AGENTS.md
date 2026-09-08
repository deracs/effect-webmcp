# AGENTS

This repository contains the `effect-webmcp` npm package: an Effect-native wrapper around the browser WebMCP API.

## Repository shape

- Public entrypoint: `src/index.ts`
- Public service contract: `src/core/webmcp.ts`
- Public tool constructor and related types: `src/core/webmcp-tool.ts`
- Public error types: `src/core/webmcp-error.ts`
- Browser-backed implementation: `src/impl/live.ts`
- In-memory test implementation: `src/impl/in-memory.ts`
- Internal browser adaptation details: `src/internal/*`
- Tests: `tests/*`

## Working conventions

- Preserve the package's Effect-first API design.
- Keep browser/runtime-specific details in `src/impl/*` or `src/internal/*`, not in the public API surface unless intentionally exposing a new capability.
- Prefer adding or changing exports only through `src/index.ts`.
- Keep `WebMcp` as the public service tag and layer entrypoint.
- Keep tool definitions strict at the boundary:
  - decode input with `Schema`
  - reject excess properties where the existing code does
  - only add output encoding when the public API intends it
- Maintain the existing distinction between:
  - registration/discovery/execution errors
  - unavailable browser context errors
  - in-memory versus live implementations

## Style expectations

- Match the existing TypeScript style:
  - ESM imports with explicit `.js` extension in local imports
  - `Effect.gen` for multi-step workflows
  - narrow public types and explicit exported interfaces
  - readonly-first interfaces and options objects
- Keep edits minimal and focused.
- Do not introduce new dependencies unless clearly justified.
- Avoid broad refactors unless the task explicitly calls for them.

## Tests and validation

Before concluding work, prefer these checks:

```bash
pnpm run check
```

That command runs format, lint, typecheck, tests, and build.

For focused iteration, these are useful:

```bash
pnpm run check:type
pnpm run test
pnpm run build
```

## Release safety

- The package version in `package.json` is the release version.
- Git release tags must be annotated and match the package version exactly: `vX.Y.Z`.
- Release tags are immutable.
- See `RELEASING.md` and `.github/workflows/release.yml` for the canonical release process.

## When changing public behavior

If a change affects the public API, runtime behavior, or compatibility expectations:

- update or add tests in `tests/*`
- update `README.md` when user-facing usage changes
- consider whether the change should affect the next version bump

## Search tips

Useful symbols for navigation:

- `WebMcp`
- `WebMcpTool.make`
- `layerWhenAvailable`
- `layerInMemory`
- `RegisteredWebMcpTool`
- `WebMcpUnavailableError`
- `WebMcpRegistrationError`
- `WebMcpToolExecutionError`
