# UUID v13 → v14 Migration Specification

**Generated:** 2026-05-01  
**Author:** GitHub Copilot (Claude Sonnet 4.6)  
**CVE:** GHSA-w5hq-g745-h8pq (MODERATE)  
**Task:** Research-only — no files modified  

---

## 1. Vulnerability Summary

| Field | Detail |
|---|---|
| **CVE** | GHSA-w5hq-g745-h8pq |
| **Severity** | MODERATE |
| **Description** | Missing buffer bounds check in `v3()`, `v5()`, and `v6()` when the optional `buf` parameter is supplied. A caller passing a buffer shorter than 16 bytes receives unpredictable bytes written past the end of the buffer. |
| **Affected range** | `uuid < 14.0.0` |
| **Current installed** | `uuid@^13.0.0` (backend direct dependency) |
| **Fix** | `uuid@14.0.0` |
| **Triggered by** | Calling `v3(name, ns, buf)` / `v5(name, ns, buf)` / `v6(buf)` with a `buf` argument — NOT triggered by standard `v4()` with no `buf` |

---

## 2. Complete UUID Usage Audit

### 2.1 Scope Searched

| Directory | Result |
|---|---|
| `c:\Tech-V2\backend\src\` | 1 import file found |
| `c:\Tech-V2\backend\scripts\` | 0 imports (comments only) |
| `c:\Tech-V2\frontend\src\` | 0 imports |
| `c:\Tech-V2\shared\src\` | 0 imports |

### 2.2 Files That Import from the `uuid` Package

#### `c:\Tech-V2\backend\src\middleware\requestLogger.ts`

| Field | Detail |
|---|---|
| **Import style** | `import { v4 as uuidv4 } from 'uuid';` |
| **Functions called** | `uuidv4()` |
| **`buf` parameter used?** | **NO** |
| **`offset` parameter used?** | **NO** |
| **Call site** | Line 27: `req.id = (req.headers['x-request-id'] as string) \|\| uuidv4();` |
| **Purpose** | Generates a random v4 UUID as an HTTP request correlation ID |

This is the **only file** in the entire monorepo that imports from the `uuid` package.

### 2.3 Files with `uuid`-Related Text (NOT uuid package imports)

The following files contain the string `uuid` only as:
- `z.string().uuid(...)` — Zod built-in UUID format validator (completely unrelated to the `uuid` npm package)
- Comments referring to UUIDs as a data concept

These require **no changes** during the uuid package upgrade:

| File | Nature of `uuid` reference |
|---|---|
| `backend\src\validators\assignment.validators.ts` | `z.string().uuid(...)` Zod validator — 9 occurrences |
| `backend\src\validators\inventory.validators.ts` | `z.string().uuid(...)` Zod validator — multiple occurrences |
| `backend\src\validators\location.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\validators\purchaseOrder.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\validators\referenceData.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\validators\room.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\validators\transportationRequest.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\validators\user.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\validators\userRoomAssignment.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\validators\fieldTrip.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\validators\fundingSource.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\validators\work-orders.validators.ts` | `z.string().uuid(...)` Zod validator |
| `backend\src\controllers\userRoomAssignment.controller.ts` | `z.string().uuid(...)` Zod validator in inline schema |
| `backend\src\services\inventory.service.ts` | Comment only — "FK fields instead of raw UUIDs" |
| `backend\scripts\fix-permission-levels.ts` | Comment only — "reference permissionId (UUID)" |
| `backend\scripts\fix-requisition-permission-levels.ts` | Comment only — "reference permissionId (UUID)" |

### 2.4 Frontend / Shared

- `uuid` is **not listed** as a dependency in `c:\Tech-V2\frontend\package.json`
- `uuid` is **not listed** as a dependency in `c:\Tech-V2\shared\package.json`
- No `from 'uuid'` imports found in any frontend or shared source file

---

## 3. Breaking Change Analysis

### 3.1 uuid v13 → v14 Breaking Changes

| Change | Impact on this project |
|---|---|
| `buf` parameter now throws if buffer is < 16 bytes | **NO IMPACT** — `buf` is never passed |
| `v3()`, `v5()`, `v6()` bounds check tightened | **NO IMPACT** — none of these functions are used |
| `v4()` with no arguments: **unchanged** | This is the only call site; no change required |
| Import API `import { v4 } from 'uuid'`: **unchanged** | Import style works identically in v14 |
| `v6()`, `v7()` remain available | Not used; N/A |
| `validate()`, `parse()`, `stringify()`: **unchanged** | Not used; N/A |
| TypeScript types: **ships own types** (since v9) | See Section 4 |

### 3.2 Code Changes Required

**NONE.** The single call site `uuidv4()` (no `buf`, no `offset`) is fully compatible with v14.

---

## 4. `@types/uuid` Analysis

### Current status

```json
// c:\Tech-V2\backend\package.json  devDependencies
"@types/uuid": "^10.0.0"
```

### Should it be removed?

**YES — remove `@types/uuid`.**

uuid has shipped its own bundled TypeScript type definitions since **v9.0.0** (internal `dist/types` directory). `@types/uuid` (DefinitelyTyped) provides types for older versions only. Using both simultaneously can cause type conflicts.

- uuid v14 bundles its own `.d.ts` files — no external types package is needed or expected.
- `@types/uuid@14` does **not exist** on npm as of this writing; DefinitelyTyped stopped tracking uuid after v8 when the package became self-typed.
- Keeping `@types/uuid@^10.0.0` against `uuid@14` will create a version mismatch in DefinitelyTyped lookup and should be removed to avoid confusion.

---

## 5. npm Commands

### 5.1 Upgrade uuid and remove stale types

```bash
cd c:\Tech-V2\backend

