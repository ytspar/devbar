# @ytspar/playground

Development playground for testing and demonstrating devbar and sweetlink features.

## Getting Started

```bash
# From the monorepo root
pnpm dev

# Or directly
pnpm --filter playground dev
```

The dev server starts at `http://localhost:5173`.

## What It Demonstrates

- **DevBar toolbar** -- breakpoint indicator, performance metrics, console badges, screenshot capture
- **Console capture** -- log, warn, error, and info buttons to test console interception
- **Sweetlink bridge** -- WebSocket connection to the sweetlink development server
- **AI design review** -- send screenshots to Claude for design feedback
- **Document outline** -- heading structure extraction and export
- **Page schema** -- JSON-LD, Open Graph, and meta tag inspection

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview production build |
