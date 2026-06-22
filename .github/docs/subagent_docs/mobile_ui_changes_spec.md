# Spec: Mobile UI Changes (15 items)

## Source
User-provided test-environment log: `docs/UI_CHANGES_MOBILE.md`

## Scope
Frontend-only. No backend, Prisma, migrations, auth, or seed data changes.

## Files Modified
1. `frontend/src/pages/InventoryManagement.tsx` (changes #1, #2)
2. `frontend/src/pages/DisposedEquipment.tsx` (change #3)
3. `frontend/src/pages/BulkDeleteDisposedPage.tsx` (change #4)
4. `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` (change #5)
5. `frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx` (change #6)
6. `frontend/src/pages/DeviceManagement/index.tsx` (change #7a)
7. `frontend/src/components/DeviceManagement/DashboardWidgets.tsx` (change #7b)
8. `frontend/src/pages/DeviceManagement/CheckedOutCartsPage.tsx` (change #8)
9. `frontend/src/pages/incidents/IncidentsPage.tsx` (change #9)
10. `frontend/src/pages/DeviceManagement/CheckoutPage.tsx` (change #10)
11. `frontend/src/pages/DeviceManagement/ReportsPage.tsx` (change #11)
12. `frontend/src/pages/DeviceManagement/IntuneDeviceActionsPage.tsx` (change #12)
13. `frontend/src/pages/Transportation/DotPhysicalsPage.tsx` (change #13)
14. `frontend/src/pages/Transportation/DriverLicensePage.tsx` (change #14)
15. `frontend/src/pages/Transportation/TransportationSettingsPage.tsx` (change #15)

## Implementation Strategy
All changes are surgical UI-only edits. Each change branches on `isMobile`
(from `useIsMobile()` hook) to serve a mobile-optimised layout while leaving
the desktop layout completely unchanged.
