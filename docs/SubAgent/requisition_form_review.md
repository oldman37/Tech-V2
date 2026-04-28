# Requisition Form Review — RequisitionWizard.tsx
**Date:** 2026-03-11  
**Reviewer:** Review Subagent  
**Source:** `c:\Tech-V2\frontend\src\pages\PurchaseOrders\RequisitionWizard.tsx`  
**Gap Analysis Ref:** `c:\Tech-V2\docs\SubAgent\requisition_form_gap_analysis.md`

---

## Overall Assessment: ✅ PASS

**Grade: A-**  
Both CRITICAL gaps (C-1, C-2) are fully implemented. TypeScript compiles clean. All payload fields are present. Code quality is high with minor UX ordering concern.

---

## 1. Build Validation

**Command:** `cd c:\Tech-V2\frontend && npx tsc --noEmit`  
**Exit Code:** `0`  
**Output:** *(empty — no errors, no warnings)*

**Result: ✅ CLEAN BUILD**

---

## 2. C-1: Shipping Destination (officeLocationId)

| Check | Result |
|---|---|
| Locations query uses correct endpoint `GET /api/locations` | ✅ Pass — `api.get<LocationOption[]>('/locations')` |
| API response shape matches | ✅ Pass — endpoint returns direct array; typed as `LocationOption[]` |
| `officeLocationId` included in `buildPayload()` | ✅ Pass — `officeLocationId: selectedLocationId ?? null` (line ~171) |
| Selecting a location auto-populates `shipTo` | ✅ Pass — `onChange` handler finds `loc` and calls `setShipTo(loc.name)` |
| Dropdown shows all available locations | ✅ Pass — maps full `locationOptions` array to `MenuItem` elements |
| State initialized and typed correctly | ✅ Pass — `useState<string \| null>(null)`, `value={selectedLocationId ?? ''}` handles MUI Select requirement |

**C-1 Result: FULLY IMPLEMENTED**

---

## 3. C-2: Vendor Info Panel

| Check | Result |
|---|---|
| `VendorOption` expanded with address fields | ✅ Pass — includes `address`, `city`, `state`, `zip`, `phone`, `fax`, `contactName`, `email` |
| Panel only shows when vendor is selected | ✅ Pass — `{selectedVendor && (<Box ...>)}` conditional render |
| Null/undefined fields produce no output | ✅ Pass — each field wrapped in `{selectedVendor.fieldName && (<Box>)}` guard |
| "Please verify..." helper text present | ✅ Pass — on Autocomplete `renderInput` helperText (line ~284) |
| Clearing vendor hides panel | ✅ Pass — `onChange={(_, v) => setSelectedVendor(v)}` sets to `null` on clear |
| City/State/Zip concatenated correctly | ✅ Pass — `[city, state, zip].filter(Boolean).join(', ')` prevents "undefined" strings |

**C-2 Result: FULLY IMPLEMENTED**

---

## 4. Payload Check — `buildPayload()`

| Field | Present | Value Expression |
|---|---|---|
| `title` | ✅ | `title.trim()` |
| `vendorId` | ✅ | `selectedVendor?.id ?? null` |
| `officeLocationId` | ✅ | `selectedLocationId ?? null` |
| `shipTo` | ✅ | `shipTo.trim() \|\| null` |
| `notes` | ✅ | `notes.trim() \|\| null` |
| `program` | ✅ | `program.trim() \|\| null` |
| `shippingCost` | ✅ | `shippingCost ? Number(shippingCost) : null` |
| `items[]` | ✅ | Mapped with `lineNumber: index + 1`, strips `_key` |

**All 8 required fields confirmed present.**

---

## 5. Code Quality

| Check | Result |
|---|---|
| No `any` types | ✅ Pass — grep found zero TypeScript `any` annotations |
| No `console.log` statements | ✅ Pass — grep confirmed none |
| Null/undefined safety | ✅ Pass — all conditional renders use guard patterns |
| MUI components consistent | ✅ Pass — uses Alert, Autocomplete, Box, Button, CircularProgress, Divider, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stepper, Table family, TextField, Typography |
| TypeScript types correct | ✅ Pass — `tsc --noEmit` exits 0 |
| Error handling pattern | ⚠️ Minor — `err as { response?: ... }` uses type assertion; acceptable but a typed error guard would be stricter |

