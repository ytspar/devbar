# UI Verification Mandate

**CRITICAL**: Always confirm every UI change with screenshots before considering the task complete.

## Requirements

After implementing any visual/UI changes, you MUST:

1. **Take a screenshot** to verify the change renders correctly
2. **Compare before/after** when making layout or styling changes
3. **Verify at multiple viewports** for responsive design changes (mobile, tablet, desktop)

## Tools

### Sweetlink (Quick Verification)

```bash
# Basic screenshot
pnpm sweetlink screenshot --output .tmp/check.png

# Screenshot specific element
pnpm sweetlink screenshot --selector ".card" --output .tmp/card.png

# Screenshot at specific URL
pnpm sweetlink screenshot --url "http://localhost:3000/page" --output .tmp/page.png

# Check console for errors
pnpm sweetlink logs --filter error
```

### Playwright MCP (Complex Scenarios)

Use Playwright MCP tools (`mcp__playwright__*`) when you need:

- Browser interactions (click, type, hover)
- Multi-step verification flows
- Network request inspection
- Dialog handling

## Why This Matters

1. **Catches rendering bugs** - CSS/layout issues not visible in code
2. **Prevents regressions** - Ensures changes don't break existing UI
3. **Validates responsive behavior** - Layout at different breakpoints
4. **Confirms user expectations** - Visual proof implementation matches requirements

## Workflow

```
1. Implement UI change
2. Run dev server (if not running)
3. Take screenshot(s)
4. Review screenshot(s) - does it look correct?
5. If issues found → fix and repeat from step 3
6. If correct → task complete
```

## Common Viewport Sizes

| Breakpoint | Width | Use Case |
|------------|-------|----------|
| Mobile | 375px | Phone portrait |
| Tablet | 768px | iPad portrait |
| Desktop | 1280px | Laptop |
| Wide | 1920px | Desktop monitor |
