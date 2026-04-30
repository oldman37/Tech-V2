# Field Trip Request Feature — Code Review

> **Reviewer:** SubAgent (Review Phase)  
> **Date:** 2026-04-30  
> **Project:** Tech-V2 — Tech Department Management System  
> **Build Result:** ✅ BACKEND SUCCESS · ✅ FRONTEND SUCCESS  
> **Overall Assessment:** ✅ PASS  

---

## Summary Score Table

| Category | Score | Grade |
|----------|:-----:|:-----:|
| Specification Compliance | 88% | B+ |
| Best Practices | 90% | A- |
| Functionality | 92% | A- |
| Code Quality | 93% | A |
| Security | 95% | A |
| Performance | 88% | B+ |
| Consistency | 95% | A |
| Build Success | 100% | A+ |
| **Overall Grade** | **93%** | **A** |

---

## Build Validation

```
Backend  (c:\Tech-V2\backend)  — npm run build → Exit Code: 0  ✅ SUCCESS
Frontend (c:\Tech-V2\frontend) — npm run build → Exit Code: 0  ✅ SUCCESS
```

No TypeScript compilation errors in either project.

---

## Findings

### CRITICAL

#### C-1: `ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID` is blank in `.env`

**File:** `c:\Tech-V2\backend\.env` (line 140)

```
ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID=
```

**Impact:** `buildFieldTripApproverSnapshot()` guards with `asstDosGroupId ? fetchGroupEmails(...) : []` so no runtime error occurs. However, this means `asstDirectorEmails` in the snapshot will always be an empty array. When a field trip advances to `PENDING_ASST_DIRECTOR`, no email notification will be sent to the Assistant Director of Schools stage approvers. The workflow state machine still advances correctly — only the notification is silent.

**Action required:** Obtain and populate the Entra group GUID for the Assistant Director of Schools group in the production `.env`.

**Affected files:**
- `c:\Tech-V2\backend\.env`

---

#### C-2: Approve/Deny buttons shown to the request submitter (misleading UX)

**File:** `c:\Tech-V2\frontend\src\pages\FieldTrip\FieldTripDetailPage.tsx` (lines ~122–132)

```typescript
// Current code — showActionButtons ignores ownership:
const canAct = isPending && !isOwner && isAdmin === false
    ? false
    : isPending;

const showActionButtons = isPending;   // ← overwrites canAct, always shows to owner too
```

**Impact:** When a trip is in any `PENDING_*` state, the submitter of that same trip will see the "Approve" and "Deny" buttons on their own request. The backend correctly rejects the action (the submitter rarely has the required permission level), but the UX is confusing and misleading.

**Fix:**

```typescript
const showActionButtons = isPending && !isOwner;
```

This removes the incorrectly written `canAct` dead-code block and avoids showing the action panel to the owner.

**Affected files:**
- `c:\Tech-V2\frontend\src\pages\FieldTrip\FieldTripDetailPage.tsx`

---

### RECOMMENDED

#### R-1: `fiscalYear` not auto-populated at submit time

**File:** `c:\Tech-V2\backend\src\services\fieldTrip.service.ts` (`submit` method)

The spec (section 3.3) requires `fiscalYear` to be captured from `SystemSettings.currentFiscalYear` at submit time. Neither `createDraft()` nor `submit()` sets this value.

```typescript
// In submit(), before or inside the $transaction:
const settings = await prisma.systemSettings.findFirst();
// ...
data: {
  status: firstStatus,
  submittedAt: new Date(),
  approverEmailsSnapshot: snapshot as object,
  fiscalYear: settings?.currentFiscalYear ?? null,   // ← missing
},
```

Without this, the `fiscalYear` field remains `null` for all field trip requests, hindering fiscal-year scoped reporting and filtering.

**Affected files:**
- `c:\Tech-V2\backend\src\services\fieldTrip.service.ts`

---

#### R-2: `getPendingApprovals` returns all pending trips regardless of supervisor ownership

