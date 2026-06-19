# Responsive Screenshots - Examples

Common usage patterns for testing responsive design across breakpoints.

## Example 1: Complete Responsive Test

**User Request:**
> "Test the new landing page across all breakpoints"

**Skill Action:**

```bash
# Capture all breakpoints
pnpm sweetlink screenshot --viewport mobile --output /tmp/screenshots/landing-mobile.png
pnpm sweetlink screenshot --viewport tablet --output /tmp/screenshots/landing-tablet.png
pnpm sweetlink screenshot --viewport desktop --output /tmp/screenshots/landing-desktop.png
```

**Output:**

```text
✅ Responsive Test: Landing Page

📱 Mobile (375px)
   Screenshot: /tmp/screenshots/landing-mobile.png
   ✅ Single column layout
   ✅ Touch-friendly navigation
   ✅ Images scale correctly
   ✅ Text readable at 16px

💻 Tablet (768px)
   Screenshot: /tmp/screenshots/landing-tablet.png
   ✅ Two-column grid
   ✅ Navigation bar expanded
   ✅ Hero image displays properly
   ✅ Call-to-action buttons visible

🖥️  Desktop (1440px)
   Screenshot: /tmp/screenshots/landing-desktop.png
   ✅ Three-column grid
   ✅ Full navigation with all items
   ✅ Hero section uses full width
   ✅ Professional whitespace

Overall: ✅ PASSED - All breakpoints look great!
```

---

## Example 2: Component-Specific Testing

**User Request:**
> "Check how the navigation menu looks on mobile vs desktop"

**Skill Action:**

```bash
pnpm sweetlink screenshot --viewport mobile --selector "nav" --output /tmp/screenshots/nav-mobile.png
pnpm sweetlink screenshot --viewport desktop --selector "nav" --output /tmp/screenshots/nav-desktop.png
```

**Output:**

```text
🔍 Navigation Component Analysis

📱 Mobile (375px)
   Screenshot: /tmp/screenshots/nav-mobile.png
   Status: ⚠️  NEEDS WORK

   Issues:
   - Menu items are cramped (only 8px padding)
   - Logo is too large for mobile screen
   - Menu overlaps content slightly

   Recommendations:
   - Increase padding to 16px
   - Reduce logo size by 30%
   - Add z-index to ensure menu is above content

🖥️  Desktop (1440px)
   Screenshot: /tmp/screenshots/nav-desktop.png
   Status: ✅ PERFECT

   - Horizontal layout works well
   - All menu items visible
   - Logo is appropriately sized
   - Spacing is professional
```

---

## Example 3: Before/After Comparison

**User Request:**
> "I updated the responsive styles, show me the difference"

**Skill Action:**

```bash
# Before (git stash to revert)
git stash
pnpm sweetlink screenshot --viewport mobile --output /tmp/screenshots/before-mobile.png
git stash pop

# After (with changes)
pnpm sweetlink screenshot --viewport mobile --output /tmp/screenshots/after-mobile.png
```

**Output:**

```markdown
📊 Before/After Comparison (Mobile)

### Before:
Screenshot: /tmp/screenshots/before-mobile.png
Issues:
- Text overflows container
- Images don't scale
- Buttons are too small

### After:
Screenshot: /tmp/screenshots/after-mobile.png
Improvements:
✅ Text wraps properly with word-break
✅ Images use w-full class
✅ Buttons increased to min-h-12

Result: Significant improvement in mobile usability!
```

---

## Example 4: Grid Layout Verification

**User Request:**
> "Verify the card grid works at all breakpoints"

**Skill Action:**

```bash
pnpm sweetlink screenshot --viewport mobile --selector ".card-grid" --output /tmp/screenshots/grid-mobile.png
pnpm sweetlink screenshot --viewport tablet --selector ".card-grid" --output /tmp/screenshots/grid-tablet.png
pnpm sweetlink screenshot --viewport desktop --selector ".card-grid" --output /tmp/screenshots/grid-desktop.png
```

**Output:**

