# Spec: Display Group-Derived Role Label Next to User Name

## 1. Current State Analysis

`frontend/src/components/layout/AppLayout.tsx:279-287` renders the header user block:
```tsx
<div className="shell-user-info">
  <strong>{user?.name}</strong>
  <span>{user?.email}</span>
</div>
<button onClick={handleLogout} className="btn btn-ghost btn-sm">Logout</button>
```
`.shell-user-info` (`AppLayout.css:59-74`) is a flex column; `<span>` children already get a
subtle 0.75rem/85%-opacity style, used today for the email line.

The frontend `User` type (`frontend/src/store/authStore.ts:4-39`) has only a coarse `roles?:
string[]` (the app's 2-value `ADMIN`/`USER` system) — nothing that reflects the user's actual
Entra group (e.g. "Staff", "Maintenance Director", "Principal"). Confirmed (via full-codebase
search) that no group-ID-to-label mapping exists anywhere today, backend or frontend.

Permission levels are already derived server-side from `req.user.groups` (raw Entra GUIDs) via
`backend/src/utils/groupAuth.ts`'s `GROUP_MODULE_MAP`, and exposed to the frontend as computed
booleans/enums folded into `permLevels` (e.g. `isPrincipalOrVP`, `canChangeWorkOrderPriority`,
`defaultWorkOrderDepartment`) — never as raw group IDs compared client-side. This feature follows
that same established pattern: derive a single human-readable label server-side, ship only the
string.

The `/me` response (`getMe`, `auth.controller.ts:723-781`) and the OAuth callback response
(`auth.controller.ts:380-402`) are the two places `AuthUserInfo` is built for the client; both
must be updated in step so the label appears after login and after a page reload.

## 2. Problem Definition

Per user direction: show the role the user is assigned at login **based on their Entra group
membership** next to their name — e.g. a member of `ENTRA_ALL_STAFF_GROUP_ID` shows "Staff", a
member of `ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID` shows "Maintenance Director". A user can belong
to multiple groups; exactly one label is shown (their highest-priority/most-specific group).

## 3. Proposed Solution Architecture

**`backend/src/utils/groupAuth.ts`** — add an ordered priority list (most specific/senior first,
so e.g. Admin or a Director label wins over the blanket "Staff" label that nearly everyone also
has via `ENTRA_ALL_STAFF_GROUP_ID`) and a lookup function:
```ts
const ROLE_LABEL_PRIORITY: Array<[string, string]> = [
  ['ENTRA_ADMIN_GROUP_ID', 'Admin'],
  ['ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID', 'Director of Schools'],
  ['ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID', 'Assistant Director of Schools'],
  ['ENTRA_FINANCE_DIRECTOR_GROUP_ID', 'Finance Director'],
  ['ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID', 'Technology Director'],
  ['ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID', 'Maintenance Director'],
  ['ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID', 'Transportation Director'],
  ['ENTRA_SPED_DIRECTOR_GROUP_ID', 'SPED Director'],
  ['ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID', 'Afterschool Director'],
  ['ENTRA_NURSE_DIRECTOR_GROUP_ID', 'Nurse Director'],
  ['ENTRA_PRE_K_DIRECTOR_GROUP_ID', 'Pre-K Director'],
  ['ENTRA_CTE_DIRECTOR_GROUP_ID', 'CTE Director'],
  ['ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID', 'Food Services Supervisor'],
  ['ENTRA_PRINCIPALS_GROUP_ID', 'Principal'],
  ['ENTRA_VICE_PRINCIPALS_GROUP_ID', 'Vice Principal'],
  ['ENTRA_FINANCE_PO_ENTRY_GROUP_ID', 'Finance PO Entry'],
  ['ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID', 'Food Services PO Entry'],
  ['ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID', 'Transportation Secretary'],
  ['ENTRA_TECH_ASSISTANTS_GROUP_ID', 'Tech Assistant'],
  ['ENTRA_OCBOE_LIBRARIANS_GROUP_ID', 'Librarian'],
  ['ENTRA_COUNTY_WIDE_MAINTENANCE_GROUP_ID', 'County-Wide Maintenance'],
  ['ENTRA_SCHOOL_MAINTENANCE_GROUP_ID', 'School Maintenance'],
  ['ENTRA_ALL_STAFF_GROUP_ID', 'Staff'],
  ['ENTRA_ALL_STUDENTS_GROUP_ID', 'Student'],
];

export function getPrimaryRoleLabel(groupIds: string[]): string | null {
  for (const [envVar, label] of ROLE_LABEL_PRIORITY) {
    const gid = process.env[envVar];
    if (gid && groupIds.includes(gid)) return label;
  }
  return null;
}
```
List covers every `ENTRA_*_GROUP_ID` currently configured (confirmed against root `.env`).
`null` fallback covers the (expected-empty-in-practice) case of a user in no recognized group.

**`backend/src/types/auth.types.ts`** — add `roleLabel: string | null;` to `AuthUserInfo`
(alongside `isPrincipalOrVP`).

**`backend/src/controllers/auth.controller.ts`** — import `getPrimaryRoleLabel`; add
`roleLabel: getPrimaryRoleLabel(groupIds)` to both `AuthUserInfo` construction sites: the OAuth
callback (~line 398, next to `isPrincipalOrVP`) and `getMe` (~line 778).

**`frontend/src/store/authStore.ts`** — add `roleLabel?: string | null;` to the `User` interface.

**`frontend/src/components/layout/AppLayout.tsx`** — render it between name and email:
```tsx
<div className="shell-user-info">
  <strong>{user?.name}</strong>
  {user?.roleLabel && <span>{user.roleLabel}</span>}
  <span>{user?.email}</span>
</div>
```
No new CSS needed — reuses the existing `.shell-user-info span` styling already applied to the
email line.

## 4. Implementation Steps

1. `backend/src/utils/groupAuth.ts`: add `ROLE_LABEL_PRIORITY` + `getPrimaryRoleLabel()`.
2. `backend/src/types/auth.types.ts`: add `roleLabel` to `AuthUserInfo`.
3. `backend/src/controllers/auth.controller.ts`: wire `getPrimaryRoleLabel(groupIds)` into both
   response-construction sites.
4. `frontend/src/store/authStore.ts`: add `roleLabel` to the `User` interface.
5. `frontend/src/components/layout/AppLayout.tsx`: render the label conditionally.
6. Verify: `docker compose -f docker-compose.dev.yml build backend` and `... build frontend`.

## 5. Dependencies

None new — pure derivation function reusing the existing `process.env.ENTRA_*_GROUP_ID` /
`groupIds` pattern already used throughout `groupAuth.ts` and `auth.controller.ts`.

## 6. Configuration Changes

None. All referenced env vars are already configured.

## 7. Risks and Mitigations

- **Risk:** A user matches multiple groups and gets a label that doesn't reflect their "primary"
  function (e.g. a Director who is also in `ALL_STAFF`). **Mitigation:** fixed priority order,
  most senior/specific group first; `ALL_STAFF`/`ALL_STUDENTS` are last so they only apply as a
  fallback.
- **Risk:** Exposing raw Entra group IDs to the client. **Mitigation:** none are exposed by this
  change — only the resulting label string is sent, computed entirely server-side (the existing
  `groups: groupIds` field already present on the `/me` response is pre-existing and untouched by
  this change).
- **Risk:** List drifts out of sync if a new `ENTRA_*_GROUP_ID` is added later without updating
  `ROLE_LABEL_PRIORITY`. **Mitigation:** unmatched users simply get `roleLabel: null` (label
  hidden), a safe, non-breaking default — not a build or runtime error.