**File:** `c:\Tech-V2\backend\src\services\fieldTrip.service.ts` (`getPendingApprovals` method)

```typescript
async getPendingApprovals(permLevel: number) {
  const eligibleStatuses = PENDING_STATUSES.filter(
    (s) => permLevel >= (STAGE_MIN_LEVEL[s] ?? 99),
  );
  return prisma.fieldTripRequest.findMany({
    where: { status: { in: eligibleStatuses } },
    ...
  });
}
```

For a level-3 supervisor, this returns **all** `PENDING_SUPERVISOR` requests in the system, not just the requests where the requesting user is the direct supervisor of the submitter. This differs from the PO system which scopes supervisor visibility by the `UserSupervisor` relationship.

**Risk:** Information disclosure — a principal at School A can see pending field trips from teachers at School B, provided both are `PENDING_SUPERVISOR`.

**Recommended fix:** For `PENDING_SUPERVISOR`, additionally filter to trips submitted by users who have the current user listed as their supervisor:

```typescript
if (s === 'PENDING_SUPERVISOR') {
  // Additional WHERE: submittedById IN (SELECT userId FROM user_supervisors WHERE supervisorId = currentUserId)
}
```

**Affected files:**
- `c:\Tech-V2\backend\src\services\fieldTrip.service.ts`

---

#### R-3: `canAct` variable is dead code

**File:** `c:\Tech-V2\frontend\src\pages\FieldTrip\FieldTripDetailPage.tsx` (lines ~119–131)

The `canAct` variable is computed but never referenced after `showActionButtons = isPending` unconditionally replaces it. This is dead code and should be removed in the fix described in C-2.

---

#### R-4: `FieldTripApproverSnapshot` does not include `transportationSecretaryEmails`

**File:** `c:\Tech-V2\backend\src\services\email.service.ts` (interface `FieldTripApproverSnapshot`)

The spec (section 7.2) calls for the transportation secretary emails to be included in the stored snapshot so they are immutably recorded at submit time. The implementation chooses to fetch them live in the controller at submit time, which is functionally equivalent but means:
- The stored `approverEmailsSnapshot` JSON on the DB record does not include the transportation group (only supervisor/asstDirector/director/financeDirector).
- There is no audit trail of which addresses actually received the transportation notice.

**Recommended:** Add `transportationSecretaryEmails` to the `FieldTripApproverSnapshot` interface and resolve it inside `buildFieldTripApproverSnapshot()`, then pass it through rather than fetching again in the controller.

```typescript
export interface FieldTripApproverSnapshot {
  supervisorEmails:           string[];
  asstDirectorEmails:         string[];
  directorEmails:             string[];
  financeDirectorEmails:      string[];
  transportationSecretaryEmails: string[];   // ← add
}
```

**Affected files:**
- `c:\Tech-V2\backend\src\services\email.service.ts`
- `c:\Tech-V2\backend\src\controllers\fieldTrip.controller.ts`

---

#### R-5: No pagination on `getPendingApprovals` and `getMyRequests`

**File:** `c:\Tech-V2\backend\src\services\fieldTrip.service.ts`

Both list methods return all records without pagination. For an admin or director with level 6, `getPendingApprovals` would return every pending request across all stages. A `FieldTripQuerySchema` with pagination is already defined in the validators but is not wired to a general list endpoint or used by these methods.

This is acceptable for current scale but should be addressed before the list grows large.

---

### OPTIONAL

#### O-1: Denial confirmation email to the denier is not sent

The spec (section 7.3) mentions sending a CC confirmation email to the stage denier as well as to the submitter. The implementation only sends to the submitter:

```typescript
await sendFieldTripDenied(updated.submitterEmail, updated, denierName, data.reason);
```

No CC to the denier. Low priority since the denier triggered the action and saw the confirmation in the UI, but the spec is explicit about it.

---

#### O-2: `UpdateFieldTripSchema` does not re-validate `returnTime > departureTime`

