# Field Trip Transportation Request — Step 2 Specification

> **Author:** SubAgent (Research Phase)
> **Date:** 2026-04-30
> **Project:** Tech-V2 — Tech Department Management System
> **Status:** DRAFT — Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Step 1 Field Inventory (What Already Exists)](#2-step-1-field-inventory-what-already-exists)
3. [Step 2 New Fields Required](#3-step-2-new-fields-required)
4. [Pre-Population Logic](#4-pre-population-logic)
5. [Bus Count Calculation Logic](#5-bus-count-calculation-logic)
6. [Database Schema Changes](#6-database-schema-changes)
7. [API Routes](#7-api-routes)
8. [Frontend Component Structure](#8-frontend-component-structure)
9. [Approval Workflow](#9-approval-workflow)
10. [Status Flow](#10-status-flow)
11. [Security Considerations](#11-security-considerations)
12. [Implementation Steps in Order](#12-implementation-steps-in-order)

---

## 1. Overview

### What Is Step 2?

The paper "Request for Transportation" form is a **separate document** from the initial field trip request. It maps to a second digital form (Step 2) that:

1. Is initiated when a `FieldTripRequest` has `transportationNeeded = true`.
2. Collects transportation-specific logistics not captured in Step 1 (loading location, times, bus count, driver info, additional stops).
3. Routes to the **Transportation Director** for Part C (office approval, transport type, assessed cost).
4. Parallels the paper form's three-part structure:
   - **Part A** → Filled by the submitter (Step 2 form fields below)
   - **Part B** → Building Principal signature — already tracked by the existing `FieldTripApproval` at the `PENDING_SUPERVISOR` stage of Step 1
   - **Part C** → Transportation office action (new `PENDING_TRANSPORTATION` approval step in Step 2)

### What Is NOT Changed

- The Step 1 `FieldTripRequest` model, routes, validators, controller, and frontend pages are **unchanged**.
- The existing 4-stage approval chain (SUPERVISOR → ASST_DIRECTOR → DIRECTOR → FINANCE_DIRECTOR) is **unchanged**.
- The existing email notification to Transportation Secretary at Step 1 submission is **unchanged** (it stays as the notification trigger for transportation awareness).

---

## 2. Step 1 Field Inventory (What Already Exists)

The following fields from the paper "Request for Transportation" form are **already captured** in Step 1 (`FieldTripRequest`):

| Paper Form Field | DB Column (FieldTripRequest) | Notes |
|---|---|---|
| Date submitted | `submittedAt` | Auto-set when status moves DRAFT → PENDING_SUPERVISOR |
| School | `schoolBuilding` | Dropdown from active SCHOOL-type locations |
| Group/activity requesting transportation | `gradeClass` | Grade/class dropdown (Pre-K through High School) |
| Sponsor name | `teacherName` | Pre-populated from JWT `user.name` |
| Charged / bill to | `fundingSource` | "Funding source / account number" |
| Trip date | `tripDate` | Calendar date picker |
| Number of Students | `studentCount` | Integer 1–500 |
| Leaving school time | `departureTime` | Time dropdown (15-min increments, 5:00 AM–11:45 PM) |
| Return to school time | `returnTime` | Same time dropdown |
| Primary destination name | `destination` | String, max 500 chars |
| Physical address of primary destination | `destinationAddress` | String, max 500 chars |
| Transportation needed flag | `transportationNeeded` | Boolean (radio Yes/No in form) |
| Transportation description (if needed) | `transportationDetails` | Free text, conditional on `transportationNeeded` |
| Alternate transport description (if no bus) | `alternateTransportation` | Free text, conditional on `!transportationNeeded` |
| Chaperone narrative | `chaperoneInfo` | Free text — NOT a numeric count |
| Emergency contact | `emergencyContact` | String |
| Educational purpose / itinerary basis | `purpose` | Text ≥10 chars |
| Subject area (HS only) | `subjectArea` | Conditional on gradeClass === 'High School' |
| Preliminary activities | `preliminaryActivities` | Text |
| Follow-up activities | `followUpActivities` | Text |
| Overnight trip flag | `isOvernightTrip` | Boolean |
| Return date (overnight) | `returnDate` | Conditional on `isOvernightTrip` |

### Step 1 Fields NOT on the Transportation Paper Form (Step 1 Only)

These are captured in Step 1 but are not part of the paper transportation form:
- `costPerStudent`, `totalCost` — internal cost estimates
- `additionalNotes` — general notes
- `emergencyContact`, `preliminaryActivities`, `followUpActivities`
- `subjectArea`, `isOvernightTrip`, `returnDate`
- Workflow fields: `status`, `fiscalYear`, `approverEmailsSnapshot`, `submitterEmail`

---

## 3. Step 2 New Fields Required

These fields appear on the paper "Request for Transportation" form but are **absent from** the existing `FieldTripRequest` model. They must be stored in a new `FieldTripTransportationRequest` model.

### Part A — Submitter-Filled Fields

| Field | DB Column | Type | Required | Notes |
|---|---|---|---|---|
| Number of buses | `busCount` | `Int` | Auto-calculated, editable | `ceil(studentCount / 52)`; submitter may adjust upward |
| Number of chaperones | `chaperoneCount` | `Int` | Yes | Numeric count (distinct from `chaperoneInfo` text in Step 1) |
| Do you need a driver? | `needsDriver` | `Boolean` | Yes | Radio: Yes / No |
| If not, who is driving? | `driverName` | `String?` | Conditional | Required when `needsDriver = false` |
| Specific location of loading place | `loadingLocation` | `String` | Yes | Where students board the bus |
| Loading time | `loadingTime` | `String` | Yes | When buses arrive / students load (HH:MM AM/PM) |
| Arrive first destination time | `arriveFirstDestTime` | `String?` | Optional | Estimated arrival at first stop |
| Leave last destination time | `leaveLastDestTime` | `String?` | Optional | Estimated departure from last stop |
| Additional destination stops | `additionalDestinations` | `Json?` | Optional | Array of `{name: string, address: string}` objects for multi-stop trips |
| Trip itinerary | `tripItinerary` | `Text?` | Optional | Narrative schedule for the day; supplements `purpose` from Step 1 |

### Part C — Transportation Office Fields (filled by Transportation Director)

| Field | DB Column | Type | Notes |
|---|---|---|---|
| Type of transportation | `transportationType` | `String?` | E.g., `'DISTRICT_BUS'`, `'CHARTER'`, `'PARENT_TRANSPORT'`, `'WALKING'` |
| Transportation cost assessed | `transportationCost` | `Decimal(10,2)?` | Cost determined by transportation office |
| Approval notes | `transportationNotes` | `Text?` | Approver notes for Part C |
| Denial reason | `denialReason` | `Text?` | Required when denied |

### Workflow / Audit Fields

| Field | DB Column | Type | Notes |
|---|---|---|---|
| Status | `status` | `String` | `'DRAFT'` \| `'SUBMITTED'` \| `'PENDING_TRANSPORTATION'` \| `'TRANSPORTATION_APPROVED'` \| `'TRANSPORTATION_DENIED'` |
| Submitted at | `submittedAt` | `DateTime?` | Set when DRAFT → SUBMITTED |
| Approved at | `approvedAt` | `DateTime?` | Set when TRANSPORTATION_APPROVED |
| Approved by | `approvedById` | `String?` | FK → User |
| Denied at | `deniedAt` | `DateTime?` | Set when TRANSPORTATION_DENIED |
| Denied by | `deniedById` | `String?` | FK → User |
| Created at | `createdAt` | `DateTime` | @default(now()) |
| Updated at | `updatedAt` | `DateTime` | @updatedAt |

---

## 4. Pre-Population Logic

When the Step 2 form is opened (GET `/api/field-trips/:id/transportation`), the frontend populates read-only display fields from the parent `FieldTripRequest`. These are **not re-stored** in the new model — they are always read from Step 1:

| Step 2 Display Label | Source (Step 1 field) | Editable in Step 2? |
|---|---|---|
| Date submitted | `submittedAt` (formatted) | No — read-only display |
| School | `schoolBuilding` | No — read-only display |
| Sponsor name | `teacherName` | No — read-only display |
| Group / activity | `gradeClass` | No — read-only display |
| Charged / bill to | `fundingSource` | No — read-only display |
| Trip date | `tripDate` | No — read-only display |
| Number of students | `studentCount` | No — read-only (used for bus calc) |
| Leaving school time | `departureTime` | No — read-only display |
| Return to school time | `returnTime` | No — read-only display |
| Primary destination | `destination` | No — read-only display |
| Primary destination address | `destinationAddress` | No — read-only display |
| Transportation details | `transportationDetails` | No — read-only display |
| **Number of buses** | Calculated: `ceil(studentCount / 52)` | **Yes — submitter may increase** |

---

## 5. Bus Count Calculation Logic

```typescript
// Auto-calculated default; user may only INCREASE, not decrease below the minimum
export function calcMinBuses(studentCount: number): number {
  return Math.ceil(studentCount / 52);
}
```

**Rules:**
- `busCount` is initialized to `calcMinBuses(trip.studentCount)` when the Step 2 form is first opened.
- The form enforces `busCount >= calcMinBuses(studentCount)` with a validation error if the user tries to enter a lower number.
- The 52-seat capacity is a hard-coded constant (district standard); no environment variable needed at this time.

---

## 6. Database Schema Changes

### 6.1 Add to `FieldTripRequest` model

No changes required to the existing `FieldTripRequest` model. One relation field must be added:

```prisma
// In model FieldTripRequest, after the existing relations:
transportationRequest     FieldTripTransportationRequest?
```

### 6.2 New Model: `FieldTripTransportationRequest`

Add after the `FieldTripStatusHistory` model in `schema.prisma`:

```prisma
model FieldTripTransportationRequest {
  id                      String    @id @default(uuid())
  fieldTripRequestId      String    @unique    // one-to-one

  // Part A — Submitter fields
  busCount                Int                           // ceil(studentCount / 52), submitter may increase
  chaperoneCount          Int                           // numeric chaperone count
  needsDriver             Boolean                       // true = district driver requested
  driverName              String?   @db.VarChar(200)    // required when needsDriver = false
  loadingLocation         String    @db.VarChar(500)    // specific loading place
  loadingTime             String    @db.VarChar(20)     // when buses arrive / students board
  arriveFirstDestTime     String?   @db.VarChar(20)     // estimated arrival at first stop
  leaveLastDestTime       String?   @db.VarChar(20)     // estimated departure from last stop
  additionalDestinations  Json?                         // [{name, address}, ...] for multi-stop trips
  tripItinerary           String?   @db.Text            // narrative day schedule

  // Part C — Transportation office (set by Transportation Director on approve/deny)
  transportationType      String?   @db.VarChar(100)    // 'DISTRICT_BUS' | 'CHARTER' | 'PARENT_TRANSPORT' | 'WALKING'
  transportationCost      Decimal?  @db.Decimal(10, 2)  // cost assessed by transportation office
  transportationNotes     String?   @db.Text
  denialReason            String?   @db.Text

  // Workflow
  status                  String    @default("DRAFT")
  // DRAFT | SUBMITTED | PENDING_TRANSPORTATION | TRANSPORTATION_APPROVED | TRANSPORTATION_DENIED

  // Who processed Part C
  approvedById            String?
  approvedAt              DateTime?
  deniedById              String?
  deniedAt                DateTime?

  // Timestamps
  submittedAt             DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  // Relations
  fieldTripRequest        FieldTripRequest @relation(fields: [fieldTripRequestId], references: [id], onDelete: Cascade)
  approvedBy              User?           @relation("TransportationApprover", fields: [approvedById], references: [id])
  deniedBy                User?           @relation("TransportationDenier", fields: [deniedById], references: [id])

  @@index([fieldTripRequestId])
  @@index([status])
  @@map("field_trip_transportation_requests")
}
```

### 6.3 User Model Relations

Add to the `User` model in `schema.prisma`:

```prisma
transportationApprovals   FieldTripTransportationRequest[] @relation("TransportationApprover")
transportationDenials     FieldTripTransportationRequest[] @relation("TransportationDenier")
```

### 6.4 Migration

After schema changes, generate and apply a migration:

```bash
npx prisma migrate dev --name add_field_trip_transportation_request
```

---

## 7. API Routes

All routes mount under `/api/field-trips/:id/transportation` and are added to `fieldTrip.routes.ts`. All require `authenticate` and `validateCsrfToken` (already applied via `router.use()`).

| Method | Path | Permission | Description |
|---|---|---|---|
| `POST` | `/api/field-trips/:id/transportation` | FIELD_TRIPS level 2 | Create Step 2 form (DRAFT). Fails if one already exists or if `transportationNeeded=false`. |
| `GET` | `/api/field-trips/:id/transportation` | FIELD_TRIPS level 2 | Fetch Step 2 form + parent trip data. Returns 404 if not created yet. |
| `PUT` | `/api/field-trips/:id/transportation` | FIELD_TRIPS level 2 | Update Step 2 while in DRAFT status. Only submitter may edit. |
| `POST` | `/api/field-trips/:id/transportation/submit` | FIELD_TRIPS level 2 | Submit Step 2 (DRAFT → SUBMITTED → PENDING_TRANSPORTATION). Only submitter. Validates all required Part A fields. |
| `POST` | `/api/field-trips/:id/transportation/approve` | FIELD_TRIPS level 3 | Transportation Director approves Part C. Sets transportationType + transportationCost. Moves to TRANSPORTATION_APPROVED. |
| `POST` | `/api/field-trips/:id/transportation/deny` | FIELD_TRIPS level 3 | Transportation Director denies. Requires `denialReason`. Moves to TRANSPORTATION_DENIED. |

### Route Registration (fieldTrip.routes.ts additions)

```typescript
import * as fieldTripTransportationController from '../controllers/fieldTripTransportation.controller';
import {
  CreateTransportationSchema,
  UpdateTransportationSchema,
  ApproveTransportationSchema,
  DenyTransportationSchema,
} from '../validators/fieldTripTransportation.validators';

// Transportation sub-resource routes (after existing /:id routes)
router.post(
  '/:id/transportation',
  validateRequest(FieldTripIdParamSchema, 'params'),
  validateRequest(CreateTransportationSchema, 'body'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripTransportationController.create,
);

router.get(
  '/:id/transportation',
  validateRequest(FieldTripIdParamSchema, 'params'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripTransportationController.getByTripId,
);

router.put(
  '/:id/transportation',
  validateRequest(FieldTripIdParamSchema, 'params'),
  validateRequest(UpdateTransportationSchema, 'body'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripTransportationController.update,
);

router.post(
  '/:id/transportation/submit',
  validateRequest(FieldTripIdParamSchema, 'params'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripTransportationController.submit,
);

router.post(
  '/:id/transportation/approve',
  validateRequest(FieldTripIdParamSchema, 'params'),
  validateRequest(ApproveTransportationSchema, 'body'),
  requireModule('FIELD_TRIPS', 3),
  fieldTripTransportationController.approve,
);

router.post(
  '/:id/transportation/deny',
  validateRequest(FieldTripIdParamSchema, 'params'),
  validateRequest(DenyTransportationSchema, 'body'),
  requireModule('FIELD_TRIPS', 3),
  fieldTripTransportationController.deny,
);
```

### Request/Response Shapes

#### `POST /api/field-trips/:id/transportation` body
```json
{
  "busCount": 2,
  "chaperoneCount": 3,
  "needsDriver": true,
  "driverName": null,
  "loadingLocation": "Front entrance, 1st and Main St",
  "loadingTime": "8:00 AM",
  "arriveFirstDestTime": "9:30 AM",
  "leaveLastDestTime": "2:00 PM",
  "additionalDestinations": [
    { "name": "Museum of Science", "address": "1 Science Park, Boston, MA 02114" }
  ],
  "tripItinerary": "8:00 AM depart school, 9:30 AM arrive museum, 2:00 PM depart, 3:30 PM return"
}
```

#### `POST /api/field-trips/:id/transportation/approve` body
```json
{
  "transportationType": "DISTRICT_BUS",
  "transportationCost": 350.00,
  "notes": "Two buses assigned. Route confirmed."
}
```

#### `POST /api/field-trips/:id/transportation/deny` body
```json
{
  "reason": "No buses available on this date.",
  "notes": "All district buses reserved for graduation event."
}
```

---

## 8. Frontend Component Structure

### 8.1 New Files to Create

```
frontend/src/
├── pages/FieldTrip/
│   ├── FieldTripTransportationPage.tsx   # Step 2 form (create/edit)
│   └── FieldTripTransportationDetail.tsx # Read-only view for approvers
├── services/
│   └── fieldTripTransportation.service.ts
└── types/
    └── fieldTripTransportation.types.ts
```

### 8.2 Router Additions (App.tsx or router config)

```tsx
// Add alongside existing field trip routes
<Route path="/field-trips/:id/transportation"        element={<FieldTripTransportationPage />} />
<Route path="/field-trips/:id/transportation/view"   element={<FieldTripTransportationDetail />} />
```

### 8.3 FieldTripTransportationPage Layout

The form is a **single-page form** (not a stepper) with two collapsible sections:

```
FieldTripTransportationPage
│
├── [Read-Only Summary Card] — loaded from GET /api/field-trips/:id
│   Date Submitted | School | Sponsor | Group | Charge To | Trip Date | Students | Depart | Return
│
├── [Part A: Transportation Details] — editable
│   ┌─ Bus Information
│   │   Number of Buses       [Int, min=ceil(students/52)]
│   │   Number of Chaperones  [Int, min=1]
│   │   Needs District Driver [Radio: Yes / No]
│   │   Driver Name           [Text, shown when "No"]
│   │
│   ├─ Loading Information
│   │   Loading Location      [Text]
│   │   Loading Time          [Select from TIME_OPTIONS]
│   │
│   ├─ Trip Timing
│   │   Arrive First Dest.    [Select, optional]
│   │   Leave Last Dest.      [Select, optional]
│   │
│   ├─ Additional Destinations
│   │   [Dynamic list: Add Stop button → name + address per row]
│   │   (Primary destination from Step 1 shown read-only above the list)
│   │
│   └─ Trip Itinerary
│       [Multiline TextField]
│
└── [Action Buttons]
    [Save as Draft]  [Submit for Transportation Review]
```

### 8.4 FieldTripTransportationDetail (Approver View)

```
FieldTripTransportationDetail
│
├── [Step 1 Summary] — same read-only card as above
├── [Part A Summary] — all fields from the submitted transportation form
├── [Part B Status] — pull from FieldTripApproval records, show principal approval
│
├── [Part C: Transportation Office Action] — shown only when status=PENDING_TRANSPORTATION
│   │   AND user permLevel >= 3 (Transportation Director)
│   ├─ Type of Transportation [Select: District Bus / Charter / Parent Transport / Walking]
│   ├─ Assessed Cost          [Number input]
│   ├─ Notes                  [Textarea]
│   └─ [Approve] [Deny] buttons
│
└── [Status History]
```

### 8.5 FieldTripDetailPage Integration

Add a "Transportation Request" section to the existing `FieldTripDetailPage.tsx` that:
- Shows nothing if `transportationNeeded = false`
- Shows a "Complete Transportation Form (Step 2)" button if `transportationNeeded = true` and no transportation request exists yet
- Shows status chip + link to view/edit if a transportation request exists

### 8.6 Update FieldTripTransportationPage — Entry Points

- From `FieldTripDetailPage` → "Complete Step 2 Transportation" button → `/field-trips/:id/transportation`
- From `FieldTripApprovalPage` (Transportation Director tab) → row click → `/field-trips/:id/transportation/view`

### 8.7 Transportation Director Approval Queue

Add a tab or separate section to `FieldTripApprovalPage.tsx` for Transportation Directors (permLevel >= 3 in FIELD_TRIPS AND user is in `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID`). Shows transportation requests with `status = 'PENDING_TRANSPORTATION'`.

Alternatively, use the same `getPendingApprovals` endpoint with an extra query param `?includeTransportation=true` that returns a combined list — this keeps the backend service clean.

---

## 9. Approval Workflow

### Paper Form Mapping

| Paper Form Part | Digital Equivalent | Who Acts |
|---|---|---|
| **Part A**: Submitter fills out request | Step 2 form submission | Teacher/Sponsor (FIELD_TRIPS level 2) |
| **Part B**: Building Principal approves | Existing `FieldTripApproval` at `PENDING_SUPERVISOR` stage on the parent `FieldTripRequest` | Principal / VP (FIELD_TRIPS level 3) |
| **Part C**: Transportation office uses | Transportation Director approves/denies `FieldTripTransportationRequest` | Transportation Director (FIELD_TRIPS level 3, `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID`) |

### Timing Constraint

The Transportation Director (Part C) **should only process the request after the Building Principal (Part B) has approved**. Enforce this in the `approve`/`deny` service method:

```typescript
// In fieldTripTransportation.service.ts approve():
const parentTrip = await prisma.fieldTripRequest.findUnique({ where: { id: transportRequest.fieldTripRequestId } });
const principalApproval = parentTrip?.approvals?.find(a => a.stage === 'SUPERVISOR' && a.action === 'APPROVED');
if (!principalApproval) {
  throw new ValidationError('Transportation cannot be processed until the Building Principal has approved the field trip.');
}
```

### Email Notifications

| Trigger | Recipient(s) | Template |
|---|---|---|
| Step 2 submitted (`DRAFT → PENDING_TRANSPORTATION`) | Transportation Director group emails (`ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID`) | "Transportation form ready for review" |
| Transportation Director approves | Trip submitter email | "Your transportation request has been approved" |
| Transportation Director denies | Trip submitter email | "Your transportation request was denied — reason" |

Add three functions to `email.service.ts`:
- `sendTransportationStep2SubmittedNotice(emails[], trip, transportRequest)`
- `sendTransportationApproved(submitterEmail, trip, transportRequest)`
- `sendTransportationDenied(submitterEmail, trip, transportRequest, reason)`

---

## 10. Status Flow

### Parent `FieldTripRequest` (Step 1) — Unchanged

```
DRAFT
  → PENDING_SUPERVISOR       (submit, level 2)
  → PENDING_ASST_DIRECTOR    (level 3 approve: Principal/VP)
  → PENDING_DIRECTOR         (level 4 approve: Asst. Director)
  → PENDING_FINANCE_DIRECTOR (level 5 approve: Director of Schools)
  → APPROVED                 (level 6 approve: Finance Director)
  → DENIED                   (any pending stage, level ≥ min)
```

### `FieldTripTransportationRequest` (Step 2) — New

```
DRAFT
  → SUBMITTED              (submit action by level 2, validates all Part A fields)
  → PENDING_TRANSPORTATION (auto-transition on submit; notifies Transportation Director)
  → TRANSPORTATION_APPROVED  (level 3 approve by Transportation Director)
  → TRANSPORTATION_DENIED    (level 3 deny by Transportation Director, requires reason)

TRANSPORTATION_DENIED → [submitter may re-edit and re-submit]  (optional future feature)
```

### Combined Multi-Step Lifecycle View (both steps together)

```
[Teacher creates Step 1] → Step 1: DRAFT
[Teacher submits Step 1] → Step 1: PENDING_SUPERVISOR
  ↓ (Teacher fills Step 2 transportation form in parallel)
[Teacher submits Step 2] → Step 2: PENDING_TRANSPORTATION
  ↓
[Principal approves Step 1] → Step 1: PENDING_ASST_DIRECTOR ... → APPROVED
  ↓ (Prerequisite for Part C)
[Transportation Director reviews] → Step 2: TRANSPORTATION_APPROVED or TRANSPORTATION_DENIED
```

> **Note:** Steps 1 and 2 progress somewhat independently. The submitter can fill out Step 2 as soon as Step 1 is submitted (while it's in the approval chain). The Transportation Director's Part C action is gated on principal approval of Step 1 (Part B check in the service layer).

---

## 11. Security Considerations

### Authorization

| Action | Rule |
|---|---|
| Create Step 2 | `submittedById === req.user.id` AND parent trip `transportationNeeded === true` AND parent trip `status !== 'DRAFT'` |
| Edit Step 2 (DRAFT only) | `submittedById === req.user.id` AND `transportationRequest.status === 'DRAFT'` |
| Submit Step 2 | Same as edit |
| Read Step 2 | Own request (any level 2+) or level 3+ can read any |
| Approve / Deny Part C | FIELD_TRIPS level 3, enforces `principalApproval` exists on parent trip |

### Input Validation (Zod Schemas)

- `busCount`: `z.number().int().min(1).max(99)` — validated against `>=calcMinBuses()` in the service (not schema, since schema doesn't have context)
- `chaperoneCount`: `z.number().int().min(0).max(200)`
- `loadingLocation` / `driverName`: `z.string().max(500)`
- `loadingTime` / `arriveFirstDestTime` / `leaveLastDestTime`: `z.string().max(20).optional()`
- `additionalDestinations`: `z.array(z.object({ name: z.string().max(500), address: z.string().max(500) })).max(10).optional()`
- `tripItinerary`: `z.string().max(3000).optional()`
- `transportationType`: `z.enum(['DISTRICT_BUS','CHARTER','PARENT_TRANSPORT','WALKING']).optional()`
- `transportationCost`: `z.number().min(0).optional()`

### CSRF

All state-changing routes are already covered by `router.use(validateCsrfToken)` in `fieldTrip.routes.ts` — no additional CSRF work required.

### Prisma Injection

All queries use Prisma parameterized queries. No raw SQL. The `additionalDestinations` JSON column is treated as opaque JSON validated by Zod before insert — no SQL injection vector.

### Data Exposure

The `GET /api/field-trips/:id/transportation` endpoint must enforce the same row-level access rule as `GET /api/field-trips/:id`:
- Level 2: Own requests only (check `parentTrip.submittedById === req.user.id`)
- Level 3+: All requests (scoped to own in service, full access for approvers)

---

## 12. Implementation Steps in Order

Follow this exact sequence to avoid broken build states:

### Phase 1: Database & Shared Types

1. **`backend/prisma/schema.prisma`**
   - Add `transportationRequest FieldTripTransportationRequest?` relation to `FieldTripRequest`
   - Add `FieldTripTransportationRequest` model (see §6.2)
   - Add `transportationApprovals` and `transportationDenials` relations to `User` model

2. **Run migration**
   ```bash
   npx prisma migrate dev --name add_field_trip_transportation_request
   npx prisma generate
   ```

### Phase 2: Backend

3. **`backend/src/validators/fieldTripTransportation.validators.ts`** (new file)
   - `CreateTransportationSchema`, `UpdateTransportationSchema`, `ApproveTransportationSchema`, `DenyTransportationSchema`
   - Status constants: `TRANSPORTATION_STATUSES`

4. **`backend/src/services/fieldTripTransportation.service.ts`** (new file)
   - `FieldTripTransportationService` class with methods:
     - `create(userId, fieldTripId, data)` — validates parent exists, `transportationNeeded=true`, no duplicate
     - `getByTripId(userId, fieldTripId, permLevel)` — row-level access
     - `update(userId, fieldTripId, data)` — DRAFT only, own records
     - `submit(userId, fieldTripId)` — DRAFT → PENDING_TRANSPORTATION, validates all required fields
     - `approve(userId, fieldTripId, permLevel, data)` — level 3+, validates principal approval exists
     - `deny(userId, fieldTripId, permLevel, reason, notes)` — level 3+

5. **`backend/src/controllers/fieldTripTransportation.controller.ts`** (new file)
   - Thin controller following the `fieldTrip.controller.ts` pattern
   - Imports and calls `fieldTripTransportationService`
   - Sends email notifications (non-blocking) after state transitions

6. **`backend/src/services/email.service.ts`** — add three functions
   - `sendTransportationStep2SubmittedNotice(emails, trip, transportRequest, submitterName)`
   - `sendTransportationApproved(submitterEmail, trip, transportRequest)`
   - `sendTransportationDenied(submitterEmail, trip, transportRequest, reason)`

7. **`backend/src/routes/fieldTrip.routes.ts`** — add 6 new route registrations (see §7)

### Phase 3: Frontend Types & Service

8. **`frontend/src/types/fieldTripTransportation.types.ts`** (new file)
   - `FieldTripTransportationRequest` interface
   - `TransportationStatus` type union
   - `CreateTransportationDto`, `UpdateTransportationDto`
   - `ApproveTransportationDto`, `DenyTransportationDto`
   - Status label/color maps

9. **`frontend/src/services/fieldTripTransportation.service.ts`** (new file)
   - Object-literal service matching `fieldTrip.service.ts` pattern
   - Methods: `create`, `getByTripId`, `update`, `submit`, `approve`, `deny`

### Phase 4: Frontend Components

10. **`frontend/src/pages/FieldTrip/FieldTripTransportationPage.tsx`** (new file)
    - Pre-populated read-only summary from parent trip
    - Editable Part A form fields
    - Bus count auto-calculate with minimum enforcement
    - Dynamic additional destinations list
    - Save as Draft + Submit actions

11. **`frontend/src/pages/FieldTrip/FieldTripTransportationDetail.tsx`** (new file)
    - Read-only view of submitted transportation request
    - Part B status pulled from parent trip approvals
    - Part C action panel (for Transportation Director, permLevel >= 3)

12. **`frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx`** — add transportation section
    - Show "Complete Transportation Form" button if `transportationNeeded && !transportationRequest`
    - Show status chip + link if transportation request exists

13. **`frontend/src/pages/FieldTrip/FieldTripApprovalPage.tsx`** — add Transportation Director tab/section
    - New tab: "Transportation Reviews" (visible to permLevel >= 3)
    - Fetches pending transportation requests for review

14. **Router** (`frontend/src/App.tsx` or routes config) — add two new route entries

### Phase 5: Testing & Validation

15. Verify `npx prisma validate` passes with no errors
16. Rebuild backend: `npm run build` in `/backend`
17. Rebuild frontend: `npm run build` in `/frontend`
18. Confirm no TypeScript errors via `tsc --noEmit`
19. Manual smoke tests:
    - Teacher submits Step 1 with `transportationNeeded=true`
    - Teacher opens Step 2 from detail page, fills fields, submits
    - Transportation Director sees it in approval queue
    - Transportation Director approves with type + cost
    - Confirm email notifications fire
    - Confirm Transportation Director cannot approve before principal approves Step 1

---

## Appendix A: Transportation Type Options

```typescript
export const TRANSPORTATION_TYPE_OPTIONS = [
  { value: 'DISTRICT_BUS',    label: 'District Bus' },
  { value: 'CHARTER',         label: 'Charter Bus' },
  { value: 'PARENT_TRANSPORT',label: 'Parent/Staff Transport' },
  { value: 'WALKING',         label: 'Walking' },
] as const;

export type TransportationType = typeof TRANSPORTATION_TYPE_OPTIONS[number]['value'];
```

## Appendix B: Step 2 Status Labels & Colors

```typescript
export const TRANSPORTATION_STATUS_LABELS: Record<TransportationStatus, string> = {
  DRAFT:                    'Draft',
  SUBMITTED:                'Submitted',
  PENDING_TRANSPORTATION:   'Pending Transportation',
  TRANSPORTATION_APPROVED:  'Approved',
  TRANSPORTATION_DENIED:    'Denied',
};

export const TRANSPORTATION_STATUS_COLORS = {
  DRAFT:                    'default',
  SUBMITTED:                'info',
  PENDING_TRANSPORTATION:   'warning',
  TRANSPORTATION_APPROVED:  'success',
  TRANSPORTATION_DENIED:    'error',
} as const;
```

## Appendix C: Environment Variable Reference

No new environment variables are required. The Transportation Director approval uses `ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID` (already defined in `groupAuth.ts` at FIELD_TRIPS level 3) and the existing email-sending infrastructure.