```text
🎯 Card Grid Responsive Analysis

📱 Mobile (375px)
   Screenshot: /tmp/screenshots/grid-mobile.png
   Layout: 1 column
   Cards: 3 visible (stack vertically)
   ✅ Works perfectly - easy to scroll through

💻 Tablet (768px)
   Screenshot: /tmp/screenshots/grid-tablet.png
   Layout: 2 columns
   Cards: 6 visible (3 rows × 2 columns)
   ✅ Good use of space

🖥️  Desktop (1440px)
   Screenshot: /tmp/screenshots/grid-desktop.png
   Layout: 3 columns
   Cards: 9 visible (3 rows × 3 columns)
   ✅ Excellent grid layout

Responsive Grid: ✅ APPROVED
Grid scales perfectly from 1 → 2 → 3 columns
```

---

## Example 5: Detecting Layout Issues

**User Request:**
> "The page looks weird on tablet, debug it"

**Skill Action:**

```bash
pnpm sweetlink screenshot --viewport tablet --output /tmp/screenshots/tablet-debug.png
pnpm sweetlink logs --filter error
```

**Output:**

```yaml
🐛 Tablet Layout Debug

Screenshot: /tmp/screenshots/tablet-debug.png

Issues Detected:
1. ⚠️  Awkward 2-column layout
   - Sidebar too narrow (only 200px)
   - Main content area cramped

2. ⚠️  Navigation partially hidden
   - Menu items cut off at 768px
   - Dropdown doesn't fit viewport

3. ⚠️  Images not scaling
   - Fixed width images (500px) overflow
   - Should use max-w-full

Console Errors:
[ERROR] Element width exceeds viewport

Root Cause:
Missing md: breakpoint styles. Layout jumps from mobile
to desktop without tablet-specific styling.

Fix:
Add explicit md: classes:
- md:grid-cols-2
- md:gap-4
- md:max-w-full
```

---

## Example 6: Accessibility Testing

**User Request:**
> "Check if touch targets are large enough on mobile"

**Skill Action:**

```bash
pnpm sweetlink screenshot --viewport mobile --output /tmp/screenshots/mobile-touch.png
```

**Output:**

```text
📱 Mobile Touch Target Analysis

Screenshot: /tmp/screenshots/mobile-touch.png

Touch Target Audit:
✅ Primary CTA button: 56px height (good)
✅ Navigation menu items: 48px height (minimum)
⚠️  Close icon: 32px (too small)
⚠️  Dropdown arrows: 24px (too small)
❌ Footer links: 20px (far too small)

Recommendations:
1. Increase close icon to 48px minimum
2. Increase dropdown touch area to 44px
3. Add padding to footer links (min 48px total)

Touch targets below 44px are hard to tap on mobile devices.
```

---

## Example 7: Typography Scaling

**User Request:**
> "Check if the heading sizes look good across devices"

**Skill Action:**

```bash
pnpm sweetlink screenshot --viewport mobile --selector "h1" --output /tmp/screenshots/h1-mobile.png
pnpm sweetlink screenshot --viewport desktop --selector "h1" --output /tmp/screenshots/h1-desktop.png
```

**Output:**

```text
📝 Typography Analysis

📱 Mobile H1:
   Screenshot: /tmp/screenshots/h1-mobile.png
   Font size: 28px (via computed style)
   Line height: 1.2
   ⚠️  Slightly small - recommend 32px minimum

🖥️  Desktop H1:
   Screenshot: /tmp/screenshots/h1-desktop.png
   Font size: 48px (via computed style)
   Line height: 1.2
   ✅ Perfect size for desktop

Recommendation:
Update Tailwind classes:
- Mobile: text-3xl (30px) or text-4xl (36px)
- Desktop: text-5xl (48px) - current ✓
```

---

## Example 8: Full Page Responsive Audit

**User Request:**
> "Do a complete responsive audit of the dashboard"

**Skill Action:**

```bash
# Capture all viewports
for viewport in mobile tablet desktop; do
  pnpm sweetlink screenshot --viewport $viewport --output /tmp/screenshots/dashboard-$viewport.png
  pnpm sweetlink logs --filter error
done
```

**Output:**