---

## 6. UX — Legacy Parity Check

| Legacy Feature | New Wizard | Status |
|---|---|---|
| School/location dropdown | `Select` for `officeLocationId` | ✅ Present |
| Vendor address auto-populate | Info panel on vendor select | ✅ Present |
| Vendor phone display | Shown in info panel | ✅ Present |
| Vendor fax display | Shown in info panel | ✅ Present |
| Contact name display | Shown in info panel (improvement over legacy) | ✅ Present |
| Program/Department Name | Present, label matches legacy | ✅ Present |
| Ship To field | Free-text, auto-filled from location | ✅ Present |
| Notes / Special Instructions | Multi-line, 2000 char limit | ✅ Present |
| Estimated Shipping Cost | Present | ✅ Present |
| Line items: Desc/Qty/Price/Model | Present in Step 2 | ✅ Present |
| Item totals | Running total + grand total | ✅ Present |
| Review before submit | Step 3 full summary | ✅ Present |
| Shipping Destination in Review | Shows location name from `locationOptions` lookup | ✅ Present |

---

## 7. Findings

### RECOMMENDED

#### R-1: Field Order in Step 1 — "Ship To" appears before "Shipping Destination" dropdown

**File:** [RequisitionWizard.tsx](../../frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx)  
**Details:** In the current layout, the "Ship To" free-text field (line ~303) renders **before** the "Shipping Destination" Select dropdown (~313). The auto-populate logic writes `loc.name` into `shipTo` when a location is chosen. If a user types into "Ship To" first and then picks a location, their text is silently overwritten.  
**Fix:** Swap the render order so the "Shipping Destination" dropdown appears first. The auto-populated "Ship To" text then reads as a confirmed editable value the user can optionally override.

```tsx
// BEFORE (current order):
<TextField label="Ship To" ... />        {/* line ~303 */}
<FormControl ...>                         {/* Shipping Destination Select */}

// AFTER (recommended order):
<FormControl ...>                         {/* Shipping Destination Select — pick location first */}
<TextField label="Ship To" ... />        {/* auto-filled, user can still override */}
```

---

### OPTIONAL

#### O-1: Vendor email not displayed in info panel
**Details:** `VendorOption.email` is typed and fetched, but not rendered in the vendor info panel. The `contactName` block is rendered but no corresponding `email` display block exists. Low impact (legacy did not show email), but the interface advertises the field.  
**Fix:** Add a conditional email block alongside `contactName`:
```tsx
{selectedVendor.email && (
  <Box>
    <Typography variant="caption" color="text.secondary">Email</Typography>
    <Typography variant="body2">{selectedVendor.email}</Typography>
  </Box>
)}
```

#### O-2: Review step does not display vendor address summary
**Details:** The Review step (Step 3) shows the vendor name only. Adding a condensed vendor address line below the vendor name would more closely mirror the legacy confirmaton page and help users catch wrong vendor selection before submission.

#### O-3: `tsc` error type assertions could use a helper
**Details:** The `err as { response?: { data?: { message?: string } } }` pattern is repeated in both `handleSaveDraft` and `handleSaveAndSubmit`. Extracting to a small helper (`extractApiError(err: unknown): string`) would reduce duplication and be more type-safe.

---

## 8. PurchaseOrderDetail.tsx Vendor Address Fix (R-3/R-4)

Verified separately:
- `po.vendors?.address` and `po.vendors?.phone` are conditionally rendered (lines 298–308) — ✅ implemented
- `po.officeLocation?.name` is conditionally rendered (lines 337–340) — ✅ implemented

No gaps remain in the detail view.

---

## Summary

| Area | Status |
|---|---|
| C-1 (Shipping Destination) | ✅ COMPLETE |
| C-2 (Vendor Info Panel) | ✅ COMPLETE |
| Build (tsc --noEmit) | ✅ CLEAN (exit 0) |
| Payload completeness | ✅ ALL 8 FIELDS PRESENT |
| Code quality | ✅ No any, no console.log, null-safe |
| Legacy parity | ✅ All CRITICAL gaps resolved |
| Recommended changes | 1 (field order swap) |
| Optional improvements | 3 |

**Assessment: PASS**  
**Grade: A-** *(minus for Ship To / Shipping Destination field order issue)*
