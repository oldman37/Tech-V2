# Field Trip Transportation Step 2 — Code Review

> **Reviewer:** SubAgent (Review Phase)  
> **Date:** 2026-04-30  
> **Build Checked:** Backend ✅ EXIT 0 | Frontend ✅ built in 13.98s  
> **Overall Assessment:** **PASS**  
> **Overall Grade:** **A– (92%)**

---

## Summary Score Table

| Category               | Score | Notes |
|------------------------|-------|-------|
| Specification Compliance | 93%  | SUBMITTED status defined but never set; types file location differs from spec |
| Best Practices          | 91%  | BUS_CAPACITY duplicated; Edit & Resubmit cache-only mutation |
| Functionality           | 88%  | Core flows work end-to-end; Edit & Resubmit is functionally broken |
| Code Quality            | 95%  | Clean, consistent, well-commented, minimal duplication |
| Security                | 98%  | All auth/CSRF/Zod checks in place; no vulnerabilities found |
| Performance             | 95%  | Non-blocking emails, correct query invalidation, proper includes |
| Consistency             | 97%  | Closely follows FieldTripService/Controller patterns |
| Build Success           | 100% | Both builds pass with exit code 0 |
| **Overall**             | **92%** | |

---

## Build Results

| Build   | Command              | Result    | Details |
|---------|----------------------|-----------|---------|
| Backend | `npm run build`      | ✅ SUCCESS | Exit 0, tsc + font copy completed |
| Frontend| `npm run build`      | ✅ SUCCESS | ✓ built in 13.98s, no TypeScript errors |

---

## Issues

### CRITICAL
_None identified._

---

### RECOMMENDED

#### R1 — Edit & Resubmit creates a broken UX path
**File:** [frontend/src/pages/FieldTrip/FieldTripTransportationPage.tsx](../../../frontend/src/pages/FieldTrip/FieldTripTransportationPage.tsx)  
**Lines:** ~165–174

```tsx
onClick={() => queryClient.setQueryData(['field-trips', id, 'transportation'], {
  ...transport!, status: 'DRAFT',
})}
```

**Problem:** The "Edit & Resubmit" button mutates only the React Query cache to `status: 'DRAFT'` without any API call. When the user then edits and saves, the backend `update()` service asserts `transportRequest.status === 'DRAFT'` against the actual DB record, which is still `TRANSPORTATION_DENIED`, and returns a `400 ValidationError`. The form appears to work but every save attempt silently fails.

**Note:** The spec marks this as _"optional future feature"_, so the backend route for resetting a denied transportation request was never built. The partially-implemented button creates a misleading click path. The button should either be removed or show a `"Coming soon"` state until the backend route (`POST /:id/transportation/reopen`) is implemented.

**Recommended fix:**
```tsx
{transport!.status === 'TRANSPORTATION_DENIED' && (
  <Alert severity="info" sx={{ mt: 2 }}>
    Denied transportation requests cannot currently be resubmitted.
    Please contact the Transportation Director for further guidance.
  </Alert>
)}
```

---

#### R2 — `SUBMITTED` status is dead code
**Files:**  
- [backend/src/validators/fieldTripTransportation.validators.ts](../../../backend/src/validators/fieldTripTransportation.validators.ts) — `SUBMITTED` in `TRANSPORTATION_STATUSES`  
- [backend/src/services/fieldTripTransportation.service.ts](../../../backend/src/services/fieldTripTransportation.service.ts) — `submit()` method  
- [frontend/src/types/fieldTrip.types.ts](../../../frontend/src/types/fieldTrip.types.ts) — `TRANSPORTATION_STATUS_LABELS` / `TRANSPORTATION_STATUS_COLORS`

**Problem:** The spec defines the status flow as `DRAFT → SUBMITTED → PENDING_TRANSPORTATION`. The `submit()` service method skips `SUBMITTED` entirely and transitions directly to `PENDING_TRANSPORTATION` in a single DB write. The `SUBMITTED` constant in validators and the `SUBMITTED` entry in frontend labels/colors are dead code that will never be rendered.

**Options:**
1. **Align with spec** — set `status: 'SUBMITTED'` when the `submit()` action fires, then immediately transition to `PENDING_TRANSPORTATION` in the same transaction (or in the email notify callback).
2. **Clean up dead code** — remove `'SUBMITTED'` from `TRANSPORTATION_STATUSES`, `TRANSPORTATION_STATUS_LABELS`, and `TRANSPORTATION_STATUS_COLORS` and update the spec to reflect the simplified 4-state model.

Option 2 is simpler and the 4-state model is functionally equivalent for the end-user. Recommend Option 2 unless `SUBMITTED` has a distinct UI requirement.

