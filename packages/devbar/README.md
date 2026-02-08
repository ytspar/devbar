# @ytspar/devbar

[![npm](https://img.shields.io/npm/v/@ytspar/devbar)](https://www.npmjs.com/package/@ytspar/devbar)

Development toolbar with Sweetlink integration for browser-based development tools.

## Features

- **Breakpoint indicator**: Shows current Tailwind breakpoint and viewport dimensions
- **Performance metrics**: FCP, LCP, and total page size
- **Console badges**: Error and warning counts with click-to-view logs
- **Screenshot capture**: Save to file or copy to clipboard
- **AI Design Review**: Send screenshots to Claude for design analysis
- **Document Outline**: View and export page heading structure
- **Page Schema**: View JSON-LD, Open Graph, and meta tag data
- **Sweetlink integration**: Real-time connection to dev server

## Requirements

This package is **ESM-only**. It requires `"type": "module"` in your `package.json` or an ESM-capable bundler (Vite, webpack, esbuild, etc.).

## Installation

```bash
pnpm add @ytspar/devbar

# Or install canary (latest from main)
pnpm add @ytspar/devbar@canary
```

## Usage

### Basic Setup (Vanilla JS)

```typescript
import { initGlobalDevBar } from '@ytspar/devbar';

// Initialize with default options
initGlobalDevBar();

// Or with custom options
initGlobalDevBar({
  position: 'bottom-left',
  accentColor: '#10b981',
});
```

### In a Vite/React Project

```typescript
// main.ts or App.tsx
if (import.meta.env.DEV) {
  import('@ytspar/devbar').then(({ initGlobalDevBar }) => {
    initGlobalDevBar({
      position: 'bottom-center',
      showTooltips: true,
    });
  });
}
```

### Positions

The devbar can be placed in five positions:

| Position | Description |
|----------|-------------|
| `bottom-left` | Bottom left corner (default) - leaves room for other dev tools on the right |
| `bottom-right` | Bottom right corner |
| `top-left` | Top left corner |
| `top-right` | Top right corner |
| `bottom-center` | Centered at bottom - ideal for focused development, responsive at mobile sizes |

```typescript
// Example: Center the devbar at the bottom
initGlobalDevBar({ position: 'bottom-center' });
```

On mobile viewports (`<640px`), all positions automatically center and the action buttons wrap to a second row.

### Configuration Options

```typescript
interface GlobalDevBarOptions {
  /** Position of the devbar. Default: 'bottom-left' */
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-center';

  /** Primary accent color (CSS color). Default: '#10b981' (emerald) */
  accentColor?: string;

  /** Which metrics to show. Default: all enabled */
  showMetrics?: {
    breakpoint?: boolean;  // Tailwind breakpoint indicator
    fcp?: boolean;         // First Contentful Paint
    lcp?: boolean;         // Largest Contentful Paint
    pageSize?: boolean;    // Total transfer size
  };

  /** Whether to show the screenshot button. Default: true */
  showScreenshot?: boolean;

  /** Whether to show console error/warning badges. Default: true */
  showConsoleBadges?: boolean;

  /** Whether to show tooltips on hover. Default: true */
  showTooltips?: boolean;

  /** Size overrides for special layouts */
  sizeOverrides?: {
    width?: string;
    maxWidth?: string;
    minWidth?: string;
  };
}
```

### Example: Minimal DevBar

```typescript
initGlobalDevBar({
  showMetrics: {
    breakpoint: true,
    fcp: false,
    lcp: false,
    pageSize: false,
  },
  showScreenshot: false,
  showConsoleBadges: true,
  showTooltips: false,  // Disable tooltips
});
```

### Custom Controls

Register custom buttons that appear in the devbar:

```typescript
import { GlobalDevBar } from '@ytspar/devbar';

// Register a custom control
GlobalDevBar.registerControl({
  id: 'my-control',
  label: 'Reset State',
  onClick: () => {
    localStorage.clear();
    location.reload();
  },
  variant: 'warning',  // 'default' | 'warning'
});

// Unregister when done
GlobalDevBar.unregisterControl('my-control');
```

### Cleanup

```typescript
import { destroyGlobalDevBar } from '@ytspar/devbar';

// Remove the devbar and cleanup listeners
destroyGlobalDevBar();
```

## Keyboard Shortcuts

- `Cmd/Ctrl + Shift + S`: Save screenshot to file
- `Cmd/Ctrl + Shift + C`: Copy screenshot to clipboard
- `Escape`: Close any open modal/popup

## Integration with Sweetlink

The devbar automatically connects to the Sweetlink WebSocket server (port 9223) for:

- Screenshot saving to the project directory
- AI-powered design review via Claude
- Document outline and schema export

When Sweetlink is not running, the devbar still functions but file-saving features are disabled.

## Early Console Capture

Console logs are captured from the moment the devbar module loads, before your app initializes. This catches:

- All `console.log/error/warn/info` calls
- Errors that occur during hydration
- Early initialization issues

## Dependencies

- `html2canvas-pro` - Screenshot capture

## License

MIT
