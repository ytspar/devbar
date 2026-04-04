# Sweetlink Architecture - Autonomous Development Bridge

## Overview

Sweetlink is a websocket-based bridge that enables LLM agents (like Claude) to autonomously interact with a running web application for debugging, development, and visual verification.

**Key Innovation**: Instead of relying on MCP screenshot tools (which are token-heavy and often don't fit in context), sweetlink provides a lightweight CLI that connects directly to the running webapp via websockets.

**Inspired by**: [Peter Steinberger's sweetlink implementation](https://x.com/steipete/status/1981998733736001727) which enables agents to "debug everything completely autonomous e2e."

## Core Architecture

```
┌─────────────────┐         WebSocket         ┌──────────────────┐
│   CLI Tool      │◄──────────────────────────►│  Webapp (Remix)  │
│  (sweetlink)    │     ws://localhost:9223    │   Dev Server     │
└─────────────────┘                            └──────────────────┘
        │                                              │
        │                                              │
        │ CDP Connection                               │ Client Bridge
        │ http://127.0.0.1:9222                       │
        │                                              │
        ▼                                              ▼
┌─────────────────┐                            ┌──────────────────┐
│ Chrome DevTools │                            │  Browser Client  │
│   Protocol      │                            │  (html2canvas)   │
└─────────────────┘                            └──────────────────┘
```

## Components

### 1. WebSocket Server (Remix Dev Server)

**Location**: Embedded in Remix development server
**Port**: 9223 (configurable)
**Purpose**: Accept commands from CLI and route to browser client

**Commands**:

- `screenshot` - Capture screenshot of current page or specific element
- `query-dom` - Query DOM elements and return data
- `get-logs` - Retrieve console logs from browser
- `exec-js` - Execute arbitrary JavaScript in browser context
- `get-network` - Get network request data

**Response Format**:

```typescript
interface CommandResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}
```

### 2. CLI Tool (`tools/sweetlink.ts`)

**Purpose**: Command-line interface for sending commands to webapp
**Auto-Detection**: Checks for Chrome DevTools Protocol at http://127.0.0.1:9222

**Command Priority**:

1. **CDP Available**: Use Puppeteer to connect directly to Chrome via CDP
2. **CDP Unavailable**: Fall back to websocket command to browser client

**Commands**:

```bash
# Screenshot entire page
pnpm sweetlink screenshot --no-wait

# Screenshot specific element
pnpm sweetlink screenshot --no-wait --selector ".company-card"

# Query DOM
pnpm sweetlink query --selector "h1" --property "innerText"

# Get console logs
pnpm sweetlink logs

# Execute JavaScript
pnpm sweetlink exec --code "document.title"

# Get network requests
pnpm sweetlink network --filter "api"
```

**CDP Detection Logic**:

```typescript
async function detectCDP(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:9222/json/version');
    return response.ok;
  } catch {
    return false;
  }
}
```

### 3. Browser Client Bridge (DevToolbar Extension)

**Location**: `app/components/dev/SweetlinkBridge.tsx`
**Purpose**: Receive websocket commands and execute in browser

**Capabilities**:

- Take screenshots using html2canvas
- Query DOM elements
- Capture console logs
- Execute JavaScript
- Return network request data

**Implementation**:

```typescript
// Connect to websocket server
const ws = new WebSocket('ws://localhost:9223');

ws.onmessage = async (event) => {
  const command = JSON.parse(event.data);

  switch (command.type) {
    case 'screenshot':
      const screenshot = await html2canvas(document.body);
      ws.send(JSON.stringify({
        success: true,
        data: screenshot.toDataURL()
      }));
      break;
    // ... other commands
  }
};
```

### 4. CDP Integration (`tools/sweetlink-cdp.ts`)

**Purpose**: Use Chrome DevTools Protocol for more reliable screenshots and debugging

**When to Use**:

- Chrome launched with `--remote-debugging-port=9222`
- More reliable than html2canvas
- Can capture full page, specific viewports
- Access to network tab, console, performance data

**Starting Chrome with CDP**:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
```

**Puppeteer Usage**:

```typescript
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222'
});

const pages = await browser.pages();
const page = pages.find(p => p.url().includes('localhost:3000'));

