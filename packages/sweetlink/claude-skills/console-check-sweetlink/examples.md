# Console Check Sweetlink - Examples

Common usage patterns for checking console errors during development.

## Example 1: Clean Console (Zero Errors)

**User Request:**
> "Check the console for errors"

**Skill Action:**

```bash
pnpm sweetlink logs --filter error
```

**Output:**

```text
✅ Console Check: CLEAN

Errors: 0
Warnings: 0
Last checked: 14:30:45

Application is running without console errors.
Zero-error policy maintained ✓
```

---

## Example 2: Errors Found After Changes

**User Request:**
> "I added a new feature, check for errors"

**Skill Action:**

```bash
pnpm sweetlink logs --filter error
```

**Output:**

```typescript
❌ Console Check: 3 ERRORS FOUND

### Error 1:
[ERROR] TypeError: Cannot read property 'data' of undefined
File: src/components/Card.tsx:45
Time: 14:28:12.234
Stack: at Card.render (Card.tsx:45)

### Error 2:
[ERROR] Failed to fetch: NetworkError
File: src/api/client.ts:89
Time: 14:28:13.891
Message: Network request failed

### Error 3:
[ERROR] Hydration failed
File: src/pages/index.tsx:12
Time: 14:28:14.023
Details: Server: "Loading..." Client: "Data loaded"

### Next Steps:
1. Fix null check in Card.tsx (add optional chaining)
2. Add error handling to API fetch
3. Fix hydration by using useEffect for dynamic content
```

---

## Example 3: Before Committing

**User Request:**
> "I'm ready to commit, make sure there are no console errors"

**Skill Action:**

```bash
# Check console
pnpm sweetlink logs --filter error
```

**Output (Clean):**

```text
✅ Console Check: CLEAN

Pre-commit verification:
- Console errors: 0 ✓
- Warnings: 0 ✓
- Application state: Healthy ✓

Safe to commit!
```

**Output (With Errors):**

```text
❌ Console Check: BLOCKED

Cannot commit - 2 console errors found:

1. [ERROR] TypeError in Card component
2. [ERROR] API fetch failed

Fix these errors before committing to maintain zero-error policy.
```

---

## Example 4: Debugging Workflow

**User Request:**
> "The page isn't loading correctly, debug it"

**Skill Action:**

```bash
# Step 1: Check console
pnpm sweetlink logs --filter error

# Step 2: Get all logs for context
pnpm sweetlink logs
```

**Output:**

```text
🔍 Debugging Console Analysis

### Errors (2):
1. [ERROR] Failed to fetch /api/data
   Time: 14:25:10

2. [ERROR] Cannot render: data is undefined
   Time: 14:25:11

### Recent Logs (context):
[INFO] Fetching data from API... (14:25:09)
[ERROR] Failed to fetch /api/data (14:25:10)
[WARN] Using fallback data (14:25:10)
[ERROR] Cannot render: data is undefined (14:25:11)

### Root Cause Identified:
API fetch is failing → fallback data is undefined → render fails

### Fix:
Add proper fallback data or loading state
```

---

## Example 5: After HMR Reload

**User Request:**
> "I just saved my changes, check the console"

**Skill Action:**

```bash
# Wait 2 seconds for HMR
sleep 2

# Check console
pnpm sweetlink logs --filter error
```

**Output:**

```text
✅ HMR Reload: Clean

Changes detected at 14:32:15
HMR completed at 14:32:17
Console errors: 0 ✓

Your changes loaded successfully with no errors!
```

---

## Example 6: Hydration Error Detection

**User Request:**
> "There's a hydration warning, what's causing it?"

**Skill Action:**

```bash
pnpm sweetlink logs --filter hydration
```

**Output:**

