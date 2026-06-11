# Inventory Search Enhancement Spec

**Feature:** Expand multi-field search for inventory and disposed equipment  
**Date:** 2026-06-11  
**Phase:** 1 — Research & Specification

---

## 1. Current State Analysis

### 1.1 Endpoints that handle the `search` parameter

| Endpoint | Controller | Service method | Used by |
|----------|-----------|----------------|---------|
| `GET /api/inventory?search=…` | `inventory.controller.ts → getInventory` | `InventoryService.findAll` | InventoryManagement, DisposedEquipment, EquipmentSearch pages |
| `GET /api/inventory/search?q=…` | `inventory.controller.ts → searchInventory` | `InventoryService.search` | Typeahead autocomplete dropdowns (repair tickets, device assignment, etc.) |

The user-facing search box on all three inventory pages uses **`GET /api/inventory`** with the `search` query parameter — NOT the typeahead endpoint.

---

### 1.2 Current WHERE clause — `InventoryService.findAll`

File: `backend/src/services/inventory.service.ts`  
Lines 89–96:

```typescript
if (search) {
  where.OR = [
    { assetTag:     { contains: search, mode: 'insensitive' } },
    { name:         { contains: search, mode: 'insensitive' } },
    { serialNumber: { contains: search, mode: 'insensitive' } },
    { description:  { contains: search, mode: 'insensitive' } },
    { notes:        { contains: search, mode: 'insensitive' } },
    { poNumber:     { contains: search, mode: 'insensitive' } },
  ];
}
```

**Currently searched fields (direct columns):** `assetTag`, `name`, `serialNumber`, `description`, `notes`, `poNumber`

**Not currently searched:** `barcode`, and all relation fields (model number, brand name, vendor name, assigned user name/email).

---

### 1.3 Current WHERE clause — `InventoryService.search` (typeahead)

File: `backend/src/services/inventory.service.ts`  
Lines 305–322 (separate concern — typeahead autocomplete):

```typescript
const where: Prisma.equipmentWhereInput = {
  OR: [
    { assetTag:     { startsWith: q, mode: 'insensitive' } },
    { assetTag:     { contains:   q, mode: 'insensitive' } },
    { name:         { contains:   q, mode: 'insensitive' } },
    { serialNumber: { contains:   q, mode: 'insensitive' } },
  ],
};
```

> **Note:** The typeahead endpoint is a narrow, performance-sensitive query (limit 10, startsWith priority).
> It is **out of scope** for this enhancement — its narrow field set is intentional.

---

### 1.4 Frontend search inputs — current placeholder text

| File | Line | Context | Current placeholder |
|------|------|---------|---------------------|
| `frontend/src/pages/InventoryManagement.tsx` | 486 | Desktop `<input>` | `"Asset tag, name, serial number..."` |
| `frontend/src/pages/InventoryManagement.tsx` | 423 | Mobile `MobileFilterBar` | `"Asset tag, name, serial number..."` |
| `frontend/src/pages/DisposedEquipment.tsx` | 409 | Desktop `<input>` | `"Asset tag, name, serial number..."` |
| `frontend/src/pages/DisposedEquipment.tsx` | 331 | Mobile `MobileFilterBar` | `"Asset tag, name, serial #..."` |
| `frontend/src/pages/EquipmentSearch.tsx` | 564 | Desktop `<input>` | `"Asset tag, name, serial number, PO number..."` |
| `frontend/src/pages/EquipmentSearch.tsx` | 421 | Mobile `MobileFilterBar` | `"Asset tag, name, serial #, PO..."` |

The desktop label in `EquipmentSearch.tsx` (line 562) also reads: `"Search by tag, name, or serial"` — this will also need updating.

---

## 2. Equipment Model — All Available String Fields

From `backend/prisma/schema.prisma` (lines 47–120):

