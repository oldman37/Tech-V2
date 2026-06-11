# SP-7 — Inventory Import Permission Check Before Multer

**Date:** 2026-06-11
**Finding:** SP-7 🔵 (Low/Info)
**Phase:** 1 (Research & Specification)

---

## 1. Current State

`backend/src/routes/inventory.routes.ts` lines 246–251:

```typescript
router.post(
  '/inventory/import',
  upload.single('file'),       // ← multer buffers up to 10 MB into memory
  requireModule('TECHNOLOGY', 3),  // ← permission check runs AFTER
  inventoryController.importInventory
);
```

Any authenticated user at level 1 or 2 can repeatedly POST a 10 MB body to
this endpoint and have it fully buffered into process memory before receiving
403. Under concurrent abuse, this drains available heap.

`driverLicense.routes.ts` already uses the correct order (permission check
before multer), making this an inconsistency as well as a vulnerability.

---

## 2. Fix

Swap the middleware order so `requireModule` runs first:

```typescript
router.post(
  '/inventory/import',
  requireModule('TECHNOLOGY', 3),  // ← permission check first
  upload.single('file'),           // ← multer only reached by authorised users
  inventoryController.importInventory
);
```

---

## 3. Implementation Steps

1. Edit `backend/src/routes/inventory.routes.ts` lines 248–249 — swap
   `upload.single('file')` and `requireModule('TECHNOLOGY', 3)`.

---

## 4. Build Commands

- `docker compose -f docker-compose.dev.yml build backend`
- Frontend unchanged.
