# WebSocket-dependent features — coverage notes

These features require a `devbar`-injected page (the page sets up a WebSocket
to sweetlink's server, and CLI commands are forwarded over that bridge):

- `sweetlink a11y` — runs axe-core in the browser, requires devbar's axe-core injection
- `sweetlink vitals` — uses web-vitals JS lib loaded by devbar
- `sweetlink exec --code <js>` — `exec-js` WS command, evaluated on devbar page
- `sweetlink query --selector <css>` — `query-dom` WS command
- `sweetlink refresh` — `refresh` WS command (the daemon doesn't have a refresh action)
- `sweetlink schema` — `get-schema` WS command (axe rules listing)
- `sweetlink outline` — `get-outline` WS command (heading hierarchy)

These are exercised by `e2e/sweetlink-v2.spec.ts` against the playground
(which has devbar wired up). To add isolated TDD specs for them, the
harness in `_harness.ts` would need to inject the built devbar bundle into
the static fixture page and start sweetlink's WebSocket server alongside
the daemon. Deferred until those features show observable bugs.

Tracked TDD bugs found via this harness layer (all fixed):
- A: recording manifest hardcoded errors=0
- B: screenshot during recording targeted wrong page + wasn't logged
- C: CSS-selector click during recording silently failed (no recording-page route)
- D: ring buffer cross-session leak (regression guard, not active today)
- F: --full-page reported viewport dims, not actual PNG dims
- G: click-ref on disabled element hung 30s
- H: fill-ref on non-fillable element hung 30s
- I: console-read/network-read on fresh daemon returned empty silently

Open visual-only bug noted but not yet fixed:
- M: snapshot --annotate places a stray ref label (e.g. @e8) at (0,0) for
  elements without visible bounding boxes / outside the interactive filter.