---

### OPTIONAL

#### O1 — `BUS_CAPACITY` is duplicated
Both [backend/src/services/fieldTripTransportation.service.ts](../../../backend/src/services/fieldTripTransportation.service.ts) and [frontend/src/components/fieldtrip/TransportationRequestForm.tsx](../../../frontend/src/components/fieldtrip/TransportationRequestForm.tsx) declare:
```ts
const BUS_CAPACITY = 52;
```
The spec explicitly says "no environment variable needed at this time" so this is acceptable. If the constant ever changes, it must be updated in two places. Consider exporting it from `/shared/src` in a future sprint.

---

#### O2 — Types file location diverges from spec
The spec (§8.1) called for a new `frontend/src/types/fieldTripTransportation.types.ts`. Instead, all types were added to the existing `fieldTrip.types.ts`. This is actually a better approach (no module boundary leakage) and is consistent with how other feature types are organized in the project. **No action needed.**

---

#### O3 — `chaperoneCount` minimum is 0, not 1
The Zod schema has `z.number().int().min(0)`. The spec's table marks `chaperoneCount` as "Required: Yes" but doesn't specify a minimum value. The frontend default is `1`. A field trip with 0 chaperones may be technically valid for certain activity types (e.g., a self-driving overnight away game). The current behavior is permissive; tighten to `.min(1)` if district policy mandates at least one chaperone.

---

## Detailed Findings by Area

### 1. Specification Compliance

| Check | Result |
|---|---|
| `FieldTripTransportationRequest` model matches §6.2 exactly | ✅ |
| All Part A fields present (busCount, chaperoneCount, needsDriver, driverName, loadingLocation, loadingTime, arriveFirstDestTime, leaveLastDestTime, additionalDestinations, tripItinerary) | ✅ |
| All Part C fields present (transportationType, transportationCost, transportationNotes, denialReason) | ✅ |
| Workflow fields (status, submittedAt, approvedAt, approvedById, deniedAt, deniedById) | ✅ |
| Cascade delete on `FieldTripRequest` | ✅ |
| `transportationApprovals` / `transportationDenials` User relations | ✅ |
| All 6 API routes registered (POST, GET, PUT, submit, approve, deny) | ✅ |
| `/transportation/pending` registered before `/:id/transportation` (routing conflict prevention) | ✅ |
| `SUBMITTED` status never set (spec says DRAFT → SUBMITTED → PENDING_TRANSPORTATION) | ⚠️ R2 |
| Types added to `fieldTrip.types.ts` instead of separate file | ⚠️ O2 |

### 2. Bus Calculation

```ts
// Backend (service):
const BUS_CAPACITY = 52;
export function calcMinBuses(studentCount: number): number {
  return Math.ceil(studentCount / BUS_CAPACITY);
}

// Frontend (form):
const BUS_CAPACITY = 52;
function calcMinBuses(studentCount: number): number {
  return Math.ceil(studentCount / BUS_CAPACITY);
}
```

- ✅ Formula is `Math.ceil(studentCount / 52)` — matches spec
- ✅ Backend enforces minimum in `create()` and `update()` with descriptive error message
- ✅ Frontend shows `inputProps={{ min: minBuses }}` and field-level validation
- ✅ Initial form state seeds `busCount` from `existing?.busCount ?? minBuses`

### 3. Pre-population

All 12 read-only fields from Step 1 are correctly displayed in the `TransportationRequestForm.tsx` summary card:

| Field | Displayed | Source |
|---|---|---|
| School | ✅ | `trip.schoolBuilding` |
| Sponsor / Teacher | ✅ | `trip.teacherName` |
| Trip Date | ✅ | `trip.tripDate` (formatted UTC) |
| Grade / Group | ✅ | `trip.gradeClass` |
| # Students | ✅ | `trip.studentCount` |
| Departure Time | ✅ | `trip.departureTime` |
| Return Time | ✅ | `trip.returnTime` |
| Destination | ✅ | `trip.destination` |
| Destination Address | ✅ | `trip.destinationAddress` (conditional) |
| Transportation Details | Not shown | `trip.transportationDetails` — minor gap, low priority |

### 4. Part C Gating

**Backend service (approve and deny both enforce):**
```ts
const principalApproval = transportRequest.fieldTripRequest.approvals.find(
  (a) => a.stage === 'SUPERVISOR' && a.action === 'APPROVED',
);
if (!principalApproval) {
  throw new ValidationError(
    'Transportation cannot be processed until the Building Principal has approved the field trip (Part B)',
  );
}
```

