---
name: resize-for-claude
description: Resize images for optimal Claude vision consumption. Scales images so the longest side is ≤1568px. Splits very tall images (3:1+ ratio) into overlapping tiles. Use when preparing screenshots, mockups, or design files for Claude analysis.
allowed-tools: Bash, Read
---

# Resize for Claude Skill

Resize images to optimal dimensions for Claude's vision capabilities. Claude processes images best when the longest side is ≤1568px. This skill handles both standard images and very tall images (full-page mockups, long screenshots) by splitting them into readable tiles.

## When to Use

- Preparing large screenshots or mockups for Claude to analyze
- Resizing Figma exports before feeding them to Claude
- Processing any image that's too large for efficient Claude vision consumption
- User asks to "resize for Claude" or "optimize image for Claude"

## How It Works

The script at `scripts/resize-for-claude` (in the tools repo):

1. Reads the image dimensions
2. If the image aspect ratio is < 3:1, resizes proportionally so the longest side = 1568px
3. If the image is very tall (≥ 3:1 height:width), splits into overlapping tiles before resizing each
4. Outputs to a `<filename>-claude/` directory next to the original

### Claude Vision Limits

| Property | Optimal | Maximum |
|----------|---------|---------|
| Longest side | ≤1568px | 8000px |
| File size | <1MB | 20MB |
| Aspect ratio | ≤2:1 | - |

Images exceeding these dimensions get downscaled by Claude anyway, wasting tokens on pixels that are thrown away.

## Usage

```bash
# Find the script (works from any project linked to tools)
TOOLS_ROOT="$(readlink -f .claude/skills/../../)"

# Basic usage — resize to 1568px longest side
"$TOOLS_ROOT/scripts/resize-for-claude" ~/Downloads/mockup.jpg

# Custom max side
"$TOOLS_ROOT/scripts/resize-for-claude" ~/Downloads/mockup.png 1200
```

### Direct invocation (if you know the tools path)

```bash
$TOOLS_ROOT/scripts/resize-for-claude ~/Downloads/image.jpg
```

## Output

**Standard image (< 3:1 ratio):**

```text
Input:  ~/Downloads/mockup.jpg
Size:   5120x11732 (2881KB)

Output: ~/Downloads/mockup-claude/mockup.jpg
Size:   684x1568 (84KB)
```

**Very tall image (≥ 3:1 ratio):**

```text
Input:  ~/Downloads/full-page.png
Size:   1440x8640 (4200KB)

Image is very tall (6:1 ratio). Splitting into tiles...
  Part 1: 1440x1568 (180KB) -> ~/Downloads/full-page-claude/full-page-part1.png
  Part 2: 1440x1568 (165KB) -> ~/Downloads/full-page-claude/full-page-part2.png
  Part 3: 1440x1568 (172KB) -> ~/Downloads/full-page-claude/full-page-part3.png

Output: ~/Downloads/full-page-claude/ (3 parts)
```

## Requirements

- macOS (uses `sips` — the built-in macOS image processing tool)

## After Resizing

Use the Read tool to view the resized image(s):

```bash
# Single image
Read ~/Downloads/mockup-claude/mockup.jpg

# Tiled parts — read each sequentially
Read ~/Downloads/full-page-claude/full-page-part1.png
Read ~/Downloads/full-page-claude/full-page-part2.png
```