| Field | Type | Notes | Search candidate? |
|-------|------|-------|-------------------|
| `assetTag` | `String` (unique) | ✅ already searched | Yes |
| `serialNumber` | `String?` | ✅ already searched | Yes |
| `name` | `String` | ✅ already searched | Yes |
| `description` | `String?` | ✅ already searched | Yes |
| `notes` | `String?` | ✅ already searched | Yes |
| `poNumber` | `String?` | ✅ already searched | Yes |
| `barcode` | `String?` (unique) | Not searched — useful for barcode-scanner lookups | **Add** |
| `condition` | `String?` | Low value for keyword search (e.g. "good", "fair") | Skip |
| `disposedReason` | `String?` | Low value for keyword search | Skip |
| `maintenanceSchedule` | `String?` | Low value for keyword search | Skip |
| `fundingSource` | `String?` | Legacy plain-text field; filtering via FK is preferred | Skip |
| `status` | `String` | Categorical — use the `status` filter dropdown | Skip |

### Relation fields worth searching

| Relation | Prisma relation name | Field to search | Prisma path |
|----------|---------------------|-----------------|-------------|
| Brand | `brands` | `name` | `{ brands: { is: { name: { contains: …, mode: 'insensitive' } } } }` |
| Model | `models` | `name` | `{ models: { is: { name: { contains: …, mode: 'insensitive' } } } }` |
| Model | `models` | `modelNumber` | `{ models: { is: { modelNumber: { contains: …, mode: 'insensitive' } } } }` |
| Vendor | `vendor` | `name` | `{ vendor: { is: { name: { contains: …, mode: 'insensitive' } } } }` |
| Assigned user | `assignedToUser` | `displayName` | `{ assignedToUser: { is: { displayName: { contains: …, mode: 'insensitive' } } } }` |
| Assigned user | `assignedToUser` | `email` | `{ assignedToUser: { is: { email: { contains: …, mode: 'insensitive' } } } }` |

> **Note on `officeLocation`/`room`/`locations`:** These are already filterable via their dedicated dropdown filters. Adding them to the text search OR clause would produce confusing results (e.g., searching "Smith" would return all equipment at a school called "Smith Elementary"). Skip — use the existing FK dropdown filters for location.

---

## 3. Problem Definition

Users cannot find equipment by model number, brand name, vendor name, barcode, or assigned user name using the single search box. Searching for "CHROMEBOOK 314" (model name), "HP" (brand), "CDW" (vendor), or "John Smith" (assigned user) returns no results today even though the data exists. This forces users to fall back to multiple dropdown filters when a single keyword should be sufficient.

---

## 4. Proposed Solution

### 4.1 Backend — expand the OR clause in `InventoryService.findAll`

**File:** `backend/src/services/inventory.service.ts`  
**Change:** Replace lines 90–96 (the existing `where.OR = [...]` block) with an expanded version:

```typescript
if (search) {
  where.OR = [
    { assetTag:     { contains: search, mode: 'insensitive' } },
    { name:         { contains: search, mode: 'insensitive' } },
    { serialNumber: { contains: search, mode: 'insensitive' } },
    { description:  { contains: search, mode: 'insensitive' } },
    { notes:        { contains: search, mode: 'insensitive' } },
    { poNumber:     { contains: search, mode: 'insensitive' } },
    { barcode:      { contains: search, mode: 'insensitive' } },
    { brands:       { is: { name:        { contains: search, mode: 'insensitive' } } } },
    { models:       { is: { name:        { contains: search, mode: 'insensitive' } } } },
    { models:       { is: { modelNumber: { contains: search, mode: 'insensitive' } } } },
    { vendor:       { is: { name:        { contains: search, mode: 'insensitive' } } } },
    { assignedToUser: { is: { displayName: { contains: search, mode: 'insensitive' } } } },
    { assignedToUser: { is: { email:       { contains: search, mode: 'insensitive' } } } },
  ];
}
```

This is the **only backend change required**. The existing `fundingSourceId` AND-merge logic below line 96 is unaffected — it checks `where.OR` before replacing it with `where.AND`, and that logic remains correct.

### 4.2 Frontend — update placeholder text only

No new UI elements. The same single search box is used; only the placeholder/label text needs to be updated to communicate the expanded search scope.

