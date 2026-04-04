# Sweetlink CDP (Chrome DevTools Protocol) Guide

## Overview

Chrome DevTools Protocol (CDP) provides enhanced screenshot quality and additional debugging capabilities compared to the WebSocket/html2canvas method.

## Advantages of CDP

| Feature | WebSocket (html2canvas) | CDP (Puppeteer) |
|---------|------------------------|-----------------|
| Screenshot Quality | Good | Excellent |
| Full Page Screenshots | Limited | Native support |
| Large Pages | May timeout | Reliable |
| Network Inspection | ❌ Not available | ✅ Full support |
| Performance Metrics | ❌ Not available | ✅ Available |
| Selector Screenshots | Works | More reliable |
| Setup Required | None | Chrome with remote debugging |

## Starting Chrome with CDP

### macOS

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

### Linux

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

### Windows

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir=%TEMP%\chrome-debug
```

## Automatic CDP Detection

Sweetlink automatically detects if CDP is available and uses it when possible:

```bash
# This will use CDP if Chrome is running with remote debugging
pnpm sweetlink screenshot --no-wait --output page.png

# Output:
# [Sweetlink] Using CDP for screenshot
# [Sweetlink] ✓ Screenshot saved to: page.png
# [Sweetlink] Method: Chrome DevTools Protocol
```

## CDP-Specific Commands

### Network Inspection (CDP Only)

```bash
# Get all network requests
pnpm sweetlink network

# Filter by URL
pnpm sweetlink network --filter "/api/"
pnpm sweetlink network --filter "graphql"

# Example output:
# [Sweetlink] ✓ Found 15 network requests
#
# Network Requests:
#
#   1. GET http://localhost:3000/api/companies
#      Status: 200 OK
#      Type: xhr
#
#   2. GET http://localhost:3000/api/countries
#      Status: 200 OK
#      Type: fetch
```

### Enhanced Screenshots

```bash
# Full page screenshot (works better with CDP)
pnpm sweetlink screenshot --no-wait --full-page --output fullpage.png

# Element screenshot (more reliable with CDP)
pnpm sweetlink screenshot --no-wait --selector ".company-card" --output card.png

# CDP provides better handling of:
# - Large pages that timeout with html2canvas
# - Complex CSS and animations
# - Responsive layouts
# - High-resolution displays
```

## Environment Variables

```bash
# WebSocket URL (default: ws://localhost:9223)
export SWEETLINK_WS_URL=ws://localhost:9223

# CDP URL (default: http://127.0.0.1:9222)
export CHROME_CDP_URL=http://127.0.0.1:9222

# CDP port (default: 9222)
export CHROME_CDP_PORT=9222
```

## Troubleshooting

### CDP Not Detected

**Symptom**: Screenshot command says "Using WebSocket for screenshot"

**Solutions**:

1. Check if Chrome is running with remote debugging:

   ```bash
   curl http://127.0.0.1:9222/json/version
   ```

2. You should see JSON response with browser info:

   ```json
   {
     "Browser": "Chrome/131.0.6778.205",
     "Protocol-Version": "1.3",
     "User-Agent": "Mozilla/5.0...",
     "WebKit-Version": "537.36"
   }
   ```

3. If not, start Chrome with `--remote-debugging-port=9222` flag

### Connection Refused

**Symptom**: `CDP connection failed: connect ECONNREFUSED 127.0.0.1:9222`

**Solutions**:

1. Chrome is not running with remote debugging enabled
2. Check if another process is using port 9222:

   ```bash
   lsof -ti:9222
   ```

3. Try a different port:

   ```bash
   # Start Chrome on port 9223
   --remote-debugging-port=9223

   # Tell Sweetlink to use that port
   export CHROME_CDP_PORT=9223
   ```

### No Local Development Page Found

**Symptom**: `No local development page found`

**Solution**:

1. Make sure you have http://localhost:3000 open in the Chrome instance with remote debugging
2. Navigate to your dev server before running sweetlink commands

### Screenshot Fails on Large Pages

**With WebSocket**: May timeout after 30 seconds

**With CDP**: Should work reliably, but may take longer:

```bash
# If screenshot is slow, try targeting a specific element
pnpm sweetlink screenshot --no-wait --selector ".main-content"
```

## CDP Features Roadmap

### Phase 2 (Current)

✅ Auto-detection
✅ Enhanced screenshots
✅ Network request inspection

### Phase 3 (Future)

- Performance metrics and profiling
- Console log capture via CDP (in addition to WebSocket)
- Coverage reports
- Lighthouse audits
- Video recording
- Screenshot diffing

## Comparison: When to Use What

### Use CDP (Recommended) When

- Taking screenshots of large or complex pages
- Need full-page screenshots
- Investigating network requests
- Need production-quality screenshots
- Working on performance optimization
- Debugging network issues

### Use WebSocket When

- CDP not available or not set up
- Simple element screenshots
- Quick debugging tasks
- Don't want to set up Chrome with remote debugging

## Best Practices

1. **Development Workflow**: Start Chrome with CDP at the beginning of your dev session

   ```bash
   # Add to your shell profile (.zshrc, .bashrc)
   alias chrome-dev='/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug'
   ```

2. **CI/CD**: WebSocket method is better for CI environments (no extra Chrome setup needed)

3. **Screenshot Quality**: Always use CDP for screenshots that will be reviewed or shared

4. **Network Debugging**: CDP is the only option for network inspection

## Integration with Claude Agents

Claude agents can automatically take advantage of CDP when available:

```bash
# Agent workflow example:
# 1. Check if screenshot works
pnpm sweetlink screenshot --no-wait --output before.png