```text
📋 Complete Responsive Audit: Dashboard

### Mobile (375px)
Screenshot: /tmp/screenshots/dashboard-mobile.png
✅ Layout: Single column works
✅ Cards: Stack vertically
✅ Navigation: Hamburger menu
⚠️  Issue: Charts are too small to read
   Fix: Consider horizontal scrolling for charts

### Tablet (768px)
Screenshot: /tmp/screenshots/dashboard-tablet.png
✅ Layout: 2-column works well
✅ Navigation: Expanded header
✅ Charts: Adequate size
✅ Sidebar: Collapsible design works

### Desktop (1440px)
Screenshot: /tmp/screenshots/dashboard-desktop.png
✅ Layout: 3-column grid optimal
✅ Navigation: All items visible
✅ Charts: Full size, very readable
✅ Sidebar: Persistent and useful

Console Errors: 0 across all viewports ✓

Overall Grade: B+ (Mobile charts need improvement)

Next Steps:
1. Make charts horizontally scrollable on mobile
2. Add touch gestures for chart interaction
3. Consider hiding less critical data on mobile
```

---

## Example 9: Navigation State Testing

**User Request:**
> "Test the navigation menu at different breakpoints"

**Skill Action:**

```bash
pnpm sweetlink screenshot --viewport mobile --selector ".nav-menu" --output /tmp/screenshots/nav-mobile.png
pnpm sweetlink screenshot --viewport tablet --selector ".nav-menu" --output /tmp/screenshots/nav-tablet.png
pnpm sweetlink screenshot --viewport desktop --selector ".nav-menu" --output /tmp/screenshots/nav-desktop.png
```

**Output:**

```text
🧭 Navigation Responsive States

📱 Mobile (375px): Hamburger Menu
   Screenshot: /tmp/screenshots/nav-mobile.png
   State: Collapsed by default
   ✅ Hamburger icon visible (32px)
   ✅ Menu slides from left
   ✅ Full screen overlay works

💻 Tablet (768px): Hybrid Layout
   Screenshot: /tmp/screenshots/nav-tablet.png
   State: Partial expansion
   ✅ Logo + key items visible
   ✅ Overflow items in dropdown
   ✅ Balanced use of space

🖥️  Desktop (1440px): Full Navigation
   Screenshot: /tmp/screenshots/nav-desktop.png
   State: Fully expanded
   ✅ All menu items visible
   ✅ Dropdown menus on hover
   ✅ Professional spacing

Navigation Pattern: ✅ EXCELLENT
Progressive disclosure works perfectly across devices
```

---

## Example 10: Image Scaling Test

**User Request:**
> "Verify the hero image scales properly"

**Skill Action:**

```bash
pnpm sweetlink screenshot --viewport mobile --selector ".hero" --output /tmp/screenshots/hero-mobile.png
pnpm sweetlink screenshot --viewport desktop --selector ".hero" --output /tmp/screenshots/hero-desktop.png
```

**Output:**

```text
🖼️  Hero Image Scaling Analysis

📱 Mobile (375px)
   Screenshot: /tmp/screenshots/hero-mobile.png
   Image: 375×250px (aspect ratio 3:2)
   ✅ Scales to full width
   ✅ No overflow or distortion
   ✅ Loading: lazy ✓

🖥️  Desktop (1440px)
   Screenshot: /tmp/screenshots/hero-desktop.png
   Image: 1440×600px (aspect ratio 2.4:1)
   ✅ Uses full container width
   ✅ High resolution (retina ready)
   ✅ Object-fit: cover maintains aspect

Image Handling: ✅ PERFECT
Responsive images working correctly with proper aspect ratios
```

---

## Best Practices Demonstrated

1. **Test all three breakpoints** - Mobile, tablet, desktop coverage
2. **Component-specific tests** - Focus on specific areas
3. **Before/after comparisons** - Verify improvements
4. **Touch target validation** - Ensure mobile usability
5. **Typography scaling** - Check readability across sizes
6. **Layout verification** - Confirm grid behavior
7. **Console monitoring** - Check for layout errors
8. **Complete audits** - Systematic full-page reviews
