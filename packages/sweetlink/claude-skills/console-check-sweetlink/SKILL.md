---
name: console-check-sweetlink
description: "Check browser console for errors/warnings via Sweetlink WebSocket. Triggers on: \"console errors\", \"browser errors\", \"console check\", \"zero errors\". NOT for TypeScript/compile errors (use quick-typecheck) or server-side errors (use debugging agent)."
allowed-tools: Bash
---

# Console Check Sweetlink Skill

Fast browser-console verification using Sweetlink's real-time log capture. Enforces the **zero-error policy** before marking a task complete or committing.

> Sweetlink architecture, prerequisites, daemon ring buffer, and setup are documented in [@ytspar/sweetlink's canonical context](../../claude-context/sweetlink-architecture.md). This skill assumes that context is loaded. The skill-specific scope is *when to check the console*, *which filter to use*, and *how to interpret results*.

## When to invoke (automatic)

- After any code change (catch errors immediately)
- Before marking a task complete (zero-error policy)
- After every screenshot (pair with `screenshot` skill — visual + console)
- User reports unexpected behavior, asks to "check console", or mentions runtime bugs
- Before committing code; during code reviews

## Commands — call patterns

```bash
# Errors only (default check)
pnpm sweetlink logs --filter error

# Errors + warnings (stricter)
pnpm sweetlink logs --filter error && pnpm sweetlink logs --filter warning

# LLM-optimized summary (deduped JSON — best for analysis)
pnpm sweetlink logs --format summary

# Deduplicate noisy repeated messages (text mode)
pnpm sweetlink logs --dedupe

# Search for a specific term
pnpm sweetlink logs --filter "hydration"
pnpm sweetlink logs --filter "Failed to"
pnpm sweetlink logs --filter "MyComponent"

# Ring-buffer view from daemon (captured since daemon start)
pnpm sweetlink console --errors
pnpm sweetlink console --last 20
```

Full flag reference for `logs` / `console` → run `pnpm sweetlink <cmd> --help` (authoritative, always live).

## Zero-error policy

Before marking ANY task complete:

1. Run the error check.
2. If non-zero: fix immediately, re-check until clean.
3. Only then mark complete or commit.

A change with passing tests + a clean screenshot but console errors is **not done**.

## Common error categories and the typical fix shape

| Pattern | Example | Typical fix |
|---------|---------|-------------|
| **TypeError — null/undefined access** | `Cannot read property 'data' of undefined` | Optional chaining `user?.name`, default values |
| **ReferenceError** | `myVariable is not defined` | Missing import, typo, scope issue |
| **Hydration mismatch** (SSR) | `Hydration failed because the initial UI does not match` | Move client-only values into `useEffect`; check date/random/locale in render |
| **Network failure** | `Failed to fetch` | Add `.catch()`, check endpoint, CORS |
| **React: missing key** | `Each child in a list should have a unique "key" prop` | Add stable `key` on mapped JSX |
| **React: update loop** | `Maximum update depth exceeded` | Effect-loop — fix dependency array or setState in render |

## Output expectations

**Clean state (target):**

```
✅ Console Check: CLEAN — Errors: 0, Warnings: 0 → ready for commit
```

**With findings — report shape:**

```
❌ Console Check: ERRORS FOUND — Errors: N, Warnings: M

Errors:
1. [ERROR] <message> — <file>:<line> — <timestamp>
   ...
Recommendation: <one line per finding>
```

Always group findings, cite source location when surfaced, and propose the fix.

## Composition with other skills

- **`screenshot`** — every screenshot pairs with `logs --filter error` and `--filter warning`. Visual + console = verification.
- **`quick-typecheck`** — compile-time errors. Combine: `pnpm run typecheck && pnpm sweetlink logs --filter error`.
- **`responsive-screenshots`** — check console at each viewport (errors can be viewport-specific via media queries / matchMedia).

Complete quality gate:

```bash
pnpm run typecheck                                            # 1. types
pnpm sweetlink logs --filter error                            # 2. runtime
pnpm sweetlink screenshot --output .tmp/screenshots/check.png # 3. visual
```

## Troubleshooting (skill-scoped)

- **"No browser client connected"** — start dev server, open the URL, confirm Sweetlink indicator (bottom-right) before re-running.
- **Old errors persist after a fix** — hard refresh the browser tab (`Cmd+Shift+R` mac / `Ctrl+Shift+R` win/linux) to clear stale state.
- **Too many logs to read** — switch to `--format summary` (deduped JSON) or narrow with `--filter <term>`.

Daemon-not-running / bridge-not-mounted / port-conflict → see the canonical context.