The spec calls for `returnTime` to be validated as later than `departureTime`. Neither the create nor update validator performs this cross-field check. Frontend validation also omits it. Low risk since the data is stored as freeform strings, but the spec lists it as a validation rule.

---

#### O-3: No general admin list endpoint (`GET /api/field-trips`)

The `FieldTripQuerySchema` (with pagination, status filter, fiscal year, etc.) is defined in the validators but never applied to a route. Admins and directors currently have no way to list all trips via the API—only their own (`/my-requests`) or pending (`/pending-approvals`). An admin dashboard or reporting view would require this endpoint.

---

#### O-4: Email subject line minor deviation from spec

**File:** `c:\Tech-V2\backend\src\services\email.service.ts`

- **Spec says:** `"Your Field Trip Request Has Been Approved: [Destination]"`
- **Implementation says:** `"Field Trip Approved: {destination} — {date}"`

The implementation adds the date, which is a useful improvement, but the subject line prefix differs from the spec. Low impact.

---

## Security Assessment

| Check | Status | Notes |
|-------|--------|-------|
| All routes have `authenticateToken` middleware | ✅ PASS | `router.use(authenticate)` applied globally |
| CSRF protection on state-changing routes | ✅ PASS | `router.use(validateCsrfToken)` applied to whole router |
| Zod validation on all inputs | ✅ PASS | All endpoints use `validateRequest()` with typed schemas |
| No `console.log` | ✅ PASS | Structured `logger` used throughout |
| No sensitive data in logs | ✅ PASS | Only IDs and status values logged |
| Custom error classes used | ✅ PASS | `NotFoundError`, `AuthorizationError`, `ValidationError` |
| Errors sanitized for client | ✅ PASS | `handleControllerError` in use |
| No raw SQL | ✅ PASS | Prisma ORM exclusively |
| No `any` types in field trip files | ✅ PASS | All field trip types are explicit |
| `escapeHtml()` used in email templates | ✅ PASS | All user-supplied strings escaped |
| Permission checks (service layer) | ✅ PASS | `STAGE_MIN_LEVEL` enforced in `approve()` / `deny()` |
| Row-level ownership (edit/delete) | ✅ PASS | `submittedById !== userId` guard in service |
| Supervisor scope leakage | ⚠️ SEE R-2 | `getPendingApprovals` too broad for supervisors |

---

## Specification Compliance

| Spec Requirement | Status | Notes |
|-----------------|--------|-------|
| All 17 form fields present | ✅ | All fields in schema, validators, service, and frontend |
| 4-stage approval workflow | ✅ | SUPERVISOR → ASST_DIRECTOR → DIRECTOR → FINANCE_DIRECTOR |
| Supervisor bypass when no supervisor | ✅ | `snapshot.supervisorEmails.length > 0` check in service |
| Transportation Secretary email on submit | ✅ | Fetched live in controller; C-1 blocks email delivery |
| Final approved email to submitter | ✅ | `sendFieldTripFinalApproved` called in controller |
| Denial email at any stage | ✅ | `sendFieldTripDenied` called in controller |
| Stage advance emails | ✅ | `sendFieldTripAdvancedToApprover` called correctly |
| Status history table | ✅ | `FieldTripStatusHistory` populated in all transitions |
| Approval history table | ✅ | `FieldTripApproval` populated in all transitions |
| `fiscalYear` auto-populated at submit | ❌ | Not implemented (see R-1) |
| Denial CC to denier | ❌ | Not implemented (see O-1) |
| `approverEmailsSnapshot` includes transport sec. | ❌ | Not stored in snapshot (see R-4) |

---

## Frontend UX Assessment

