# Site-Admin PO Vendor/Ship-To Edit + Audit Logging — Spec

## Current State Analysis

- `purchase_orders.status` workflow: `draft → submitted → supervisor_approved → finance_director_approved → dos_approved → po_issued`, with `denied` reachable from any active stage.
- Editing today is gated by `EDITABLE_STATUSES = ['draft']` in [purchaseOrder.service.ts:49](../../../backend/src/services/purchaseOrder.service.ts#L49). `updatePurchaseOrder` ([purchaseOrder.service.ts:586-696](../../../backend/src/services/purchaseOrder.service.ts#L586-L696)) only allows edits on `draft` (owner or permLevel≥3), plus a narrow PO-Entry exception at `dos_approved` limited to `notes/shippingCost/shipTo/shipToType`. There is **no ADMIN bypass** of this status check — an admin cannot currently fix a `submitted`/`approved`/`po_issued` PO.
- There is no dedicated "address" field. The address-determining fields are:
  - `vendorId` → resolves to the vendor's address (`vendors.address/city/state/zip`).
  - `shipTo` (free text), `shipToType` (`entity|my_office|custom|school`), `officeLocationId` (FK, drives `entityType`).
- Generic audit infrastructure already exists and must be reused, not rebuilt: `AuditLog` Prisma model ([schema.prisma:2085-2098](../../../backend/prisma/schema.prisma#L2085-L2098)) + `writeAuditLog(actorId, action, entityType, entityId, metadata?)` helper ([auditLog.ts](../../../backend/src/lib/auditLog.ts)), already called for `PO_APPROVED`/`PO_REJECTED` in [purchaseOrder.controller.ts:278,301](../../../backend/src/controllers/purchaseOrder.controller.ts#L278). It is **not** currently called from `updatePurchaseOrder` or `adminDeletePurchaseOrder`.
- Frontend "Edit Draft"/"Edit PO Details" button ([PurchaseOrderDetail.tsx:775-784](../../../frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx#L775-L784)) navigates to `/purchase-orders/new?edit=<id>`, but `RequisitionWizard.tsx` never reads `?edit=` — it always renders a blank create form. This is a pre-existing bug, out of scope here (not touched by this feature).
- Frontend already computes `isAdmin` at [PurchaseOrderDetail.tsx:252](../../../frontend/src/pages/PurchaseOrders/PurchaseOrderDetail.tsx#L252): `user?.roles?.includes('ADMIN')`.
- A `useUpdatePurchaseOrder` mutation hook exists ([usePurchaseOrderMutations.ts:44-56](../../../frontend/src/hooks/mutations/usePurchaseOrderMutations.ts#L44-L56)) but is unused; it hits `PUT /:id`, which is unrelated to the new endpoint being added here.

## Decisions (confirmed with user)

1. **Status scope**: admin edit works on a PO in **any** status, including `po_issued` and `denied` — no status check at all for this path.
2. **Field scope**: exactly two logical groups — **vendor** (`vendorId`) and **ship-to** (`shipTo`, `shipToType`, `officeLocationId`, `entityType` — the last is derived, not user-set directly). No line items, amount, notes, program, or account code changes through this path.
3. **UI**: a single button on the PO detail/view page (`PurchaseOrderDetail.tsx`), visible to admins only, opening a small dialog to edit just those two field groups. The existing wizard/`?edit=` bug is **not** touched.
4. **Audit log**: add `writeAuditLog` calls to **both** paths — the existing draft-edit `updatePurchaseOrder` (currently unlogged) and the new admin edit — using distinct action strings, consistent with the existing one-action-per-operation convention (`PO_APPROVED`, `PO_REJECTED`).

## Proposed Solution

### Backend

**New Zod schema** — `shared/src/schemas/purchaseOrder.schema.ts`, add near `UpdatePurchaseOrderSchema`:

```ts
export const AdminEditPurchaseOrderSchema = z.object({
  vendorId: z.string().uuid('Invalid vendor ID format').optional(),
  shipTo: z.string().trim().max(500, 'Ship-to address must be 500 characters or less').optional().nullable(),
  shipToType: z.enum(['entity', 'my_office', 'custom', 'school']).optional().nullable(),
  officeLocationId: z.string().uuid('Invalid location ID').optional().nullable(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);
export type AdminEditPurchaseOrderInput = z.infer<typeof AdminEditPurchaseOrderSchema>;
```

`entityType` is intentionally excluded from the input — same as the existing `updatePurchaseOrder` service, it is *derived* from `officeLocationId` (via `OfficeLocation.type`), never set directly by the client.

Backend validator file re-exports it (mirror the `CreatePurchaseOrderSchema`/`UpdatePurchaseOrderSchema` re-export pattern at [purchaseOrder.validators.ts:34-35](../../../backend/src/validators/purchaseOrder.validators.ts#L34-L35)) and adds `export type AdminEditPurchaseOrderDto = z.infer<typeof AdminEditPurchaseOrderSchema>;`.

**New service method** on the same class as `updatePurchaseOrder`/`adminDeletePurchaseOrder` in `purchaseOrder.service.ts`:

```ts
async adminEditVendorAndShipTo(id: string, data: AdminEditPurchaseOrderDto, adminUserId: string) {
  const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
  if (!po) throw new NotFoundError('PurchaseOrder', id);

  let resolvedEntityType: string | null | undefined = undefined;
  if (data.officeLocationId !== undefined) {
    if (data.officeLocationId) {
      const loc = await this.prisma.officeLocation.findUnique({
        where: { id: data.officeLocationId },
        select: { type: true, isActive: true },
      });
      if (!loc || !loc.isActive) {
        throw new ValidationError('Selected location not found or inactive', 'officeLocationId');
      }
      resolvedEntityType = loc.type;
    } else {
      resolvedEntityType = null;
    }
  }

  const changedFields = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);

  const updated = await this.prisma.purchase_orders.update({
    where: { id },
    data: {
      ...(data.vendorId         !== undefined && { vendorId:         data.vendorId }),
      ...(data.shipTo           !== undefined && { shipTo:           data.shipTo != null ? sanitizeText(data.shipTo) : null }),
      ...(data.shipToType       !== undefined && { shipToType:       data.shipToType }),
      ...(data.officeLocationId !== undefined && { officeLocationId: data.officeLocationId }),
      ...(resolvedEntityType    !== undefined && { entityType:       resolvedEntityType }),
    },
    include: {
      po_items:       { orderBy: { lineNumber: 'asc' } },
      User:           { select: { id: true, firstName: true, lastName: true, email: true } },
      vendors:        true,
      officeLocation: true,
    },
  });

  loggers.purchaseOrder.info('Admin edited PO vendor/ship-to', { id, adminUserId, changedFields, previousStatus: po.status });
  return { updated, changedFields, previousStatus: po.status, previousVendorId: po.vendorId };
}
```

No `EDITABLE_STATUSES` check — deliberately bypasses status entirely per decision 1. Reuses the exact `officeLocationId` validation and `entityType` resolution logic already in `updatePurchaseOrder` ([purchaseOrder.service.ts:629-645](../../../backend/src/services/purchaseOrder.service.ts#L629-L645)) for consistency.

**Controller** — `purchaseOrder.controller.ts`, add:

```ts
/**
 * PATCH /api/purchase-orders/:id/admin-edit
 */
export const adminEditPurchaseOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = AdminEditPurchaseOrderSchema.parse(req.body);
    const adminUserId = req.user!.id;
    const id = req.params.id as string;

    const { updated, changedFields, previousStatus, previousVendorId } =
      await service.adminEditVendorAndShipTo(id, data, adminUserId);

    await writeAuditLog(adminUserId, 'PO_ADMIN_EDIT', 'purchase_order', id, {
      changedFields, previousStatus, previousVendorId, newVendorId: updated.vendorId,
    });

    res.json(updated);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

Also add one line to the **existing** `updatePurchaseOrder` controller ([purchaseOrder.controller.ts:108-120](../../../backend/src/controllers/purchaseOrder.controller.ts#L108-L120)), after the service call succeeds:

```ts
await writeAuditLog(userId, 'PO_UPDATED', 'purchase_order', req.params.id as string, {
  changedFields: Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined),
  status: po.status,
});
```

(`writeAuditLog` import already needed; add `import { writeAuditLog } from '../lib/auditLog';` at top of controller file.)

**Route** — `purchaseOrder.routes.ts`, add near the existing `admin-delete` route, mirroring its `requireAdmin`-gated pattern:

```ts
/**
 * PATCH /api/purchase-orders/:id/admin-edit
 * Admin-only: edit vendor and/or ship-to address, regardless of PO status.
 */
router.patch(
  '/:id/admin-edit',
  validateRequest(PurchaseOrderIdParamSchema, 'params'),
  validateRequest(AdminEditPurchaseOrderSchema, 'body'),
  requireAdmin,
  purchaseOrderController.adminEditPurchaseOrder,
);
```

CSRF protection already applies (`router.use(validateCsrfToken)` at the top of the router file covers all routes registered on it).

No Prisma schema changes, no migration — all fields already exist.

### Frontend

- `frontend/src/services/purchaseOrderService.ts` (or wherever the PO API client lives — confirm exact file during implementation): add `adminEdit(id: string, data: AdminEditPurchaseOrderInput)` → `PATCH /purchase-orders/${id}/admin-edit`.
- `usePurchaseOrderMutations.ts`: add `useAdminEditPurchaseOrder()` mirroring `useUpdatePurchaseOrder`'s shape (same query invalidation on success).
- `PurchaseOrderDetail.tsx`: add a button, gated on the existing `isAdmin` flag (line 252), e.g. "Edit Vendor / Ship-To", opening a new small dialog.
- New dialog component (e.g. `AdminEditVendorShipToDialog.tsx` in the same `PurchaseOrders` folder):
  - Vendor select: reuse whatever vendor-select component/query `RequisitionWizard.tsx` uses (must inspect it during implementation — not fully captured in research) for consistency, rather than a new one.
  - Ship-to fields: reuse the same conditional logic as `RequisitionWizard.tsx`'s ship-to step ([RequisitionWizard.tsx:789-860](../../../frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx#L789-L860)) — `shipToType` selector driving whether an office-location picker or a free-text/school picker is shown.
  - On submit: call `useAdminEditPurchaseOrder().mutate({ id, vendorId, shipTo, shipToType, officeLocationId })`; on success, close dialog + toast + let the existing PO-detail query invalidation refresh the view.
  - Only send fields the admin actually changed (avoid clobbering with unchanged `undefined` vs explicit values — form should initialize from current PO values).

## Implementation Steps

1. Add `AdminEditPurchaseOrderSchema` to `shared/src/schemas/purchaseOrder.schema.ts`; export type.
2. Re-export + DTO type in `backend/src/validators/purchaseOrder.validators.ts`.
3. Add `adminEditVendorAndShipTo` service method in `backend/src/services/purchaseOrder.service.ts`.
4. Add `adminEditPurchaseOrder` controller in `backend/src/controllers/purchaseOrder.controller.ts`; add `writeAuditLog` import + call; add the missing `writeAuditLog` call to the existing `updatePurchaseOrder` controller.
5. Add the `PATCH /:id/admin-edit` route in `backend/src/routes/purchaseOrder.routes.ts`.
6. Frontend: API client method, `useAdminEditPurchaseOrder` hook, new dialog component, wire button into `PurchaseOrderDetail.tsx` (admin-only).
7. Rebuild `shared` types before backend/frontend Docker builds pick up the new schema (handled automatically by the Docker build stages).

## Dependencies

None new. Reuses existing Zod, Prisma, MUI, react-hook-form, TanStack Query already in use elsewhere in this exact file (`RequisitionWizard.tsx`, `usePurchaseOrderMutations.ts`) — no version verification required per CLAUDE.md Dependency Policy exclusions.

## Configuration Changes

None. No new env vars, no Prisma schema/migration changes.

## Risks and Mitigations

- **Risk**: An admin swaps the vendor on an already-`po_issued` PO, but the vendor was already notified/shipped against the old vendor info. **Mitigation**: this is an explicit, confirmed product decision (decision 1) — the feature exists specifically to allow correcting mistakes like a wrong vendor caught after issuance. The audit log captures `previousVendorId`/`previousStatus` so the change is traceable.
- **Risk**: Silent overwrite of `shipTo`/`officeLocationId` if the frontend dialog sends `undefined` vs explicit `null` incorrectly. **Mitigation**: dialog initializes fields from the current PO record; only changed fields need to be included, but all fields present in the request must round-trip correctly per the `!== undefined` guards mirrored from the existing `updatePurchaseOrder` pattern.
- **Risk**: Bypassing `EDITABLE_STATUSES` entirely for this path could be misused to edit fields beyond vendor/ship-to by hitting the endpoint directly. **Mitigation**: `AdminEditPurchaseOrderSchema` is a strict allowlist (only 3 keys accepted; Zod strips/rejects unknown keys per existing schema conventions in this file), and the route is `requireAdmin`-gated.