# Upgrade uuid to v14
npm install uuid@14.0.0

# Remove the now-redundant @types/uuid (uuid ships its own types since v9)
npm uninstall @types/uuid
```

### 5.2 Verify installation

```bash
# Confirm installed version
npm list uuid

# Confirm no @types/uuid remains
npm list @types/uuid
```

### 5.3 Note on transitive azure dependencies

`@azure/msal-node` and `@azure/identity` contain their **own internal copies** of `uuid < 14.0.0` as transitive dependencies. Upgrading the direct `uuid` dependency in backend does **not** fix those transitive copies. That is a separate migration tracked under **M-4** of the dependency audit spec. The transitive copies are also subject to GHSA-w5hq-g745-h8pq but only if the Azure SDK internally calls `v3/v5/v6` with a user-supplied `buf` — unlikely in authentication library internals.

---

## 6. Build Verification Steps

After running the npm commands above:

```bash
# 1. TypeScript compile
cd c:\Tech-V2\backend
npm run build

# Expected: zero TypeScript errors related to uuid types.
# The import { v4 as uuidv4 } from 'uuid' should resolve cleanly
# from uuid's own bundled types.

# 2. Dev server smoke test (optional, not required for this change)
npm run dev
# Verify a request to any endpoint returns an X-Request-ID header
# formatted as a valid UUID v4 string.

# 3. npm audit check
npm audit
# The uuid direct dependency entry for GHSA-w5hq-g745-h8pq should
# no longer appear. Transitive azure entries may still appear (see M-4).
```

---

## 7. Risk Assessment

### RISK LEVEL: **LOW**

| Factor | Finding |
|---|---|
| `buf` parameter used anywhere? | **NO** |
| `v3()`, `v5()`, `v6()` called anywhere? | **NO** |
| Only function used | `v4()` with no arguments |
| Import API change required? | **NO** — `import { v4 as uuidv4 } from 'uuid'` unchanged |
| Code changes required? | **NONE** |
| Files affected by upgrade | `c:\Tech-V2\backend\package.json` (version bump + @types removal) |
| Zod `.uuid()` validators affected? | **NO** — Zod's `.uuid()` is Zod's own method, unrelated to the uuid package |

The only risk is TypeScript compilation failure if `@types/uuid` removal causes an unexpected type resolution issue, which is extremely unlikely given that uuid v14 ships its own complete type definitions.

---

## 8. Summary

| Item | Value |
|---|---|
| Files importing `uuid` package | **1** (`requestLogger.ts`) |
| Functions called | `v4()` (aliased as `uuidv4`) |
| `buf` parameter used | **NO** |
| `offset` parameter used | **NO** |
| Import style | `import { v4 as uuidv4 } from 'uuid'` |
| Frontend uuid usage | **None** |
| Shared uuid usage | **None** |
| Scripts uuid imports | **None** (comments only) |
| Code changes required for v14 compat | **NONE** |
| `@types/uuid` should be removed | **YES** |
| Risk level | **LOW** |