// Take screenshot
const screenshot = await page.screenshot({
  fullPage: true,
  type: 'png'
});
```

## Advantages Over MCP Screenshot Tools

### 1. Token Efficiency

- **MCP Tools**: Large accessibility tree snapshots, verbose element descriptions
- **Sweetlink**: Compact JSON responses, base64 images, structured data

### 2. Autonomous Looping

- Agent can repeatedly take screenshots and adjust code until design is correct
- No manual intervention required
- Faster iteration cycles

### 3. Rich Data Access

- Console logs with stack traces
- Network request/response data
- DOM query results
- Performance metrics (via CDP)

### 4. No External Dependencies

- No separate MCP server process
- Embedded in development workflow
- Works with existing dev server

## Implementation Plan

### Phase 1: WebSocket Server

1. Add websocket upgrade handler to Remix dev server
2. Implement command routing
3. Add basic health check endpoint

### Phase 2: CLI Tool

1. Create `tools/sweetlink.ts` with command structure
2. Implement CDP auto-detection
3. Add screenshot command with CDP fallback
4. Add DOM query and logs commands

### Phase 3: Browser Bridge

1. Create `SweetlinkBridge.tsx` component
2. Add to DevToolbar
3. Implement screenshot capture (html2canvas)
4. Implement console log collection
5. Implement DOM querying

### Phase 4: CDP Integration

1. Create `tools/sweetlink-cdp.ts` helper
2. Implement Puppeteer connection
3. Add full-page screenshot capability
4. Add network request inspection

### Phase 5: Documentation & Testing

1. Create usage guide
2. Add examples for common scenarios
3. Test with visual development agent
4. Document Chrome CDP setup

## Usage Examples

### Example 1: Autonomous Card Layout Debugging

```bash
# Claude agent workflow:
# 1. Make changes to card component
# 2. Take screenshot to verify
pnpm sweetlink screenshot --no-wait --output ".tmp/screenshots/card-layout.png"

# 3. Check console for errors
pnpm sweetlink logs --filter "error"

# 4. If issues, query DOM to inspect card structure
pnpm sweetlink query --selector ".card" --count

# 5. Repeat until layout is correct
```

### Example 2: Network Request Debugging

```bash
# Check API responses
pnpm sweetlink network --filter "/api/companies"

# Get specific request details
pnpm sweetlink network --url "/api/companies/123" --details
```

### Example 3: Performance Analysis

```bash
# Get console performance metrics
pnpm sweetlink logs --filter "performance"

# Take screenshot with timing overlay
pnpm sweetlink screenshot --no-wait --performance-overlay
```

## Dependencies

### Required npm packages

```json
{
  "ws": "^8.18.0",                    // WebSocket server
  "html2canvas": "^1.4.1",           // Browser screenshots
  "puppeteer-core": "^23.10.4",      // CDP integration
  "@types/ws": "^8.5.13"             // TypeScript types
}
```

### Optional (for enhanced features)

```json
{
  "sharp": "^0.33.5",                // Image optimization
  "pixelmatch": "^6.0.0"             // Screenshot diffing
}
```

## Configuration

### `.env` additions

```bash
# Sweetlink WebSocket port
SWEETLINK_WS_PORT=9223

# Chrome DevTools Protocol port
CHROME_CDP_PORT=9222

# Enable/disable sweetlink in development
ENABLE_SWEETLINK=true
```

### Remix server integration

```typescript
// server.ts or vite.config.ts
if (process.env.NODE_ENV === 'development' && process.env.ENABLE_SWEETLINK === 'true') {
  const { initSweetlink } = await import('./tools/sweetlink-server');
  await initSweetlink({ port: process.env.SWEETLINK_WS_PORT || 9223 });
}
```

## Security Considerations

1. **Development Only**: Never enable in production
2. **Localhost Binding**: WebSocket server only binds to 127.0.0.1
3. **No Authentication**: Assumes trusted local environment
4. **Command Validation**: Sanitize and validate all commands
5. **Execution Limits**: Rate limiting on expensive operations

## Future Enhancements

1. **Screenshot Diffing**: Compare before/after changes automatically
2. **Video Recording**: Record interaction sessions
3. **Performance Profiling**: CPU, memory, network waterfalls
4. **Accessibility Audits**: Automated a11y checks
5. **Visual Regression**: Automated visual regression testing
6. **Multi-Tab Support**: Work with multiple browser tabs
7. **Remote Development**: Secure tunnel for remote debugging

## References

- Peter Steinberger's tweets: [Thread about sweetlink implementation]
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Puppeteer: https://pptr.dev/
- html2canvas: https://html2canvas.hertzen.com/
- WebSocket API: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