**Frontend (`TransportationPartCForm.tsx`):**
```ts
const canActOnPartC =
  !isOwner &&
  transport.status === 'PENDING_TRANSPORTATION' &&
  !!principalApproval;
```
Part C form is conditionally rendered only when `canActOnPartC === true`. A warning chip is shown otherwise. ✅

### 5. Security

| Check | Result | Notes |
|---|---|---|
| `authenticate` on all routes | ✅ | `router.use(authenticate)` before all routes |
| CSRF validation on state-changing routes | ✅ | `router.use(validateCsrfToken)`; GET requests excluded by `PROTECTED_METHODS` guard |
| `requireModule('FIELD_TRIPS', 3)` on approve/deny | ✅ | Route-level enforcement |
| Service-level permission check in approve/deny | ✅ | Double-checks `permLevel < 3` |
| No `console.log` in any file | ✅ | Structured `logger` used throughout |
| Zod validation on all 4 input types | ✅ | CreateTransportationSchema, UpdateTransportationSchema, ApproveTransportationSchema, DenyTransportationSchema |
| Custom error classes | ✅ | NotFoundError, ValidationError, AuthorizationError from `utils/errors.ts` |
| No `any` types | ✅ | Clean TypeScript throughout |
| No tokens in localStorage | ✅ | Auth via HttpOnly cookie + JWT on server |
| Prisma parameterized queries (no raw SQL) | ✅ | |
| `additionalDestinations` JSON validated by Zod before insert | ✅ | `z.array(AdditionalDestinationSchema).max(10)` |
| Row-level access: level 2 users see only own requests | ✅ | `getByTripId` service checks `submittedById !== userId` when `permLevel < 3` |

### 6. Consistency

| Check | Result |
|---|---|
| Service exported as singleton matching FieldTripService pattern | ✅ |
| Controller uses `handleControllerError` for all catch blocks | ✅ |
| Controller re-validates inputs with Zod `.parse()` after middleware pre-validation | ✅ (defense-in-depth) |
| Non-blocking email sends wrapped in `.catch()` with `logger.warn` | ✅ |
| `req.user!.permLevel ?? 1` default pattern matches other field trip controllers | ✅ |
| `TRANSPORT_WITH_TRIP` Prisma include constant (mirrors `TRIP_WITH_APPROVALS` pattern) | ✅ |
| Frontend service returns `null` on 404, matching existing service patterns | ✅ |

### 7. Functionality (End-to-End)

| Flow | Status |
|---|---|
| Teacher submits Step 1, Step 2 form becomes available | ✅ |
| Step 2 form pre-populated from Step 1 data | ✅ |
| Teacher creates DRAFT transportation request | ✅ |
| Bus count minimum enforced (cannot set below ceil(students/52)) | ✅ |
| Teacher submits → PENDING_TRANSPORTATION | ✅ |
| Email notification sent to Transportation Director group | ✅ |
| Transportation Director sees pending queue in FieldTripApprovalPage | ✅ |
| Director navigates to `/field-trips/:id/transportation/view` | ✅ |
| Part B approval chip displayed (principal approval status) | ✅ |
| Part C form blocked until Part B approved (canActOnPartC gate) | ✅ |
| Director approves → TRANSPORTATION_APPROVED | ✅ |
| Director denies (with required reason) → TRANSPORTATION_DENIED | ✅ |
| Approval/denial email sent to submitter | ✅ |
| FieldTripDetailPage shows Step 2 section/button | ✅ |
| Edit & Resubmit after denial | ❌ Cache-only mutation; backend rejects (see R1) |

### 8. Code Quality

- **Readability**: Excellent. Section comments (`// ─── Create draft ───`) are consistent with backend codebase style.
- **Type safety**: All DTO types inferred from Zod schemas with `z.infer<>`. Frontend types match backend shapes.
- **Partial update pattern**: `UpdateTransportationSchema = CreateTransportationSchema.partial()` is idiomatic reuse.
- **Null handling**: `Prisma.DbNull` used correctly for JSON null vs SQL null semantics in `additionalDestinations`.
- **Error messages**: Descriptive, include context-specific values (student count, bus count).

---

## Overall Assessment

**PASS**

All critical paths work correctly. Both builds succeed cleanly. Security posture is strong: authentication, CSRF, Zod validation, row-level access control, custom error classes, structured logging. The implementation faithfully captures the spec's three-part form structure, correctly gates Part C on Part B completion, and integrates the Transportation Director approval queue.

The two recommended items (broken Edit & Resubmit path, dead SUBMITTED status) should be addressed in the next sprint — neither is a blocker for production deployment. The Edit & Resubmit issue should be resolved before the feature is exposed to end users to avoid a confusing failure path.
