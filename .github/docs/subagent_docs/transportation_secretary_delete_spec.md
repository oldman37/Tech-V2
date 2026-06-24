# Spec: Transportation Secretary Delete Permissions

## Current State

The TRANSPORTATION module uses numeric permission levels (1–3) to gate route access and UI visibility:

| Group | Level |
|-------|-------|
| Admin | 3 |
| Transportation Director | 3 |
| Transportation Secretary | 2 |
| Bus Drivers / All Staff | 1 |

### Blocked operations for secretary (level 2)

| Endpoint | Current level | File |
|----------|--------------|------|
| `DELETE /api/dot-physicals/:id` | 3 | `backend/src/routes/dotPhysical.routes.ts:77` |
| `DELETE /api/driver-licenses/:id/hard` | 3 | `backend/src/routes/driverLicense.routes.ts:123` |

### Frontend visibility also blocked

| UI guard | File:line |
|----------|-----------|
| DOT physical delete button | `DotPhysicalsPage.tsx:467` |
| Driver license hard-delete button | `DriverLicensePage.tsx:348` |

## Problem

The transportation secretary cannot delete DOT physical records or permanently hard-delete driver license records. Only directors and admins (level 3) have this capability.

## Proposed Solution

Lower the minimum permission level for both delete operations from 3 → 2 in both the backend routes and the frontend UI guards.

No schema changes, no new routes, no new services required.

## Implementation Steps

1. `backend/src/routes/dotPhysical.routes.ts` line 77: change `requireModule('TRANSPORTATION', 3)` → `requireModule('TRANSPORTATION', 2)`
2. `backend/src/routes/driverLicense.routes.ts` line 123: change `requireModule('TRANSPORTATION', 3)` → `requireModule('TRANSPORTATION', 2)` and update the adjacent comment
3. `frontend/src/pages/Transportation/DotPhysicalsPage.tsx` line 467: change `permLevel >= 3` → `permLevel >= 2`
4. `frontend/src/pages/Transportation/DriverLicensePage.tsx` lines 347–348: change comment and `permLevel >= 3` → `permLevel >= 2`

## Risks

- **Intentional** — the original level 3 gate was a deliberate design decision. User has confirmed this should be lowered.
- No data loss risk — this only adds capability; no data is modified by the permission change itself.
- No migration needed — purely runtime authorization logic.
