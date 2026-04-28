# Requisition Form Gap Analysis
**Date:** 2026-03-11  
**Analyst:** Research Subagent  
**Files Analyzed:** RequisitionWizard.tsx, purchaseOrder.types.ts, purchaseOrder.validators.ts, purchaseOrder.service.ts, schema.prisma, referenceData.routes.ts, location.routes.ts, referenceData.controller.ts, PurchaseOrderDetail.tsx, newRequisition.php

---

## 1. Summary

The current `RequisitionWizard` is a 3-step form that covers most legacy fields but has **two critical functional gaps** that will block usability:

1. **No "Shipping Destination" dropdown** — The `officeLocationId` field exists in the schema, validator, and service but is **never populated by the wizard UI**. The legacy form drove this through a school-name dropdown tied to the `school` table; the new equivalent is `GET /api/locations`.
2. **No vendor contact info display panel** — The legacy auto-populated Address, City, State, Zip, Phone, and Fax read-only fields when a company was selected. The wizard shows only the vendor name and sends no address info to the server (by design, since the new system is FK-based), but users need a visual confirmation of vendor details.

---

## 2. Complete Gap Analysis Table

| Legacy Field | Current Wizard | Status | Priority |
|---|---|---|---|
| **Program or Department Name** | `program` field (Step 1, labeled "Program / Account") | Present — minor label difference | OPTIONAL |
| **Company Name (dropdown)** | Vendor Autocomplete (Step 1, fetches `/api/vendors`) | Present | ✅ No Gap |
| **Vendor Address auto-populate (Address, City, State, Zip)** | **NOT implemented** — vendor address fields are never displayed | **GAP** | CRITICAL |
| **Vendor Phone auto-populate** | **NOT implemented** | **GAP** | CRITICAL |
| **Vendor Fax auto-populate** | **NOT implemented** | **GAP** | RECOMMENDED |
| **Line Items — Description** | Present (Step 2, required) | ✅ No Gap | — |
| **Line Items — Qty** | Present (Step 2, required) | ✅ No Gap | — |
| **Line Items — Unit Price** | Present (Step 2, required) | ✅ No Gap | — |
| **Line Items — Item/Model Number** | Present (Step 2, "Model / Part #" column) | ✅ No Gap (different label, same field) | — |
| **Item number auto-increment display** | Present (Review step shows `#` column 1..n) | ✅ No Gap | — |
| **Estimated Shipping Cost** | Present (Step 1, "Shipping Cost ($)") | ✅ No Gap | — |
| **Shipping Destination (location dropdown)** | `shipTo` is a **free-text field** only. `officeLocationId` exists in schema/validator/service but wizard **never sends it** | **GAP** | CRITICAL |
| **Additional Information / Notes** | `notes` field (Step 1, "Notes / Special Instructions") | ✅ No Gap | — |
| **Title / Description** | Present (Step 1, required) — new field not in legacy | Extra field (improvement) | — |
| **Vendor required validation** | Vendor is **optional** in new wizard; legacy required company | Different behavior — new system intentionally allows draft without vendor | OPTIONAL |

---

## 3. Detailed Analysis by Category

### 3.1 Vendor Auto-Populate

**Legacy behavior** (`newRequisition.php` lines ~250–420):  
When a company is selected from the dropdown, the form submits via `onChange="newEntry(this,this.form)"`, the PHP re-renders with the vendor's `company_address`, `company_city`, `company_state`, `company_zip`, `company_phone`, `company_fax` fields pre-filled in separate editable text inputs. These values are then submitted with the form and stored **denormalized** directly on the requisition record.

**Current system behavior:**  
- The wizard fetches vendors from `GET /api/vendors` (route: `referenceData.routes.ts` line 35)
- The `getVendors` controller (`referenceData.controller.ts` line 98) does `prisma.vendors.findMany(...)` with **no select projection** — meaning the full vendor object is returned, including: `id`, `name`, `contactName`, `email`, `phone`, `address`, `city`, `state`, `zip`, `fax`, `website`, `isActive`
- The wizard's `VendorOption` interface (`RequisitionWizard.tsx` line 46) only captures `{ id: string; name: string }` — all address/contact fields are discarded on the client
- The DB schema uses a FK (`vendorId`) rather than denormalizing — this is the correct architecture
- **There is NO read-only vendor info panel displayed after vendor selection**

**Vendor fields available in API response:**

