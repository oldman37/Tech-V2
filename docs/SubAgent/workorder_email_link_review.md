# Work Order Email Link — Implementation Review

**Date:** 2026-04-29  
**Reviewer:** Review Subagent  
**Scope:** "View Work Order" deep-link in work order assignment emails

---

## Checklist Results

| # | Item | Result |
|---|------|--------|
| 1 | TypeScript correctness | ✅ PASS |
| 2 | HTML email — link guard and URL formation | ✅ PASS (minor note) |
| 3 | No regressions to existing email content | ✅ PASS |
| 4 | Both call sites covered | ✅ PASS |
| 5 | `APP_URL` sourced from `process.env` | ✅ PASS |
| 6 | Coding style consistency | ✅ PASS |

**Overall: PASS**

---

## Detail

### 1. TypeScript Correctness — PASS

`sendWorkOrderAssigned` now accepts:
```ts
workOrder: {
  workOrderNumber: string;
  department: string;
  priority: string;
  locationName?: string | null;
  workOrderId?: string;          // ← new
}
```

`sendAssignmentEmail` has `workOrderId: string` as its first parameter and forwards it:
```ts
await sendWorkOrderAssigned(
  { workOrderNumber, department, priority, locationName: location?.name, workOrderId },
  assignee.email,
  reporterName,
);
```

The optional `?` on the object property is correct — it allows callers that don't supply an ID to compile cleanly. Because `sendAssignmentEmail` always receives a concrete `string` from the DB (`ticket.id` / `id`), the link will always be rendered in practice. No type errors.

---

### 2. HTML Email — PASS (minor note)

**Guard:** `${workOrder.workOrderId ? `...` : ''}` — correctly truthy-guarded.

**URL formation:** `${process.env.APP_URL}/work-orders/${workOrder.workOrderId}` — correct shape.

**Placement:** The button is inserted before the detail `<table>`, consistent with common email CTA conventions and matching the existing `locationName` guard pattern in the same template.

**Minor note:** `workOrderId` and `process.env.APP_URL` are embedded into the `href` attribute without passing through `escapeHtml()`. Every other dynamic value in this file (department label, priority, reporter name, location name) is escaped before HTML embedding. In practice this is safe because:
- `workOrderId` is a Prisma-generated CUID (alphanumeric + hyphens, no HTML special characters).
- `APP_URL` is an admin-controlled environment variable.

However, for strict consistency with the file's own security convention, both values should be escaped:
```ts
href="${escapeHtml(process.env.APP_URL ?? '')}/work-orders/${escapeHtml(workOrder.workOrderId)}"
```
This is a recommendation, not a blocking defect.

---

### 3. No Regressions — PASS

All pre-existing HTML is intact: subject line, heading, `deptColor` / `deptLabel` logic, the detail table (work order number, department, priority, conditional location row, reported-by), and the closing paragraph. Nothing was removed or reordered.

---

### 4. Both Call Sites Covered — PASS

| Location | Call | First arg (→ `workOrderId`) |
|---|---|---|
| `work-orders.service.ts` L429 | `this.sendAssignmentEmail(ticket.id, ...)` | `ticket.id` — Prisma record ID ✅ |
| `work-orders.service.ts` L599 | `this.sendAssignmentEmail(id, ...)` | `id` — route param resolved to DB record ✅ |

The fix lives in the shared `sendAssignmentEmail` helper, so both call sites benefit without modification. Both already passed `workOrderId` as the first positional argument before this change; the helper now forwards it to `sendWorkOrderAssigned`.

---

### 5. Security — PASS

`APP_URL` is read exclusively from `process.env.APP_URL` — no user input touches the URL construction. The `.env.example` correctly documents this variable (`APP_URL="https://your-app-domain.com"`). The production `.env` value `https://tech.ocboe.com` is a well-formed HTTPS URL. No injection vector exists.

---

### 6. Style Consistency — PASS

- Optional field `workOrderId?: string` mirrors the existing `locationName?: string | null` field directly above it in the same type literal.
- The conditional template literal pattern `${condition ? `...` : ''}` matches the identical pattern used for the location row three lines below.
- Inline CSS button styling (padding, border-radius, `font-weight:bold`) is consistent with the rest of the file's email design.
- No trailing whitespace, no extra blank lines, no deviation from surrounding indentation.

---

## Summary

The implementation is correct and complete. The only finding is a minor inconsistency: `workOrderId` and `APP_URL` are embedded into the `href` attribute without `escapeHtml()`, while all other dynamic values in the file are escaped. This does not represent a real vulnerability given how those values originate, but aligning with the file's own convention would harden the code against any future change in how work order IDs are generated.
