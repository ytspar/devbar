---
name: responsive-screenshots
description: "Capture screenshots at mobile/tablet/desktop breakpoints via Sweetlink. Triggers on: \"responsive screenshots\", \"test breakpoints\", \"check mobile/tablet/desktop\", \"viewport screenshots\". NOT for single screenshots (use screenshot) or Playwright-based design review (use design-review agent)."
allowed-tools: Bash
---

# Responsive Screenshots Skill

Capture screenshots at standard breakpoints to verify layouts adapt across mobile / tablet / desktop.

> Sweetlink architecture, prerequisites, daemon, viewport flags, and CDP setup are documented in [@ytspar/sweetlink's canonical context](../../claude-context/sweetlink-architecture.md). This skill assumes that context is loaded. The skill-specific scope is *which breakpoints to capture*, *what to look for at each*, and *the per-breakpoint quality checklist*.

## When to invoke (automatic)

- Implementing or modifying responsive layouts/components
- After any CSS/styling change touching grids, flex, type scale, or navigation
- Design reviews & QA
- User asks to "test responsive design", "check mobile/tablet/desktop", or names a breakpoint
- Before marking UI tasks complete
- Verifying Tailwind breakpoint behavior

## Standard breakpoints — what each tests

| Breakpoint | Width | Devices | Tailwind | What it surfaces |
|------------|-------|---------|----------|------------------|
| **Mobile** | 375px | iPhone SE, small phones | default (pre-`sm:`) | Mobile-first base styles, overflow, touch targets, cramped layouts |
| **Tablet** | 768px | iPad, tablets | `md:` | Intermediate layout, awkward grid columns, navbar transitions |
| **Desktop** | 1440px | Laptops, monitors | between `xl:` and `2xl:` | Full desktop, excessive whitespace, grid alignment |

Reference (Tailwind defaults): `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`. Our 375 / 768 / 1440 picks deliberately straddle below-`sm`, at-`md`, and between-`xl`-and-`2xl` to maximize coverage with three frames.

## Commands — call patterns

```bash
# One-shot at all three breakpoints (via daemon — single browser session)
pnpm sweetlink screenshot --responsive --url http://localhost:3000

# Manual per-breakpoint (fast path, fewer tokens)
pnpm sweetlink screenshot --viewport mobile  --output .tmp/screenshots/mobile.png
pnpm sweetlink screenshot --viewport tablet  --output .tmp/screenshots/tablet.png
pnpm sweetlink screenshot --viewport desktop --output .tmp/screenshots/desktop.png

# Component-scoped across breakpoints
pnpm sweetlink screenshot --viewport mobile  --selector ".hero" --output .tmp/screenshots/hero-mobile.png
pnpm sweetlink screenshot --viewport tablet  --selector ".hero" --output .tmp/screenshots/hero-tablet.png
pnpm sweetlink screenshot --viewport desktop --selector ".hero" --output .tmp/screenshots/hero-desktop.png

# Custom widths / orientation (require CDP)
pnpm sweetlink screenshot --viewport-width 320  --output .tmp/screenshots/small.png
pnpm sweetlink screenshot --viewport-width 1024 --viewport-height 768 --output .tmp/screenshots/tablet-landscape.png
pnpm sweetlink screenshot --viewport mobile --device-scale-factor 2 --output .tmp/screenshots/mobile-retina.png
```

`--responsive` (daemon) is the preferred one-shot. Per-breakpoint manual is fine when you want a subset or different selectors per frame. Full flag reference → canonical context.

## Per-breakpoint quality checklist

### Mobile (375px)

- Text readable (min 14px), no horizontal scroll, no overflow truncation
- Touch targets ≥ 48px
- Navigation accessible (hamburger or visible)
- Images scale (`w-full`, `max-w-*`)
- Forms usable; layout single-column or simple grid

### Tablet (768px)

- Layout adapts from mobile (not a stretched mobile view)
- Navigation in appropriate intermediate state
- 2–3 column grids effective; whitespace balanced
- Images sized for the breakpoint

### Desktop (1440px)

- Full desktop layout shown
- Content uses available space (max-width container if needed)
- 3–4 column grids align cleanly
- Navigation fully expanded, typography scaled, professional whitespace

## Common responsive failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Mobile text truncated / overflows | Fixed widths or missing `min-w-0` in flex | Switch to `w-full`, add `min-w-0` on flex children |
| Tablet looks worse than mobile **or** desktop | Missing `md:` overrides | Add explicit `md:` breakpoint styles |
| Desktop drowns in whitespace | No `max-w-*` container | Add `max-w-7xl mx-auto` or tighten grid |
| Mobile nav broken / overlapping | Desktop nav left visible | Hamburger menu or `hidden md:flex` swap |
| Images break layout | No responsive sizing | `w-full h-auto`, `object-cover`, set max-w |

## Composition with other skills

- **`screenshot`** — base skill; this one specializes for the breakpoint matrix.
- **`console-check-sweetlink`** — check console at each breakpoint (media queries can throw viewport-specific errors via `matchMedia` listeners).
- **`quick-typecheck`** — before iterating on responsive CSS, ensure types are clean.

Complete responsive workflow:

```bash
pnpm run typecheck
pnpm sweetlink screenshot --responsive --url http://localhost:3000   # all 3 frames
pnpm sweetlink logs --filter error                                   # console clean?
# Read each frame, iterate, re-run until all three viewports are correct
```

## Output expectations

Report screenshots grouped by breakpoint with a one-line verdict each, then an overall assessment:

```
📸 Responsive Design Review
- Mobile (375px):  .tmp/screenshots/mobile.png  — ✅ adapts; ⚠ nav slightly cramped
- Tablet (768px):  .tmp/screenshots/tablet.png  — ✅ 2-col grid works
- Desktop (1440px): .tmp/screenshots/desktop.png — ✅ 3-col grid, clean spacing
Overall: PASS with minor fix — increase mobile nav padding
```

## Troubleshooting (skill-scoped)

- **Layout doesn't change between viewports** — missing `md:` / `lg:` overrides or Tailwind config issue. Inspect the rendered classes.
- **Mobile shot shows desktop layout** — viewport emulation didn't apply; retry with `--force-cdp` or check Sweetlink connection.
- **Screenshots blurry** — fast path auto-optimizes to ~250KB; for pixel-perfect review use `--hifi` or `--force-cdp`.

Bridge / daemon / CDP issues → see the canonical context.
