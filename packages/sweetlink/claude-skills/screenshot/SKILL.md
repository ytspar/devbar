---
name: screenshot
description: Take screenshots of running applications for visual verification. Use when implementing UI changes, debugging visual issues, or when the user asks to take a screenshot. Supports two methods - Sweetlink (preferred for dev servers) and Agent-Browser (fallback for any URL).
allowed-tools: Bash, Read
---

# Screenshot Skill

Take screenshots of running applications using the best available tool. Always saves to project-relative paths.

## What is Sweetlink?

Sweetlink (`@ytspar/sweetlink`) is a WebSocket-based bridge that enables Claude to autonomously interact with a running web application. It connects a CLI tool to the browser via WebSocket, allowing screenshots, DOM inspection, console log capture, JavaScript execution, and network monitoring - all without human intervention.

**Package**: `@ytspar/sweetlink` — [Full README](node_modules/@ytspar/sweetlink/README.md)

### Architecture

```
CLI (pnpm sweetlink)
  |
  ├─ Fast path (WebSocket) ──> Browser (SweetlinkBridge) ──> html2canvas
  |     screenshot, logs, exec, query, click, refresh
  |
  └─ HiFi path (HTTP) ──> Daemon (persistent Playwright) ──> Headless Chromium
        screenshot --hifi, --responsive, snapshot, click @ref, fill @ref,
        console, network --failed, record, proof
```

The daemon auto-starts on first `--hifi`/`snapshot` command and auto-stops after 30min idle. State file at `.sweetlink/daemon-{port}.json` (scoped per app port for multi-instance support).

### Prerequisites

For Sweetlink to work, the target app must:

1. Have `@ytspar/sweetlink` installed
2. Initialize the bridge (Vite plugin, `@ytspar/sweetlink/auto`, or `initSweetlinkBridge()`)
3. Initialize the WebSocket server in the dev server entry (`initSweetlink({ port: 9223 })`)
4. Be open in a browser (the browser tab is the execution context)

### Token Efficiency

- **html2canvas screenshots**: ~131KB (~1,000 tokens) — default, preferred
- **CDP screenshots**: ~2.0MB (~15,000 tokens) — use only when needed (`--force-cdp`)

This 15x token savings enables 10+ autonomous iterations per session.

## Tool Priority

1. **Sweetlink** (preferred for dev servers) - Fast, lightweight, token-efficient. Handles screenshots, page navigation (`--url`), scrolling, clicking, DOM queries, console logs, JS execution. Works with dev servers that have the SweetlinkBridge component.
2. **Agent-Browser** (fallback) - Works with any URL, installs automatically if missing. Use only when Sweetlink is unavailable or for complex multi-step form interactions.

