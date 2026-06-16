---
name: screenshot
description: Take screenshots of running applications for visual verification. Use when implementing UI changes, debugging visual issues, or when the user asks to take a screenshot. Supports two methods - Sweetlink (preferred for dev servers) and Agent-Browser (fallback for any URL).
allowed-tools: Bash, Read
---

# Screenshot Skill

Take screenshots of running applications using the best available tool. Always saves to project-relative paths.

> Sweetlink architecture, prerequisites, components, CDP integration, the full CLI command surface, and configuration are documented in [@ytspar/sweetlink's canonical context](../../claude-context/sweetlink-architecture.md). This skill assumes that context is loaded. The skill-specific scope below is the *tool-choice decision*, *output-path policy*, and *call patterns* for the screenshot workflow only.

## Tool priority

1. **Sweetlink** — preferred for dev servers. Fast path (~131KB/~1k tokens) for html2canvas; persistent daemon (`--hifi`) for pixel-perfect / multi-step / SVG. Requires the SweetlinkBridge component.
2. **Agent-Browser** — fallback for any URL or AI-powered element selection (Stagehand). Installs via `npm install -g agent-browser` if missing.

**Playwright MCP is NOT available** (removed for token cost — ~15k vs Sweetlink's ~1k). Never call `mcp__playwright__*`. Never write raw Playwright/Puppeteer scripts as a workaround — use Agent-Browser.

## Output paths — non-negotiable

**NEVER save screenshots to `/tmp/` or any global path.** Always project-relative:

- `.tmp/screenshots/` — primary
- `.tmp/sweetlink-screenshots/` — legacy, also acceptable

Directories are created automatically.

## Token efficiency

- html2canvas screenshots: ~131KB (~1,000 tokens) — default, preferred
- CDP screenshots: ~2.0MB (~15,000 tokens) — only with `--force-cdp` when needed
- 15x token savings enables 10+ autonomous iterations per session

## Decision flow

```
Need screenshot or browser interaction?
    |
    |-> Known Sweetlink limitation? (see table below)
    |       --> YES: Skip to Agent-Browser directly
    |
    |-> Is dev server running with DevBar?
    |       |
    |       |-> YES: Use Sweetlink
    |       |       Fast path:  pnpm sweetlink screenshot --url <url> --output .tmp/screenshots/name.png
    |       |       HiFi path:  pnpm sweetlink screenshot --hifi --url <url> --output ...
    |       |
    |       |   <-- Sweetlink failed or produced wrong result?
    |       |       --> Fall back to Agent-Browser (NEVER write raw Playwright scripts)
    |       |
    |       --> NO: Use Agent-Browser
    |               agent-browser open [URL] / screenshot / close
    |
    --> Need complex multi-step form interactions?
            --> Sweetlink daemon (snapshot -i + fill @ref + click @ref) — preferred
                Agent-Browser if you need AI element selection
```

## Sweetlink — quick call patterns

```bash
# Fast path — full page
pnpm sweetlink screenshot --url http://localhost:3000 --output .tmp/screenshots/page.png

# Element only
pnpm sweetlink screenshot --selector "header" --output .tmp/screenshots/header.png

# Pixel-perfect (daemon, ~150ms after startup)
pnpm sweetlink screenshot --hifi --url http://localhost:3000 --output .tmp/screenshots/page.png

# Viewport (CDP)
pnpm sweetlink screenshot --viewport mobile --force-cdp --output .tmp/screenshots/mobile.png

# Hover state
pnpm sweetlink screenshot --selector "button" --hover --output .tmp/screenshots/hover.png

# Multi-step stateful session (daemon preserves browser state)
pnpm sweetlink snapshot -i --url http://localhost:3000      # get @refs
pnpm sweetlink click @e3
pnpm sweetlink fill @e5 "test@example.com"
pnpm sweetlink screenshot --hifi --output .tmp/screenshots/after.png
```

Full flag reference for `screenshot`, `snapshot`, `click`, `fill`, `daemon`, `console`, `record`, `proof`, etc. → see the canonical context above, or `pnpm sweetlink <cmd> --help`.

## Agent-Browser — quick call patterns

A live dashboard auto-opens at http://localhost:4848 on the first agent-browser command of a session (wired via PreToolUse hook). Mention the URL when starting an agent-browser flow so the user can watch.

```bash
agent-browser open http://localhost:3000
agent-browser snapshot                                       # @e1, @e2 refs
agent-browser screenshot .tmp/screenshots/page.png
agent-browser click @e7                                      # or click "Submit" by text
agent-browser type @e5 "search text"
agent-browser close
```

## Known Sweetlink limitations — use Agent-Browser instead

With the v2 daemon, most statefulness issues are resolved. These remain:

| Scenario | Why Sweetlink fast path fails | Recommended path |
|----------|-------------------------------|------------------|
| **Verifying SVG content** (colors, icons, shapes) | html2canvas does not render SVG | Sweetlink `--hifi` (daemon) — or Agent-Browser if hifi unavailable |
| **Non-dev-server URLs** | Sweetlink requires the bridge in the app | `agent-browser open <url>` |
| **AI-powered element selection** | Sweetlink uses CSS selectors or @refs | Agent-Browser (Stagehand AI) |

> **Self-updating rule:** When you encounter a NEW Sweetlink failure mode not listed above — a reason that would apply generally (not a transient network/server issue) — append a new row to this table before continuing with the fallback. Keeps the list exhaustive across sessions.

## Required pairing — every screenshot needs a console check

A screenshot alone does not verify a change. After every screenshot:

```bash
pnpm sweetlink logs --filter error
pnpm sweetlink logs --filter warning
```

A change is complete only when the screenshot is correct **and** the console is clean. See the `console-check-sweetlink` skill for the full console workflow.

## Tool choice cheat sheet

| Scenario | Tool | Notes |
|----------|------|-------|
| Dev-server page screenshot | Sweetlink (`--url`) | Fast path, preferred |
| Pixel-perfect / SVG | Sweetlink (`--hifi`) | Daemon, ~150ms |
| Responsive (3 breakpoints) | Sweetlink (`--responsive`) | Daemon; see `responsive-screenshots` skill |
| Click then screenshot same page | Sweetlink daemon (`click @ref` + `screenshot --hifi`) | State preserved |
| Multi-step form | Sweetlink daemon (`snapshot -i` + `fill @ref` + `click @ref`) | Refs simplify |
| Console logs | Sweetlink (`console --errors` / `logs --filter error`) | Ring buffer |
| Non-dev-server URL | Agent-Browser | Sweetlink requires bridge |
| AI element selection | Agent-Browser | Stagehand |

## Troubleshooting (skill-scoped)

- **"No browser client connected"** — dev server must be running with DevBar mounted and the page open in a browser tab. Look for the Sweetlink indicator (bottom-right).
- **`agent-browser` not found** — `npm install -g agent-browser`.
- **Screenshot path slipped to `/tmp/`** — stop, switch to `.tmp/screenshots/`, re-run.
- **File too large** — Sweetlink auto-optimizes to ~200–300KB; for Agent-Browser keep viewport reasonable, don't capture giant scrollable pages.

Setup / install / daemon-lifecycle / CDP-port issues → see the canonical context.
