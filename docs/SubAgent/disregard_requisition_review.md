# Disregard Requisition — Implementation Review

**Date:** 2026-03-24  
**Reviewer:** GitHub Copilot  
**File Reviewed:** `c:\Tech-V2\frontend\src\pages\PurchaseOrders\RequisitionWizard.tsx`  
**Spec Reference:** `c:\Tech-V2\docs\SubAgent\disregard_requisition_spec.md`

---

## Overall Assessment: NEEDS_REFINEMENT

The core feature is functionally implemented and TypeScript-clean, but the button placement deviates from the spec (visible on all steps instead of only Step 2/Review), and two minor accessibility attributes are missing from the Dialog.

---

## Build Result

```
npx tsc --noEmit → PASS (exit 0, no TypeScript errors)
```

---

## Checklist Results

| # | Requirement | Result | Notes |
|---|-------------|--------|-------|
| 1 | `disregardDialogOpen` state declared | ✅ PASS | `~line 135`: `const [disregardDialogOpen, setDisregardDialogOpen] = useState(false)` |
| 2 | `handleDisregardClick` function exists and is correct | ✅ PASS | Sets `disregardDialogOpen(true)` |
| 3 | `handleDisregardConfirm` function exists and is correct | ✅ PASS | Closes dialog, navigates to `/purchase-orders` |
| 4 | Disregard button (`color="error"`, `variant="outlined"`) present | ⚠️ PARTIAL | Button exists but shows on **all steps** (0, 1, 2) — spec requires **Step 2 (Review) only** |
| 5 | Button placement visually consistent | ⚠️ DEVIATION | Button is in the **left-side** box alongside Back/Cancel; spec places it in the right-side box next to Save as Draft |
| 6 | Confirmation Dialog JSX present | ✅ PASS | Title, message, Cancel, and Disregard action buttons all present |
| 7 | Dialog title text correct | ✅ PASS | "Disregard Requisition?" |
| 8 | Dialog message text correct | ✅ PASS | "All entered data will be lost." (minor wording improvement over spec's "All data will be lost") |
| 9 | MUI Dialog imports present | ✅ PASS | `Dialog`, `DialogTitle`, `DialogContent`, `DialogContentText`, `DialogActions` all in import block |
| 10 | No TypeScript errors | ✅ PASS | `get_errors` reports no errors; `tsc --noEmit` exits 0 |
| 11 | Save as Draft still intact | ✅ PASS | Unchanged in Step 2 right-side box |
| 12 | Submit for Approval still intact | ✅ PASS | Unchanged in Step 2 right-side box |
| 13 | Back/Cancel still intact | ✅ PASS | Unchanged in left-side box |
| 14 | `aria-labelledby` on `<Dialog>` | ❌ MISSING | Spec requires `aria-labelledby="disregard-dialog-title"` |
| 15 | `id` on `<DialogTitle>` | ❌ MISSING | Spec requires `id="disregard-dialog-title"` |
| 16 | `autoFocus` on Disregard action button | ❌ MISSING | Spec requires `autoFocus` for keyboard accessibility |

---

## Issues Found

### Issue 1 — CRITICAL: Disregard button visible on all wizard steps

**Spec requirement (Section 4.1, 4.6):** Button should be visible on **Step 3 (Review) only**.

**Current implementation:** The button is placed in the left-side `<Box>` *outside* any `{activeStep === 2 && ...}` guard, so it appears on Steps 0 (Details), 1 (Line Items), and 2 (Review).

**Fix required:** Wrap the Disregard button in `{activeStep === 2 && (...)}` or move it inside the existing `{activeStep === 2 && (<> ... </>)}` block in the right-side box.

**Current code (~lines 817–826):**
```tsx
<Box sx={{ display: 'flex', gap: 1 }}>
  <Button
    onClick={activeStep === 0 ? () => navigate('/purchase-orders') : handleBack}
    disabled={isSaving}
    variant="outlined"
  >
    {activeStep === 0 ? 'Cancel' : 'Back'}
  </Button>
  <Button
    variant="outlined"
    color="error"
    onClick={handleDisregardClick}
    disabled={isSaving}
  >
    Disregard Requisition
  </Button>
</Box>
```

**Correct per spec:** Move to right-side box, inside `activeStep === 2` block:
```tsx
{activeStep === 2 && (
  <>
    <Button
      variant="outlined"
      color="error"
      onClick={handleDisregardClick}
      disabled={isSaving}
    >
      Disregard Requisition
    </Button>
    <Button variant="outlined" onClick={handleSaveDraft} disabled={isSaving}>
      {isSaving ? <CircularProgress size={20} /> : 'Save as Draft'}
    </Button>
    <Button variant="contained" color="primary" onClick={handleSaveAndSubmit} disabled={isSaving}>
      {isSaving ? <CircularProgress size={20} /> : 'Submit for Approval'}
    </Button>
  </>
)}
```

---

### Issue 2 — MINOR: Missing accessibility attributes on Dialog

**Spec requirement (Section 4.5):**
```tsx
<Dialog
  open={disregardDialogOpen}
  onClose={() => setDisregardDialogOpen(false)}
  aria-labelledby="disregard-dialog-title"
>
  <DialogTitle id="disregard-dialog-title">Disregard Requisition?</DialogTitle>
```

**Current implementation:** `aria-labelledby` and `id` attributes are absent.

**Impact:** Reduced screen-reader accessibility (dialog title is not programmatically associated with the dialog element).

---

### Issue 3 — MINOR: Missing `autoFocus` on Disregard action button

**Spec requirement (Section 4.5):**
```tsx
<Button color="error" variant="contained" onClick={handleDisregardConfirm} autoFocus>
  Disregard
</Button>
```

**Current implementation:** `autoFocus` prop is absent. Without it, keyboard users must manually tab to the button after the dialog opens; with it, focus moves immediately to the primary action.

---

## Summary

| Category | Count |
|----------|-------|
| Critical issues | 1 |
| Minor issues | 2 |
| Passing checks | 13 |
| TypeScript errors | 0 |

**Required before acceptance:** Fix Issue 1 (button visible on all steps).  
**Recommended:** Fix Issues 2 and 3 for accessibility compliance.