**Playwright MCP is NOT available.** It has been removed from the project config due to excessive token usage (~15,000 tokens per screenshot vs Sweetlink's ~1,000). Never attempt to use `mcp__playwright__*` tools.

**NEVER write raw Playwright/Puppeteer scripts** (e.g., `node -e "require('playwright')..."`) as a workaround. If Sweetlink can't handle a task, use Agent-Browser — that's what it's for.

## CRITICAL: Output Paths

**NEVER save screenshots to `/tmp/` or any global path.**

Always use project-relative paths:

```
.tmp/screenshots/           # Primary location
.tmp/sweetlink-screenshots/ # Legacy sweetlink location (also acceptable)
```

The directory will be created automatically if it doesn't exist.

## Quick Reference

### Sweetlink (Development Servers)

```bash
# Full page screenshot
pnpm sweetlink screenshot --output .tmp/screenshots/page.png

# Specific element
pnpm sweetlink screenshot --selector "header" --output .tmp/screenshots/header.png

# With viewport emulation
pnpm sweetlink screenshot --viewport mobile --force-cdp --output .tmp/screenshots/mobile.png
```

### Agent-Browser (Any URL)

A live observability dashboard auto-opens at http://localhost:4848 on the user's first agent-browser command of a session (wired via PreToolUse hook in `~/.claude/settings.json`). Mention the URL when you start an agent-browser flow so the user can watch along.

```bash
# Open page and screenshot
agent-browser open http://localhost:3000
agent-browser screenshot .tmp/screenshots/page.png
agent-browser close

# With interactions
agent-browser open http://localhost:3000
agent-browser snapshot                    # Get element refs (@e1, @e2, etc.)
agent-browser click @e7                   # Click element
agent-browser screenshot .tmp/screenshots/after-click.png
agent-browser close
```

## Decision Flow

```
Need screenshot or browser interaction?
    |
    |-> Known Sweetlink limitation? (see list below)
    |       |
    |       --> YES: Skip to Agent-Browser directly
    |
    |-> Is dev server running with DevBar?
    |       |
    |       |-> YES: Use Sweetlink (single-command operations only)
    |       |       Screenshots:  pnpm sweetlink screenshot --url <url> --output .tmp/screenshots/name.png
    |       |       DOM query:    pnpm sweetlink query --selector ".component"
    |       |       Console:      pnpm sweetlink logs --filter error
    |       |
    |       |   <-- Sweetlink failed or produced wrong result?
    |       |       --> Fall back to Agent-Browser (NEVER write raw Playwright scripts)
    |       |
    |       --> NO: Use Agent-Browser
    |               agent-browser open [URL]
    |               agent-browser screenshot .tmp/screenshots/name.png
    |               agent-browser close
    |
    --> Need complex multi-step form interactions (type + submit + wait)?
            |
            --> Use Agent-Browser (better for sequential multi-step flows)
```

### Sweetlink v2 Daemon — Persistent Browser (Preferred for Multi-Step)

Sweetlink v2 adds a persistent Playwright daemon that keeps a browser alive between commands, solving the statefulness problem. **Use daemon mode for multi-step workflows instead of Agent-Browser.**

```bash
# Pixel-perfect screenshot via persistent daemon (~150ms)
pnpm sweetlink screenshot --hifi --url http://localhost:3000 --output .tmp/screenshots/page.png

# Responsive screenshots at 3 breakpoints
pnpm sweetlink screenshot --responsive --url http://localhost:3000

# Get interactive element refs
pnpm sweetlink snapshot -i --url http://localhost:3000

# Click/fill by ref (stateful — same browser session!)
pnpm sweetlink click @e3
pnpm sweetlink fill @e5 "test@example.com"

# Take screenshot after interaction (same browser, state preserved)
pnpm sweetlink screenshot --hifi --output .tmp/screenshots/after-click.png

# Check console errors (ring buffer — captured since daemon start)
pnpm sweetlink console --errors

# Diff accessibility tree after actions
pnpm sweetlink snapshot -D

# Annotated screenshot with ref labels
pnpm sweetlink snapshot -a -o .tmp/screenshots/annotated.png

# Stop daemon when done (or it auto-stops after 30min idle)
pnpm sweetlink daemon stop
```

### Known Sweetlink Limitations — Use Agent-Browser Instead

With the v2 daemon, most statefulness issues are resolved. These remain:

| Scenario | Why Sweetlink fails | Agent-Browser approach |
|----------|--------------------|-----------------------|
| **Verifying SVG content** (colors, icons, shapes) | html2canvas (fast path) does not render SVG elements — use `--hifi` or `--force-cdp` instead | Use Sweetlink with `--hifi`, or `agent-browser open` -> `screenshot` |
| **Non-dev-server URLs** | Sweetlink requires the app to have the bridge installed | `agent-browser open` any URL |
| **AI-powered element selection** | Sweetlink uses CSS selectors or @refs | Agent-Browser has Stagehand AI selection |

> **Self-updating rule:** When you encounter a NEW Sweetlink failure mode not listed above — i.e., you try Sweetlink, it fails or produces incorrect results for a reason that would apply generally (not a transient network/server issue) — you MUST append a new row to this table before continuing with the Agent-Browser fallback. This keeps the list exhaustive and prevents future sessions from repeating the same mistake.

## Installing Agent-Browser

If `agent-browser` is not found:

```bash
npm install -g agent-browser
```

## Sweetlink CLI Reference

All commands use `pnpm sweetlink <command> [options]`.

### screenshot — Capture page or element screenshots

| Option | Description |
|--------|-------------|
| `--output <path>` | Output file path (default: auto-generated in `.tmp/sweetlink-screenshots/`) |
| `--url <url>` | Navigate to a specific URL before taking the screenshot. **Use this to target specific pages.** |
| `--selector <css>` | CSS selector to screenshot a specific element |
| `--full-page` | Capture full scrollable page |
| `--viewport <size>` | Emulate viewport: `mobile`, `tablet` (requires `--force-cdp`) |
| `--hover` | Capture hover state (requires `--selector`) |
| `--force-cdp` | Force Chrome DevTools Protocol method (higher quality, more tokens) |
| `--hifi` | Pixel-perfect via persistent Playwright daemon (~150ms after startup) |
| `--responsive` | Screenshots at 3 breakpoints (375/768/1280px) via daemon |

```bash
pnpm sweetlink screenshot --output .tmp/screenshots/full.png
pnpm sweetlink screenshot --url http://localhost:3000/blog --output .tmp/screenshots/blog.png
pnpm sweetlink screenshot --selector ".card" --output .tmp/screenshots/card.png
pnpm sweetlink screenshot --viewport mobile --force-cdp --output .tmp/screenshots/mobile.png
pnpm sweetlink screenshot --selector "button" --hover --output .tmp/screenshots/hover.png
```

### logs — Capture browser console output

| Option | Description |
|--------|-------------|
| `--filter <level>` | Filter by level: `error`, `warning`, `log` |
| `--format <fmt>` | Output format: `text` (default), `json`, `summary` (LLM-optimized, deduplicated) |
| `--dedupe` | Deduplicate repeated messages in text format |
| `--output <path>` | Save output to file |

```bash
pnpm sweetlink logs                           # All logs
pnpm sweetlink logs --filter error            # Only errors
pnpm sweetlink logs --format summary          # LLM-optimized JSON with deduplication
pnpm sweetlink logs --dedupe                  # Remove duplicate messages
```

### query — Inspect DOM elements

| Option | Description |
|--------|-------------|
| `--selector <css>` | CSS selector to query |
| `--property <prop>` | Specific property to return (e.g., `offsetWidth`, `innerText`, `disabled`) |
| `--url <url>` | Navigate browser to URL before querying |

```bash
pnpm sweetlink query --selector ".card"
pnpm sweetlink query --selector "button" --property "disabled"
pnpm sweetlink query --selector "h1" --url "http://localhost:3000/about"
```

### click — Click elements in the browser

| Option | Description |
|--------|-------------|
| `--selector <css>` | CSS selector of element to click |
| `--text <string>` | Click element matching text content |

```bash
pnpm sweetlink click --selector "button.submit"
pnpm sweetlink click --text "Submit"
pnpm sweetlink click --selector "th" --text "Rank"
```

### exec — Execute JavaScript in browser context

| Option | Description |
|--------|-------------|
| `--code <js>` | JavaScript expression to evaluate |
| `--url <url>` | Navigate browser to URL before executing |

```bash
pnpm sweetlink exec --code "document.title"
pnpm sweetlink exec --code "document.querySelectorAll('.card').length"
pnpm sweetlink exec --code "document.title" --url "http://localhost:3000/about"
```

### refresh — Reload the browser page

| Option | Description |
|--------|-------------|
| `--hard` | Hard refresh (clear cache and reload) |

```bash
pnpm sweetlink refresh                # Soft refresh
pnpm sweetlink refresh --hard         # Hard refresh (clear cache)
```

### network — Monitor network requests (CDP required)

| Option | Description |
|--------|-------------|
| `--filter <pattern>` | Filter requests by URL pattern |

```bash
pnpm sweetlink network                       # All requests
pnpm sweetlink network --filter "/api/"      # Filter by URL pattern
```

### snapshot — Accessibility tree with @refs (daemon)

| Option | Description |
|--------|-------------|
| `-i`, `--interactive` | Show only interactive elements with @e refs |
| `-D`, `--diff` | Diff against previous snapshot |
| `-a`, `--annotate` | Annotated screenshot with ref labels |
| `-o <path>` | Output path for annotated screenshot |

```bash
pnpm sweetlink snapshot -i --url http://localhost:3000
pnpm sweetlink snapshot -D
pnpm sweetlink snapshot -a -o .tmp/screenshots/annotated.png
```

### click — Click elements (supports @refs)

```bash
pnpm sweetlink click @e3                            # Click by ref (daemon)
pnpm sweetlink click --selector "button.submit"     # Click by CSS selector (WS)
```

### fill — Fill inputs by @ref (daemon)

```bash
pnpm sweetlink fill @e5 "user@example.com"
```

### console — Console messages from ring buffer (daemon)

| Option | Description |
|--------|-------------|
| `--errors` | Show only errors |
| `--last <n>` | Show only last N entries |

```bash
pnpm sweetlink console --errors
pnpm sweetlink console --last 20
```

### network --failed — Failed requests from ring buffer (daemon)

```bash
pnpm sweetlink network --failed
```

### record — Session recording (daemon)

```bash
pnpm sweetlink record start
pnpm sweetlink record stop         # Generates viewer.html
pnpm sweetlink record status
```

### daemon — Daemon lifecycle

```bash
pnpm sweetlink daemon status
pnpm sweetlink daemon start --url http://localhost:3000
pnpm sweetlink daemon start --url http://localhost:3000 --headed  # visible browser
pnpm sweetlink daemon stop
```

### proof — Upload session evidence to GitHub PR

```bash
pnpm sweetlink proof --pr 123
pnpm sweetlink proof --pr 123 --repo owner/repo
```

### Other useful commands

```bash
pnpm sweetlink wait --url http://localhost:3000   # Wait for server ready
pnpm sweetlink status                              # Check server health
pnpm sweetlink vitals                               # Get Web Vitals
pnpm sweetlink a11y                                 # Accessibility audit
pnpm sweetlink schema                               # Page schema (meta, OG, JSON-LD)
pnpm sweetlink outline                              # Document heading structure
pnpm sweetlink cleanup --force                      # Clean up Sweetlink processes
```

## Agent-Browser Commands

### Basic Usage

```bash
agent-browser open http://localhost:3000     # Open URL
agent-browser snapshot                        # Get element refs
agent-browser screenshot .tmp/screenshots/page.png  # Screenshot
agent-browser close                           # Close browser
```

### Interactions

```bash
agent-browser click @e7                       # Click by ref
agent-browser click "Submit"                  # Click by text
agent-browser type @e5 "search text"          # Type into input
agent-browser press Enter                     # Press key
agent-browser scroll down                     # Scroll
```

### Navigation

```bash
agent-browser open http://localhost:3000/about
agent-browser navigate http://localhost:3000/
agent-browser back
agent-browser forward
```

## Workflow Examples

### Visual Verification After Code Changes

**Every screenshot must be paired with a console check.** Do not consider a change complete until both the screenshot looks correct AND the console is clean.

```bash
# 1. Take screenshot
pnpm sweetlink screenshot --url http://localhost:3000/page --output .tmp/screenshots/after.png

# 2. ALWAYS check console errors and warnings alongside the screenshot
pnpm sweetlink logs --filter error
pnpm sweetlink logs --filter warning

# 3. Fix any issues found in screenshot or console, then re-verify
```

### Multi-Page Screenshot Session

```bash
# Using Agent-Browser for reliable navigation
agent-browser open http://localhost:3000

# Homepage
agent-browser screenshot .tmp/screenshots/homepage.png

# Navigate to another page
agent-browser click "About"
agent-browser screenshot .tmp/screenshots/about.png

# Navigate to a section
agent-browser click "Features"
agent-browser screenshot .tmp/screenshots/features.png

agent-browser close
```

### Debug Workflow

```bash
# 1. Check console errors
pnpm sweetlink logs --filter error

# 2. Take screenshot of problem area
pnpm sweetlink screenshot --selector ".broken-component" --output .tmp/screenshots/bug.png

# 3. Query DOM state
pnpm sweetlink query --selector ".broken-component"

# 4. Fix code...

# 5. Verify fix
pnpm sweetlink logs --filter error
pnpm sweetlink screenshot --selector ".fixed-component" --output .tmp/screenshots/fixed.png
```

## When to Use Each Tool

| Scenario | Tool | Notes |
|----------|------|-------|
| Screenshot of dev server page | Sweetlink (`--url`) | Fast path, preferred |
| Pixel-perfect screenshot | Sweetlink (`--hifi`) | Persistent daemon, ~150ms |
| Responsive screenshots | Sweetlink (`--responsive`) | 3 breakpoints via daemon |
| Click then screenshot same page | Sweetlink daemon (`click @ref` + `screenshot --hifi`) | Daemon preserves state |
| Multi-step form interactions | Sweetlink daemon (`snapshot -i` + `fill @ref` + `click @ref`) | Refs make this easy |
| Check console logs | Sweetlink (`console --errors`) | Ring buffer, always-on |
| DOM queries | Sweetlink (`query`) | |
| Navigate to specific page | Sweetlink (`--url` flag) | |
| Verifying SVG content (icons, colors) | Sweetlink (`--hifi`) | Daemon renders SVGs correctly |
| Viewport testing (mobile/tablet) | Sweetlink (`--responsive` or `--hifi --viewport`) | |
| Non-dev-server URL | Agent-Browser | Sweetlink requires bridge |
| AI-powered element selection | Agent-Browser | Stagehand AI |

## Troubleshooting

### Sweetlink: "No browser client connected"

The dev server needs DevBar and a browser connected:

1. Ensure dev server is running: `pnpm run dev`
2. Open the URL in browser
3. Look for Sweetlink indicator (bottom-right)

### Agent-Browser: Command not found

Install globally:

```bash
npm install -g agent-browser
```

### Screenshots saved to wrong location

**ALWAYS** use `.tmp/screenshots/` path. If you accidentally use `/tmp/`:

1. Stop and correct the path
2. Use `.tmp/screenshots/` instead
3. The skill should NEVER accept `/tmp/` paths

### Large screenshot files

Sweetlink auto-optimizes to ~200-300KB. For Agent-Browser:

- Screenshots are PNG by default
- Keep viewport reasonable (don't screenshot giant pages)