```typescript
⚠️  Hydration Issues Found

1. [ERROR] Hydration failed because the initial UI does not match
   Component: src/pages/dashboard.tsx:23
   Time: 14:20:15.123

   Server HTML: <div>Loading...</div>
   Client HTML: <div>December 24, 2025</div>

   Cause: Date() called during SSR creates different output on client

   Fix: Use useEffect for client-only dynamic content
   ```tsx
   const [date, setDate] = useState('');
   useEffect(() => {
     setDate(new Date().toLocaleDateString());
   }, []);
   ```

```yaml

---

## Example 7: Warning Triage

**User Request:**
> "Check for warnings too"

**Skill Action:**
```bash
pnpm sweetlink logs --filter warning
```

**Output:**

```text
⚠️  Console Warnings: 5 found

High Priority:
1. [WARN] Each child in list should have unique key prop
   File: src/components/List.tsx:34
   Impact: Can cause rendering bugs

Medium Priority:
2. [WARN] React does not recognize `customProp` on DOM element
   File: src/components/Button.tsx:12
   Impact: Console clutter

3. [WARN] componentWillReceiveProps has been renamed
   File: src/legacy/OldComponent.tsx:45
   Impact: Deprecated API

Low Priority:
4. [WARN] Missing alt attribute on img
   File: src/components/Card.tsx:67
   Impact: Accessibility

5. [WARN] Unrecognized CSS property
   File: src/styles/custom.css:23
   Impact: Style won't apply

Recommendation: Fix high priority warnings before merge
```

---

## Example 8: API Error Detection

**User Request:**
> "The data isn't loading, check console"

**Skill Action:**

```bash
pnpm sweetlink logs --filter "fetch"
```

**Output:**

```markdown
🌐 Network/Fetch Analysis

### Fetch Errors (3):

1. [ERROR] Failed to fetch: /api/users
   Time: 14:15:22.123
   Status: 500 Internal Server Error
   Message: Database connection failed

2. [ERROR] Failed to fetch: /api/posts
   Time: 14:15:23.456
   Status: 404 Not Found
   Message: Endpoint does not exist

3. [ERROR] Failed to fetch: /api/settings
   Time: 14:15:24.789
   Status: 401 Unauthorized
   Message: Missing authentication token

### Root Causes:
- Backend server error (500)
- Invalid API endpoint (404)
- Missing auth token (401)

### Next Steps:
1. Check backend logs for database issue
2. Verify API route exists
3. Add authentication token to request
```

---

## Example 9: Zero-Error Enforcement

**Task Completion Check:**

```bash
# Before marking task complete, enforce zero errors
pnpm sweetlink logs --filter error
```

**Output (Passed):**

```text
✅ Task Completion: APPROVED

Console Check: PASSED ✓
- Errors: 0
- Warnings: 0
- Application: Stable

Task can be marked as complete.
Zero-error policy maintained.
```

**Output (Failed):**

```text
❌ Task Completion: BLOCKED

Console Check: FAILED ✗
- Errors: 2
- Warnings: 1

Cannot mark task as complete until console is clean.
Fix errors and re-check.
```

---

## Example 10: Integration with Complete Quality Check

**User Request:**
> "Run a complete quality check before deploying"

**Skill Action:**

```bash
# 1. TypeScript check
pnpm run typecheck

# 2. Console errors check
pnpm sweetlink logs --filter error

# 3. Build check
pnpm run build
```

**Output:**

```markdown
🎯 Complete Quality Check

1. TypeScript Check: ✅ PASSED (0 errors)
2. Console Check: ✅ PASSED (0 errors)
3. Build Check: ✅ PASSED (built successfully)

### Summary:
All quality gates passed ✓
- Type safety: Maintained
- Runtime errors: Zero
- Build: Successful

✅ APPROVED FOR DEPLOYMENT
```

---

## Best Practices Demonstrated

1. **Check after every change** - Catch errors immediately
2. **Use filters** - Focus on errors first, then warnings
3. **Zero-error policy** - Don't accumulate technical debt
4. **Integrated checks** - Combine with typecheck and builds
5. **Root cause analysis** - Understand error context
6. **Fix before commit** - Maintain code quality
7. **HMR awareness** - Wait for reload before checking