| File | Line | Element | Old text | New text |
|------|------|---------|----------|----------|
| `frontend/src/pages/InventoryManagement.tsx` | 486 | Desktop `placeholder` | `"Asset tag, name, serial number..."` | `"Asset tag, name, serial #, model, brand, vendor, PO#, barcode..."` |
| `frontend/src/pages/InventoryManagement.tsx` | 423 | Mobile `searchPlaceholder` | `"Asset tag, name, serial number..."` | `"Asset tag, serial #, model, brand, PO#..."` |
| `frontend/src/pages/DisposedEquipment.tsx` | 409 | Desktop `placeholder` | `"Asset tag, name, serial number..."` | `"Asset tag, name, serial #, model, brand, vendor, PO#, barcode..."` |
| `frontend/src/pages/DisposedEquipment.tsx` | 331 | Mobile `searchPlaceholder` | `"Asset tag, name, serial #..."` | `"Asset tag, serial #, model, brand, PO#..."` |
| `frontend/src/pages/EquipmentSearch.tsx` | 564 | Desktop `placeholder` | `"Asset tag, name, serial number, PO number..."` | `"Asset tag, name, serial #, model, brand, vendor, PO#, barcode, assigned user..."` |
| `frontend/src/pages/EquipmentSearch.tsx` | 562 | Desktop `<label>` | `"Search by tag, name, or serial"` | `"Search by tag, name, serial, model, brand, vendor, or user"` |
| `frontend/src/pages/EquipmentSearch.tsx` | 421 | Mobile `searchPlaceholder` | `"Asset tag, name, serial #, PO..."` | `"Asset tag, serial #, model, brand, PO#, user..."` |

---

## 5. Implementation Steps

1. **Edit `backend/src/services/inventory.service.ts`** — replace the `where.OR` block (lines 90–96) with the expanded 13-condition version above.
2. **Edit `frontend/src/pages/InventoryManagement.tsx`** — update 2 placeholder strings (lines 486, 423).
3. **Edit `frontend/src/pages/DisposedEquipment.tsx`** — update 2 placeholder strings (lines 409, 331).
4. **Edit `frontend/src/pages/EquipmentSearch.tsx`** — update 2 placeholder strings + 1 label (lines 564, 421, 562).

**Total files changed: 4** (1 backend, 3 frontend)  
**New dependencies: none**  
**Migrations: none** (no schema changes)

---

## 6. Files to Change (Summary)

| File | Lines affected | Change type |
|------|---------------|-------------|
| `backend/src/services/inventory.service.ts` | 90–96 | Expand OR clause (7 → 13 conditions) |
| `frontend/src/pages/InventoryManagement.tsx` | 423, 486 | Update placeholder strings |
| `frontend/src/pages/DisposedEquipment.tsx` | 331, 409 | Update placeholder strings |
| `frontend/src/pages/EquipmentSearch.tsx` | 421, 562, 564 | Update placeholder strings + label |

---

## 7. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Slightly slower queries due to more OR conditions | Low | PostgreSQL's query planner handles multi-OR on indexed and unindexed cols efficiently at this scale; the relation joins are nullable and skipped automatically when FK is NULL |
| `fundingSourceId` AND-merge logic broken | Very low | The existing code at line 98 checks `if (where.OR)` before creating an `AND` — the new OR array is still under the same `where.OR` key, so the merge logic is unaffected |
| Typeahead endpoint unintentionally widened | None | The `search` method (typeahead) is a separate code path (`InventoryService.search`) — this change only modifies `InventoryService.findAll` |
| Prisma relation filter syntax error | Low | Use `{ is: { … } }` for nullable one-to-one/many-to-one relations in Prisma 7; this is the correct API for optional FK relations on `equipment` (brand, model, vendor, assignedToUser are all optional FKs) |

---

## 8. Out of Scope

- Typeahead (`GET /api/inventory/search`) — intentionally narrow; no change.
- Location/room/officeLocation text search — covered by existing dropdown filters.
- `condition`, `disposedReason`, `maintenanceSchedule`, `fundingSource` (legacy string) — low search value; skip.
- Full-text search (PostgreSQL `tsvector`) — not warranted at current scale; `contains + insensitive` is adequate.
- Any new UI components, filter fields, or API endpoints.