| Field | DB Column | Type |
|---|---|---|
| id | id | String |
| name | name | String (unique) |
| contactName | contactName | String? |
| email | email | String? |
| phone | phone | String? |
| address | address | String? |
| city | city | String? |
| state | state | String? |
| zip | zip | String? |
| fax | fax | String? |
| website | website | String? |
| isActive | isActive | Boolean |

All fields are present in the `vendors` schema (`schema.prisma` line 488–504) and are mapped in the `POVendor` TypeScript interface (`purchaseOrder.types.ts` lines 64–76).

---

### 3.2 Shipping Destination

**Legacy behavior** (`newRequisition.php` lines ~502–525):  
A `<select name="shipto">` dropdown populated with `SELECT school_name FROM school`. Defaults to `$_SESSION['school']` (user's current school). Value is stored as the string `requisition_shipto` directly on the record.

**Current system:**  
- DB schema: `purchase_orders` has **two** related fields:
  - `shipTo String?` (line 358) — free text delivery address
  - `officeLocationId String?` (line 361) — FK to `OfficeLocation` model
- Zod validator (`purchaseOrder.validators.ts` line 112): `officeLocationId: z.string().uuid().optional().nullable()` — accepted
- Service (`purchaseOrder.service.ts` line 141): `officeLocationId: data.officeLocationId ?? null` — stored correctly
- TypeScript input type (`purchaseOrder.types.ts` line 225): `officeLocationId?: string | null` — present
- **Wizard UI: The `officeLocationId` field is NEVER populated.** The wizard only has a free-text `shipTo` input. There is no `<select>` or `<Autocomplete>` for office locations.

**Location endpoint:**  
- Route: `GET /api/locations` (`location.routes.ts` line 27)
- Controller: `locationController.getOfficeLocations`
- Returns `OfficeLocation[]` with fields: `id`, `name`, `code`, `type`, `address`, `phone`, `isActive`, `city`, `state`, `zip`
- No auth permission level required beyond basic authentication

---

### 3.3 Backend/Schema Completeness

| Component | Assessment |
|---|---|
| `purchase_orders` model | **Complete** — has all required fields: `description` (title), `vendorId`, `shipTo`, `shippingCost`, `notes`, `program`, `officeLocationId`, `amount`, `status` |
| `po_items` model | **Complete** — has `lineNumber`, `model`, `description`, `quantity`, `unitPrice`, `totalPrice` |
| `CreatePurchaseOrderSchema` (Zod) | **Complete** — accepts all fields including `officeLocationId` |
| `createPurchaseOrder` service | **Complete** — stores all fields, computes `amount` correctly, creates items in transaction |
| `getVendors` endpoint | **Complete** — returns full vendor objects with all address/contact fields |
| `getOfficeLocations` endpoint | **Complete** — returns office location list for dropdown use |

The backend/schema layer is **fully implemented**. All gaps are in the frontend wizard only.

---

### 3.4 Step Division & UX Analysis

**Is the wizard UX justified?**  
Yes — the 3-step split is reasonable for this form. Line items can grow long and mixing them inline with header fields creates a cluttered single page, particularly on tablets (the primary device in the legacy system). The Review step provides a valuable confirmation checkpoint before submission.

**Current step division:**
- Step 1 (Details): title, vendor, shipTo, shippingCost, program, notes — **6 fields, no location dropdown**
- Step 2 (Line Items): dynamic table — good
- Step 3 (Review): read-only summary — good

**Recommended improvements to step division:**

Step 1 should be reorganized as:
1. **Requestor section:** Program / Department Name (required field separate from title)
2. **Vendor section:** Company dropdown → read-only contact info panel below it when selected
3. **Shipping section:** Shipping Destination dropdown (officeLocationId, from `/api/locations`) + optional free-text Ship To override + Shipping Cost

Step 2 (Line Items): no changes needed.  
Step 3 (Review): add vendor address and location name to the summary.

The **single-page approach** from the legacy is NOT recommended for the re-write because:
- The legacy form required a full-page POST round-trip to auto-populate vendor fields (no JavaScript AJAX)
- The new system can do vendor auto-populate via client-side state (no page reload needed)
- The line items table plus all header fields on one page would be unwieldy for large orders

---

## 4. Complete List of Changes Required

### CRITICAL — Blocks parity / usability

#### C-1: Add Shipping Destination dropdown (officeLocationId) to Step 1
**File:** `c:\Tech-V2\frontend\src\pages\PurchaseOrders\RequisitionWizard.tsx`  
**Currently:** `shipTo` is a free-text `<TextField>` only (line ~268)  
**Change:** Add a `useQuery` that fetches `GET /api/locations` and renders an `<Autocomplete>` for `officeLocationId`. Optionally, when a location is selected, auto-fill the `shipTo` text field with the location's name/address as a default that the user can override.  
**Backend endpoint:** `GET /api/locations` (already exists, `location.routes.ts` line 27)  
**Schema field:** `officeLocationId` already in `CreatePurchaseOrderSchema` and `CreatePurchaseOrderInput`  
**Payload change:** `buildPayload()` at line ~145 needs `officeLocationId: selectedLocation?.id ?? null`

#### C-2: Add vendor contact info read-only display panel
**File:** `c:\Tech-V2\frontend\src\pages\PurchaseOrders\RequisitionWizard.tsx`  
**Currently:** `VendorOption` interface (line 46) only stores `{ id, name }`. After vendor selection, no contact info is shown.  
**Change:**
1. Expand `VendorOption` to include `address`, `city`, `state`, `zip`, `phone`, `fax` (or create a `VendorFull` interface)
2. After vendor `Autocomplete` selection, render a read-only info grid (e.g., MUI `Paper` with grey background) showing: Address, City/State/Zip, Phone, Fax
3. These fields are informational only — they are NOT submitted in the payload (the system stores `vendorId` FK, not the denormalized fields)

---

### RECOMMENDED — Improves parity with legacy

#### R-1: Rename "Program / Account" to "Program or Department Name"
**File:** `c:\Tech-V2\frontend\src\pages\PurchaseOrders\RequisitionWizard.tsx` line ~279  
**Change:** Update `label="Program / Account"` → `label="Program or Department Name"`  
**Also:** Review Step label at line ~425

#### R-2: Add officeLocationId display to Review step
**File:** `c:\Tech-V2\frontend\src\pages\PurchaseOrders\RequisitionWizard.tsx` lines ~424–440  
**Change:** Add "Shipping Destination" row using `selectedLocation?.name` in the review grid

#### R-3: Add officeLocation to PurchaseOrderDetail vendor/shipping section
**File:** `c:\Tech-V2\frontend\src\pages\PurchaseOrders\PurchaseOrderDetail.tsx`  
**Change:** The detail view already receives `po.officeLocation` (the service includes it). Verify it is displayed in the detail panel — if not, add `officeLocation.name` display.

#### R-4: Add vendor full details to detail view
**File:** `c:\Tech-V2\frontend\src\pages\PurchaseOrders\PurchaseOrderDetail.tsx`  
**Context:** The `getPurchaseOrder` service includes vendors with full fields (`select: { id, name, email, phone, address, city, state, zip }`). The detail view should display vendor address/phone if available.

---

### OPTIONAL — Nice to have

#### O-1: Consider making vendor selection required when submitting (not just drafting)
**File:** `c:\Tech-V2\frontend\src\pages\PurchaseOrders\RequisitionWizard.tsx`  
**Change:** The `handleSaveAndSubmit` flow could validate `selectedVendor !== null` before submitting. The legacy required vendor selection.

#### O-2: Add "NEW" vendor shortcut
**Legacy behavior:** Selecting "NEW" from company dropdown opened `newCompany.php` in a popup  
**New equivalent:** A small "+" icon button next to the vendor Autocomplete that opens a modal/drawer for quick vendor creation

#### O-3: Add line item count display in step stepper
**Change:** Show "(n items)" in the Step 2 label when navigating to Step 3 for quick reference

#### O-4: Persist form state across navigation
**Currently:** If user navigates away and returns (browser back, route change), all wizard state is lost  
**Change:** Use `sessionStorage` or a Zustand slice to persist in-progress wizard data

---

## 5. Specific File Locations for Each Change

| Change | File | Lines |
|---|---|---|
| C-1: Add location dropdown | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | ~46 (types), ~86 (queries), ~145 (buildPayload), ~268 (JSX Step 1) |
| C-2: Add vendor info panel | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | ~46 (VendorOption type), ~250 (Autocomplete onChange), ~255 (new panel JSX) |
| R-1: Rename program label | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | ~279 |
| R-2: Add officeLocation to Review | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | ~425 |
| R-3: Verify officeLocation in Detail | `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | ~200+ |
| R-4: Add vendor address to Detail | `frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx` | ~200+ |
| O-1: Require vendor on submit | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | ~157 (handleSaveAndSubmit) |

---

## 6. Wizard vs Single Page Recommendation

**Recommendation: Keep the 3-step wizard, but reorganize Step 1.**

**Rationale:**
- The legacy single-page form required a full server round-trip to auto-populate vendor fields (the entire page reloaded on company select). This was a UX limitation of PHP, not a desirable design.
- The wizard's Review step is genuinely superior to the legacy form — it lets users verify the total, line items, and vendor before committing.
- The wizard is easier to extend with future approval-level fields without cluttering the input form.

**Recommended Step 1 reorganization:**
```
Section 1: Order Info
  - Program or Department Name (required)
  - Title / Description (required)

Section 2: Vendor
  - Company [Autocomplete from /api/vendors]
  - [Read-only panel: Address, City/State/Zip, Phone, Fax — shows when vendor selected]

Section 3: Shipping
  - Shipping Destination [Autocomplete from /api/locations, sets officeLocationId]
  - Ship To Address (optional free-text override)
  - Estimated Shipping Cost

Section 4: Notes
  - Additional Information / Notes
```

---

## 7. Exact Vendor Fields Returned by API

`GET /api/vendors` returns `{ items: VendorFull[], total, page, limit, totalPages }` where each item has:

```typescript
{
  id: string;
  name: string;          // unique
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  fax: string | null;
  website: string | null;
  isActive: boolean;
  createdAt: string;     // ISO datetime
  updatedAt: string;
}
```

These match the `POVendor` interface in `purchaseOrder.types.ts` (lines 64–76). The wizard only extracts `id` and `name` — all address/contact fields are available but unused.

---

## 8. Exact Location Endpoint for Shipping Destination Dropdown

**Endpoint:** `GET /api/locations`  
**Route file:** `backend/src/routes/location.routes.ts` line 27  
**Auth:** Requires authentication only (no permission level check)  
**Returns:** Array of `OfficeLocation` objects with:

```typescript
{
  id: string;
  name: string;        // unique — display label
  code: string | null; // short code
  type: string;        // e.g., "school", "office"
  address: string | null;
  phone: string | null;
  isActive: boolean;
  city: string | null;
  state: string | null;
  zip: string | null;
}
```

**Recommended usage in wizard:**
```typescript
const { data: locationData } = useQuery({
  queryKey: ['locations'],
  queryFn: async () => {
    const res = await api.get<{ items: LocationOption[] }>('/locations');
    return res.data.items ?? [];
  },
  staleTime: 10 * 60 * 1000,
});
```

Filter by `isActive: true` if the endpoint supports it (location controller should be checked for query params).

---

## 9. Prioritized Implementation Order

1. **[CRITICAL] C-1** — Add Shipping Destination dropdown (`officeLocationId`). This field is already wired through the entire stack (schema → validator → service → type) but has zero UI. One `useQuery` + one `<Autocomplete>` in Step 1 closes this gap completely.

2. **[CRITICAL] C-2** — Add vendor contact info display panel. Extend `VendorOption` type, add conditional `<Paper>` in Step 1 JSX below the vendor autocomplete.

3. **[RECOMMENDED] R-2** — Add `officeLocation.name` to the Review step summary.

4. **[RECOMMENDED] R-1** — Rename "Program / Account" label.

5. **[RECOMMENDED] R-3/R-4** — Verify and improve `PurchaseOrderDetail.tsx` to display vendor address and office location name.

---

## 10. Architecture Notes

### Legacy vs New: Vendor Data Storage
- **Legacy:** Stored vendor address/city/state/zip/phone/fax **directly on the requisition** (denormalized). This means historical requisitions preserved vendor data even if the vendor record changed.
- **New system:** Stores `vendorId` FK only. If a vendor's address changes, historical POs will reflect the new address when displayed. This is a deliberate trade-off; the display of vendor info on `PurchaseOrderDetail` should note the vendor's current address.
- **Recommendation:** No schema change needed. For audit purposes, the current vendor snapshot is acceptable since vendors rarely change.

### shipTo vs officeLocationId
The schema has both:
- `shipTo String?` — free text (can be any address, e.g., "John's basement")
- `officeLocationId String?` — FK to `OfficeLocation` (structured location)

These are complementary. Recommended UX: selecting an `OfficeLocation` from the dropdown auto-fills `shipTo` with `location.name` (editable override), AND stores `officeLocationId`. This gives both structured data (for filtering/reporting by location) and a human-readable text label for the PDF.

### No Schema or Backend Changes Required
All changes for C-1 and C-2 are **frontend only**. The backend already has everything needed.