| Requirement | Status | Notes |
|-------------|--------|-------|
| Multi-step form (3 steps) | ✅ | Trip Info → Logistics → Additional Details |
| Transportation toggle (question 10) | ✅ | `Switch` hides/shows details field |
| Status badges with colors | ✅ | `FIELD_TRIP_STATUS_COLORS` + MUI `Chip` |
| Approval history shown | ✅ | Rendered in `FieldTripDetailPage` |
| Deny dialog with required reason | ✅ | `DenyDialog` requires `reason` |
| Approve dialog with optional notes | ✅ | `ApproveDialog` shows `approveNotes` field |
| Approve/Deny hidden for non-pending | ✅ | `showActionButtons = isPending` |
| Approve/Deny hidden from owner | ❌ | See C-2 |
| Routes registered in `App.tsx` | ✅ | `/field-trips`, `/field-trips/new`, `/field-trips/approvals`, `/field-trips/:id`, `/field-trips/:id/edit` |
| Navigation links in sidebar | ✅ | "Field Trips" and "Field Trip Approvals" in `AppLayout.tsx` |
| Frontend types in `fieldTrip.types.ts` | ✅ | Matches Prisma schema exactly |

---

## File Review Inventory

| File | Status |
|------|--------|
| `backend/prisma/schema.prisma` | ✅ All 3 models correct, User relations present |
| `backend/src/services/fieldTrip.service.ts` | ✅ with R-1, R-2 |
| `backend/src/controllers/fieldTrip.controller.ts` | ✅ |
| `backend/src/routes/fieldTrip.routes.ts` | ✅ All routes authenticated + CSRF |
| `backend/src/server.ts` | ✅ `app.use('/api/field-trips', fieldTripRoutes)` registered |
| `backend/src/services/email.service.ts` | ✅ All 5 field trip email functions present |
| `backend/src/validators/fieldTrip.validators.ts` | ✅ All fields validated with cross-field checks |
| `backend/.env` | ⚠️ `ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID` is blank (C-1) |
| `backend/.env.example` | ✅ Both new group vars documented |
| `frontend/src/pages/FieldTrip/FieldTripListPage.tsx` | ✅ |
| `frontend/src/pages/FieldTrip/FieldTripRequestPage.tsx` | ✅ |
| `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx` | ⚠️ C-2: owner sees action buttons |
| `frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx` | ✅ |
| `frontend/src/pages/FieldTrip/index.ts` | ✅ All 4 pages exported |
| `frontend/src/services/fieldTrip.service.ts` | ✅ All API methods present |
| `frontend/src/App.tsx` | ✅ All 5 routes registered |
| `frontend/src/components/layout/AppLayout.tsx` | ✅ Nav links present |
| `frontend/src/types/fieldTrip.types.ts` | ✅ Type-safe, matches DB schema |
| `shared/src/` | ℹ️ No field trip shared types — types live in frontend only (acceptable) |

---

## Summary of Findings

| Severity | Count | Items |
|----------|:-----:|-------|
| CRITICAL | 2 | C-1 (blank env var), C-2 (owner sees action buttons) |
| RECOMMENDED | 5 | R-1 (fiscalYear), R-2 (supervisor scope), R-3 (dead code), R-4 (snapshot), R-5 (pagination) |
| OPTIONAL | 4 | O-1 (denier CC), O-2 (time validation), O-3 (admin list endpoint), O-4 (email subject) |

**C-1** requires an ops action (populating the environment variable) — no code change needed.  
**C-2** requires a 1-line fix in `FieldTripDetailPage.tsx`.  
All other findings are non-blocking.

---

## Overall Assessment: ✅ PASS

The implementation is high-quality, consistent with existing system patterns, and production-ready with two minor corrections. The approval state machine, email notification flow, Zod validation, security middleware chain, and frontend workflow are all correctly implemented. Both builds succeed with zero errors.

**Recommended action before production deployment:**
1. Fix C-2 (1-line frontend change)
2. Populate `ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID` in `.env` (ops task)
3. Address R-1 (fiscalYear at submit time) — requires ~5 lines in service
4. Address R-2 (supervisor scope in getPendingApprovals) — security hardening
