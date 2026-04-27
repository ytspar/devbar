# AGENTS.md

## Project Overview

Monorepo containing three packages:

| Package | npm | Description |
|---------|-----|-------------|
| `@ytspar/devbar` | Published | Development toolbar — breakpoints, vitals, console, screenshots, accessibility, ruler |
| `@ytspar/sweetlink` | Published | AI debugging toolkit — CLI + WebSocket bridge for screenshots, DOM queries, JS execution |
| `@ytspar/playground` | Private | devbar.dev website — Vite SPA deployed to GitHub Pages |

## Common Commands

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (sweetlink → devbar → playground)
pnpm test                 # Run all tests (vitest)
pnpm test:watch           # Watch mode
pnpm test:coverage        # With coverage report
pnpm dev                  # Start playground dev server (http://localhost:5173)
pnpm lint                 # Biome lint check
pnpm lint:fix             # Biome auto-fix
```

## Workspace Protocol & Publishing

Both `devbar` and `sweetlink` are published to npm. The devbar package depends on sweetlink using `"@ytspar/sweetlink": "workspace:^"` in its package.json.

**Critical: Always use `pnpm publish` (not `npm publish`) for devbar.**

`pnpm publish` resolves `workspace:^` to the actual version (e.g., `^1.9.1`) in the published tarball. `npm publish` does NOT resolve workspace protocols, resulting in a broken package that consumers can't install.

### Publishing workflow

1. Bump the version in `packages/<pkg>/package.json`
2. Build: `pnpm build`
3. Run tests: `pnpm test`
4. Publish sweetlink first (if changed): `cd packages/sweetlink && pnpm publish --access public --no-git-checks`
5. Publish devbar second (depends on sweetlink): `cd packages/devbar && pnpm publish --access public --no-git-checks`
6. Commit version bumps, push to main

### Version bump checklist

- If sweetlink changed → bump sweetlink version
- If devbar changed → bump devbar version
- If sweetlink version bumped AND devbar depends on it → also bump devbar (so it picks up the new `workspace:^` resolution)
- **Update release notes** in `packages/playground/src/release-notes.json` for every new version (publishing will fail without this)

## devbar.dev Website Deployment

The playground package deploys to https://devbar.dev/ via GitHub Pages + GitHub Actions.

**Deployment is automatic on push to `main`.** The workflow (`.github/workflows/playground.yml`):
1. Builds all packages
2. Generates test coverage data
3. Builds the playground with Vite
4. Deploys to GitHub Pages

**GitHub Pages config:**
- Source: **GitHub Actions** (NOT branch-based / legacy)
- Custom domain: `devbar.dev` (CNAME in `packages/playground/public/CNAME`)

**If the site shows the raw README instead of the playground:**
The GitHub Pages source was changed back to "legacy" (branch-based). Fix it:
```bash
gh api repos/ytspar/devbar/pages -X PUT -f build_type=workflow
gh workflow run playground.yml
```

**Manual deployment trigger:**
```bash
gh workflow run playground.yml
```

## Architecture

```
packages/
├── devbar/          # Vanilla JS toolbar (no framework deps)
│   ├── src/
│   │   ├── GlobalDevBar.ts    # Main entry point
│   │   ├── constants.ts       # PALETTE colors, breakpoints, CSS
│   │   ├── settings.ts        # Settings persistence (localStorage + Sweetlink)
│   │   ├── modules/
│   │   │   ├── rendering/     # UI rendering (expanded, collapsed, compact, buttons)
│   │   │   ├── ruler.ts       # Ruler measurement tool
│   │   │   ├── screenshot.ts  # Screenshot capture
│   │   │   ├── performance.ts # Web Vitals collection
│   │   │   └── keyboard.ts    # Keyboard shortcuts
│   │   ├── accessibility.ts   # Accessibility audit (axe-core)
│   │   ├── network.ts         # Network request tracking
│   │   └── ui/                # Reusable UI primitives (icons, buttons, modals)
│   └── package.json
├── sweetlink/       # CLI + browser bridge
│   ├── src/
│   │   ├── cli/sweetlink.ts   # CLI entry point (screenshot, exec, query, logs, etc.)
│   │   ├── browser/           # Browser-side command handlers
│   │   │   └── commands/      # exec.ts, dom.ts, screenshot.ts, etc.
│   │   ├── server/            # WebSocket server + request handlers
│   │   ├── daemon/            # Persistent Playwright daemon (v2)
│   │   │   ├── types.ts       # DaemonState, DaemonAction, constants
│   │   │   ├── stateFile.ts   # State file I/O (scoped per app port)
│   │   │   ├── server.ts      # HTTP server with bearer auth (18 actions)
│   │   │   ├── browser.ts     # Persistent browser/page, headed mode
│   │   │   ├── client.ts      # CLI client for daemon communication
│   │   │   ├── index.ts       # Daemon entry point (forked process)
│   │   │   ├── refs.ts        # @ref system from accessibility tree
│   │   │   ├── diff.ts        # Snapshot diffing + annotated screenshots
│   │   │   ├── ringBuffer.ts  # Generic ring buffer (50K entries)
│   │   │   ├── listeners.ts   # Page event listeners → ring buffers
│   │   │   ├── cursor.ts      # Cursor highlight injection (addInitScript)
│   │   │   ├── devices.ts     # Named device presets for batch screenshots
│   │   │   ├── visualDiff.ts  # Byte-level screenshot comparison
│   │   │   ├── recording.ts   # Video recording via Chromium screencast
│   │   │   ├── session.ts     # Session manifest types
│   │   │   ├── viewer.ts      # Self-contained HTML viewer with video
│   │   │   └── evidence.ts    # PR evidence upload + terminal capture
│   │   └── types.ts           # Shared types
│   └── package.json
└── playground/      # devbar.dev website (Vite)
    ├── src/
    │   ├── main.ts
    │   ├── landing-content.ts # All page sections including releases
    │   └── style.css
    ├── public/CNAME           # Custom domain
    └── package.json
```

## Color Palette

All hardcoded colors should use the `PALETTE` constant from `packages/devbar/src/constants.ts`. Don't introduce new hex values — add them to PALETTE first.

## Testing

- Framework: Vitest with happy-dom environment
- 83 test files, ~2198 tests
- Tests are colocated with source files (e.g., `expanded.test.ts` next to `expanded.ts`)
- Mock pattern: `vi.mock('./module.js', () => ({ ... }))` — note `.js` extensions for ESM

## Git & Repository

- Repository: https://github.com/ytspar/devbar (redirects from ytspar/devtools)
- Main branch: `main` (not protected, direct push allowed)
- Pushes to main trigger the playground deployment workflow