# 2. Make code changes
# ...

# 3. Verify changes
pnpm sweetlink screenshot --no-wait --output after.png

# 4. Check for console errors
pnpm sweetlink logs --filter error

# 5. Verify API calls
pnpm sweetlink network --filter "/api/"
```

If CDP is available, the agent gets higher quality screenshots automatically. If not, it falls back to WebSocket gracefully.

## Security Considerations

- CDP gives full access to browser debugging features
- Only use on localhost development
- Never expose CDP port (9222) to external networks
- Use temporary user data directory (`--user-data-dir=/tmp`)
- CDP should NEVER be enabled in production

## Example: Complete Development Session

```bash
# 1. Start Chrome with CDP
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug \
  http://localhost:3000 &

# 2. Start dev server (in another terminal)
pnpm run dev

# 3. Take baseline screenshot
pnpm sweetlink screenshot --no-wait --output baseline.png

# 4. Make code changes
# ... edit files ...

# 5. Verify changes
pnpm sweetlink screenshot --no-wait --output modified.png

# 6. Check console for errors
pnpm sweetlink logs --filter error

# 7. Inspect network requests
pnpm sweetlink network --filter "/api/"

# 8. Query DOM to verify changes
pnpm sweetlink query --selector ".new-feature"
```

## Visual Comparison with Overlays

When verifying UI changes like card sizes or alignment, use ImageMagick to create annotated overlays on screenshots. This provides precise pixel measurements and visual proof.

### Comparing Element Sizes

```bash
# 1. Take screenshot
pnpm sweetlink screenshot --no-wait --url "http://localhost:3000/company/cyera" \
  --output .tmp/screenshots/layout-check.png

# 2. Add overlay rectangles and labels using ImageMagick
convert .tmp/screenshots/layout-check.png \
  -fill 'rgba(255,0,0,0.3)' -stroke 'red' -strokewidth 2 \
  -draw "rectangle 700,655 1295,800" \
  -fill 'rgba(0,255,0,0.3)' -stroke 'lime' -strokewidth 2 \
  -draw "rectangle 700,830 1295,920" \
  -font Helvetica-Bold -pointsize 20 \
  -fill white -stroke black -strokewidth 1 \
  -annotate +710+680 "CARD A: 595px wide" \
  -annotate +710+860 "CARD B: 595px wide" \
  .tmp/screenshots/layout-overlay.png

# 3. View the overlay to confirm measurements match
```

### Use Cases

- **Card width verification**: Confirm two cards have the same width
- **Alignment debugging**: Check if elements are properly aligned
- **Spacing validation**: Measure gaps between components
- **Before/after comparison**: Show exact pixel changes

### ImageMagick Draw Commands

```bash
# Rectangle overlay (x1,y1 to x2,y2)
-draw "rectangle 100,200 400,500"

# Line
-draw "line 100,100 500,100"

# Circle
-draw "circle 250,250 300,250"

# Text annotation at position (+x+y)
-annotate +100+200 "Label text"

# Colors with transparency
-fill 'rgba(255,0,0,0.3)'  # Red, 30% opacity
-fill 'rgba(0,255,0,0.3)'  # Green, 30% opacity
-stroke 'red'               # Solid red border
```

### Agent Workflow Example

```bash
# Step 1: Screenshot before change
pnpm sweetlink screenshot --no-wait --output .tmp/screenshots/before.png

# Step 2: Make code changes
# ... edit files ...

# Step 3: Screenshot after change
pnpm sweetlink screenshot --no-wait --output .tmp/screenshots/after.png

# Step 4: Create comparison overlay
convert .tmp/screenshots/after.png \
  -fill 'rgba(0,255,0,0.3)' -stroke 'lime' -strokewidth 2 \
  -draw "rectangle X1,Y1 X2,Y2" \
  -annotate +X1+Y1 "Element: NNNpx wide" \
  .tmp/screenshots/verified.png

# Step 5: Read and analyze the overlay image to confirm fix
```

This technique is especially useful when visual inspection alone is insufficient to verify that elements match exactly.

## Summary

CDP provides professional-grade debugging and screenshot capabilities for Sweetlink. While the WebSocket method works well for basic tasks, CDP is recommended for:

- High-quality screenshots
- Large or complex pages
- Network debugging
- Performance analysis
- Production-ready captures

The automatic fallback ensures sweetlink works in all environments, but CDP unlocks its full potential.
