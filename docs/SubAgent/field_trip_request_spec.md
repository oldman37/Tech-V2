# Field Trip Request Feature — Comprehensive Specification

> **Author:** SubAgent (Research Phase)
> **Date:** 2026-04-30
> **Project:** Tech-V2 — Tech Department Management System
> **Status:** DRAFT — Ready for Implementation

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Codebase Analysis Findings](#2-codebase-analysis-findings)
3. [Form Fields Specification](#3-form-fields-specification)
4. [Approval State Machine](#4-approval-state-machine)
5. [Database Schema — New Prisma Models](#5-database-schema--new-prisma-models)
6. [Permission System — New Module](#6-permission-system--new-module)
7. [Email Notifications](#7-email-notifications)
8. [API Endpoints](#8-api-endpoints)
9. [Frontend Components & Pages](#9-frontend-components--pages)
10. [Environment Variables](#10-environment-variables)
11. [Security Considerations](#11-security-considerations)
12. [Implementation Steps — Ordered File List](#12-implementation-steps--ordered-file-list)
13. [Research Sources & Best Practices](#13-research-sources--best-practices)

---

## 1. Overview & Goals

### Feature Summary

The Field Trip Request feature allows school staff (teachers, sponsors) to submit requests for field trips that flow through a **four-stage approval chain**: Supervisor → Assistant Director of Schools → Director → Finance Director. The Finance Director's approval is final and triggers an email notification to the original submitter.

If transportation is required, the **Transportation Secretary** Entra group is notified via email at submission time.

### Scope

| In Scope | Out of Scope |
|----------|-------------|
| Create, edit, submit, approve, deny field trip requests | External vendor booking |
| 4-stage approval workflow with email at each stage | Student roster management |
| Transportation Secretary email notification | Transportation scheduling |
| PDF generation of approved field trip requests | Payment processing |
| Status tracking dashboard | Mobile app |

---

## 2. Codebase Analysis Findings

### 2.1 File System Discovery

- **No existing legacy PHP** field trip files found in `c:\wwwroot\` — this is a greenfield feature.
- **Excel reference file** located at: `c:\Tech-V2\docs\Field Trip Request Form(1-3) (1).xlsx`
- The Excel file could not be parsed directly (binary format), so fields are based on standard district field trip form conventions confirmed by the request briefing.

### 2.2 Existing Infrastructure to Reuse

| Infrastructure | Location | How Field Trips Will Use It |
|----------------|----------|-----------------------------|
| Email via Nodemailer | `backend/src/services/email.service.ts` | Add new `sendFieldTripXxx()` functions |
| MS Graph group lookup | `email.service.ts → fetchGroupEmails()` | Fetch Transportation Secretary & approver emails |
| Zod validation middleware | `backend/src/middleware/validation.ts` | Validate all field trip endpoints |
| `requireModule()` authorization | `backend/src/utils/groupAuth.ts` | Guard field trip routes by FIELD_TRIPS perm level |
| `authenticate` middleware | `backend/src/middleware/auth.ts` | All routes require JWT cookie auth |
| CSRF protection | `backend/src/middleware/csrf.ts` | All state-changing routes |
| `UserSupervisor` model | `backend/prisma/schema.prisma` | Look up submitter's supervisor at submit time |
| `buildApproverEmailSnapshot()` pattern | `email.service.ts` | Snapshot approver emails at submit time |
| Axios `api` client | `frontend/src/services/api.ts` | All frontend API calls |
| TanStack Query | Frontend hooks | Data fetching, cache invalidation |
| MUI Stepper pattern | `frontend/src/pages/PurchaseOrders/RequisitionWizard.tsx` | Multi-step form |
| MUI Table + Tabs | `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx` | List view |

### 2.3 Existing Entra Group Environment Variables

Already defined in `backend/.env.example`:

```
ENTRA_ADMIN_GROUP_ID
ENTRA_FINANCE_DIRECTOR_GROUP_ID
ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID
ENTRA_FINANCE_PO_ENTRY_GROUP_ID
ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID
ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID
ENTRA_PRINCIPALS_GROUP_ID
ENTRA_VICE_PRINCIPALS_GROUP_ID
ENTRA_ALL_STAFF_GROUP_ID
...
```

### 2.4 Permission System Architecture

The system uses `requireModule(module, minLevel)` middleware (see `groupAuth.ts`) which:
1. Derives the user's permission level for a module from their JWT `groups` claim
2. Compares the highest matching level against `minLevel`
3. Sets `req.user.permLevel` for downstream controller use (row-level scoping)
4. ADMIN role always bypasses (gets highest level)

A new `FIELD_TRIPS` module must be added to `GROUP_MODULE_MAP` in `groupAuth.ts`.

### 2.5 Role Mapping for Approval Chain

| Approval Stage | System Role | Entra Group Env Var | Notes |
|----------------|-------------|---------------------|-------|
| Supervisor | Submitter's direct supervisor | `UserSupervisor` DB relation | Resolved per-user at submit time |
| Assistant Director | _(new — must create group var)_ | `ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID` | New group needed |
| Director | Director of Schools | `ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID` | Already exists |
| Finance Director | Finance Director | `ENTRA_FINANCE_DIRECTOR_GROUP_ID` | Already exists; final approval |
| Transportation Sec. | _(new — email-only, not approval)_ | `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID` | Value: `d0232265-a91b-4cf7-9fdb-b7fdf1eaea30` |

---

## 3. Form Fields Specification

### 3.1 Complete Field List

| # | Field Name | DB Column | Type | Required | Validation Rules |
|---|-----------|-----------|------|----------|-----------------|
| 1 | Teacher/Sponsor Name | `teacherName` | `String` | Yes | Max 200 chars; defaults to submitter's display name |
| 2 | School/Building | `schoolBuilding` | `String` | Yes | Max 200 chars |
| 3 | Grade/Class | `gradeClass` | `String` | Yes | Max 100 chars (e.g., "5th Grade", "AP Biology") |
| 4 | Number of Students | `studentCount` | `Int` | Yes | Integer, 1–500 |
| 5 | Date of Trip | `tripDate` | `DateTime` | Yes | Must be a future date (>= tomorrow) |
| 6 | Destination | `destination` | `String` | Yes | Max 500 chars |
| 7 | Purpose / Educational Objective | `purpose` | `String` | Yes | Min 10 chars, max 2000 chars |
| 8 | Departure Time | `departureTime` | `String` | Yes | Format: "HH:MM" (24-hr or stored as string "8:00 AM"); max 20 chars |
| 9 | Return Time | `returnTime` | `String` | Yes | Max 20 chars; must be after departureTime |
| 10 | Transportation Needed | `transportationNeeded` | `Boolean` | Yes | true/false; default false |
| 11 | Transportation Details | `transportationDetails` | `String?` | Cond. | Required if `transportationNeeded = true`; max 1000 chars |
| 12 | Cost Per Student | `costPerStudent` | `Decimal(10,2)` | No | Min 0; null if no cost |
| 13 | Total Cost | `totalCost` | `Decimal(10,2)` | No | Min 0; auto-calculated as `costPerStudent × studentCount` but can be overridden; null if no cost |
| 14 | Funding Source / Account Number | `fundingSource` | `String?` | No | Max 200 chars |
| 15 | Chaperone Names & Contact Info | `chaperoneInfo` | `String?` | No | Max 2000 chars |
| 16 | Emergency Contact | `emergencyContact` | `String?` | No | Max 500 chars |
| 17 | Additional Notes | `additionalNotes` | `String?` | No | Max 2000 chars |

### 3.2 Server-Side Validation Rules (Zod)

```typescript
// Key cross-field validation rules
- tripDate >= tomorrow (server clock)
- if transportationNeeded = true → transportationDetails required and non-empty
- returnTime as a string must be lexicographically later than departureTime
  (when both formatted in 24-hr "HH:MM"; or store as DateTime for proper comparison)
- totalCost, costPerStudent: Decimal(10,2), min 0
- studentCount: integer, 1–500
```

### 3.3 Auto-Populated Fields (not user-editable)

| Field | Source | Notes |
|-------|--------|-------|
| `submittedById` | `req.user.id` | Set on create |
| `submitterEmail` | `req.user.email` | Captured at submit time for final notification |
| `status` | State machine | Initial: `DRAFT` |
| `approverEmailsSnapshot` | `buildFieldTripApproverEmailSnapshot()` | Captured at submit time |
| `fiscalYear` | From `SystemSettings.currentFiscalYear` | Optional, for reporting |
| `submittedAt` | `DateTime.now()` | Set on status change to `PENDING_SUPERVISOR` |

---

## 4. Approval State Machine

### 4.1 Status Values

```typescript
type FieldTripStatus =
  | 'DRAFT'
  | 'PENDING_SUPERVISOR'
  | 'PENDING_ASST_DIRECTOR'
  | 'PENDING_DIRECTOR'
  | 'PENDING_FINANCE_DIRECTOR'
  | 'APPROVED'                   // Final: Finance Director approved
  | 'DENIED';
```

### 4.2 State Transition Diagram

```
[DRAFT]
    │
    │ submit (by submitter, FIELD_TRIPS level 2)
    ▼
[PENDING_SUPERVISOR]
    │                        │
    │ approve                │ deny
    ▼                        ▼
[PENDING_ASST_DIRECTOR]   [DENIED] ──────────────┐
    │                        │                    │
    │ approve                │ deny               │
    ▼                        ▼                    │
[PENDING_DIRECTOR]        [DENIED]               │
    │                        │                    │
    │ approve                │ deny               │
    ▼                        ▼                    │
[PENDING_FINANCE_DIRECTOR][DENIED]               │
    │                        │                    │
    │ approve                │ deny               │
    ▼                        ▼                    │
[APPROVED]                [DENIED] ──────────────┘
```

**Notes:**
- Any stage approver can deny → status goes directly to `DENIED`.
- `DENIED` is a terminal state (no re-submission from `DENIED`; submitter must create a new request).
- `DRAFT` can be edited and resubmitted by the submitter.
- A request in any `PENDING_*` stage **cannot** be edited by the submitter.

### 4.3 Transition Requirements

| From Status | To Status | Who Can Act | FIELD_TRIPS Module Level |
|-------------|-----------|-------------|--------------------------|
| `DRAFT` → `PENDING_SUPERVISOR` | Submit | Submitter | Level 2 |
| `PENDING_SUPERVISOR` → `PENDING_ASST_DIRECTOR` | Approve | Submitter's Supervisor | Level 3 |
| `PENDING_SUPERVISOR` → `DENIED` | Deny | Submitter's Supervisor | Level 3 |
| `PENDING_ASST_DIRECTOR` → `PENDING_DIRECTOR` | Approve | Asst. Director of Schools | Level 4 |
| `PENDING_ASST_DIRECTOR` → `DENIED` | Deny | Asst. Director of Schools | Level 4 |
| `PENDING_DIRECTOR` → `PENDING_FINANCE_DIRECTOR` | Approve | Director of Schools | Level 5 |
| `PENDING_DIRECTOR` → `DENIED` | Deny | Director of Schools | Level 5 |
| `PENDING_FINANCE_DIRECTOR` → `APPROVED` | Approve | Finance Director | Level 6 |
| `PENDING_FINANCE_DIRECTOR` → `DENIED` | Deny | Finance Director | Level 6 |

### 4.4 Special Case: Submitter IS Their Own Supervisor

Implement the same **supervisor bypass** pattern as the PO system:
- At submit time, check if `UserSupervisor` records exist for the submitter.
- If **no supervisor** is found → skip `PENDING_SUPERVISOR` stage and advance directly to `PENDING_ASST_DIRECTOR`.
- Log a warning that supervisor stage was bypassed.
- The `approverEmailsSnapshot` will show `supervisor: []` in this case.

---

## 5. Database Schema — New Prisma Models

Add to `backend/prisma/schema.prisma`:

```prisma
// ============================================
// FIELD TRIP REQUESTS
// ============================================

model FieldTripRequest {
  id                    String                  @id @default(uuid())

  // Submitter (auto-populated from JWT)
  submittedById         String
  submittedBy           User                    @relation("FieldTripSubmitter", fields: [submittedById], references: [id])

  // Form Fields
  teacherName           String                  @db.VarChar(200)
  schoolBuilding        String                  @db.VarChar(200)
  gradeClass            String                  @db.VarChar(100)
  studentCount          Int
  tripDate              DateTime
  destination           String                  @db.VarChar(500)
  purpose               String                  @db.Text
  departureTime         String                  @db.VarChar(20)
  returnTime            String                  @db.VarChar(20)
  transportationNeeded  Boolean                 @default(false)
  transportationDetails String?                 @db.Text
  costPerStudent        Decimal?                @db.Decimal(10, 2)
  totalCost             Decimal?                @db.Decimal(10, 2)
  fundingSource         String?                 @db.VarChar(200)
  chaperoneInfo         String?                 @db.Text
  emergencyContact      String?                 @db.VarChar(500)
  additionalNotes       String?                 @db.Text

  // Workflow State
  status                String                  @default("DRAFT")
  submitterEmail        String                  // Snapshot of submitter email for final notification
  denialReason          String?                 @db.Text

  // Snapshot of approver emails captured at submit time (prevent stale lookups)
  approverEmailsSnapshot Json?

  // Timestamps
  submittedAt           DateTime?               // Set when status moves from DRAFT → PENDING_SUPERVISOR
  approvedAt            DateTime?               // Set when status moves to APPROVED
  createdAt             DateTime                @default(now())
  updatedAt             DateTime                @updatedAt

  // Fiscal year (from SystemSettings.currentFiscalYear at submit time)
  fiscalYear            String?

  // Relations
  approvals             FieldTripApproval[]
  statusHistory         FieldTripStatusHistory[]

  @@index([status])
  @@index([submittedById])
  @@index([tripDate])
  @@index([fiscalYear])
  @@index([status, submittedById])
  @@map("field_trip_requests")
}

model FieldTripApproval {
  id                    String          @id @default(uuid())
  fieldTripRequestId    String
  stage                 String          // 'SUPERVISOR' | 'ASST_DIRECTOR' | 'DIRECTOR' | 'FINANCE_DIRECTOR'
  action                String          // 'APPROVED' | 'DENIED'
  actedById             String
  actedByName           String          // Cached display name
  actedAt               DateTime        @default(now())
  notes                 String?         @db.Text
  denialReason          String?         @db.Text

  fieldTripRequest      FieldTripRequest @relation(fields: [fieldTripRequestId], references: [id], onDelete: Cascade)
  actedBy               User            @relation("FieldTripApprover", fields: [actedById], references: [id])

  @@index([fieldTripRequestId])
  @@index([actedById])
  @@index([stage])
  @@map("field_trip_approvals")
}

model FieldTripStatusHistory {
  id                    String          @id @default(uuid())
  fieldTripRequestId    String
  fromStatus            String
  toStatus              String
  changedById           String
  changedByName         String          // Cached
  changedAt             DateTime        @default(now())
  notes                 String?         @db.Text

  fieldTripRequest      FieldTripRequest @relation(fields: [fieldTripRequestId], references: [id], onDelete: Cascade)
  changedBy             User            @relation("FieldTripStatusChangedBy", fields: [changedById], references: [id])

  @@index([fieldTripRequestId])
  @@index([changedById])
  @@index([changedAt])
  @@map("field_trip_status_history")
}
```

### 5.1 User Model Additions

Add the following relations to the existing `User` model:

```prisma
  // Field Trip relations
  submittedFieldTrips           FieldTripRequest[]          @relation("FieldTripSubmitter")
  fieldTripApprovals            FieldTripApproval[]         @relation("FieldTripApprover")
  fieldTripStatusHistory        FieldTripStatusHistory[]    @relation("FieldTripStatusChangedBy")
```

### 5.2 Migration Strategy

1. Run `prisma migrate dev --name add_field_trip_requests` to generate migration SQL.
2. The migration is non-breaking: all new tables, no changes to existing tables except User (new relations only — no new columns).

---

## 6. Permission System — New Module

### 6.1 New Module: `FIELD_TRIPS`

Add `'FIELD_TRIPS'` to the `PermissionModuleType` union in `groupAuth.ts`:

```typescript
type PermissionModuleType = 'TECHNOLOGY' | 'MAINTENANCE' | 'REQUISITIONS' | 'WORK_ORDERS' | 'FIELD_TRIPS';
```

### 6.2 FIELD_TRIPS Module Levels

| Level | Name | What it Allows |
|:-----:|------|----------------|
| 1 | **Viewer** | View own submitted field trip requests (read-only) |
| 2 | **Submitter** | Create, edit, delete own drafts; submit for approval |
| 3 | **Supervisor** | Approve/deny at PENDING_SUPERVISOR stage; view all requests in their supervised scope |
| 4 | **Asst. Director of Schools** | Approve/deny at PENDING_ASST_DIRECTOR stage; view all requests |
| 5 | **Director of Schools** | Approve/deny at PENDING_DIRECTOR stage; view all requests |
| 6 | **Finance Director** | Final approve/deny at PENDING_FINANCE_DIRECTOR stage; view all requests |

### 6.3 GROUP_MODULE_MAP Entry

Add to `GROUP_MODULE_MAP` in `backend/src/utils/groupAuth.ts`:

```typescript
FIELD_TRIPS: [
  ['ENTRA_ADMIN_GROUP_ID', 6],
  ['ENTRA_FINANCE_DIRECTOR_GROUP_ID', 6],
  ['ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID', 5],
  ['ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID', 4],
  ['ENTRA_PRINCIPALS_GROUP_ID', 3],
  ['ENTRA_VICE_PRINCIPALS_GROUP_ID', 3],
  ['ENTRA_SUPERVISORS_OF_INSTRUCTION_GROUP_ID', 3],
  ['ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID', 3],
  ['ENTRA_SPED_DIRECTOR_GROUP_ID', 3],
  ['ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID', 3],
  ['ENTRA_NURSE_DIRECTOR_GROUP_ID', 3],
  ['ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID', 3],
  ['ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID', 3],
  ['ENTRA_ALL_STAFF_GROUP_ID', 2],
],
```

**Rationale:**
- All staff (teachers, sponsors) need level 2 to create and submit requests.
- Principals/VPs/Directors-of-departments get level 3 (supervisor).
- Asst. Director of Schools gets level 4 (new group env var).
- Director of Schools gets level 5.
- Finance Director gets level 6 (final).
- Admin gets level 6 (full bypass).

---

## 7. Email Notifications

### 7.1 Email Architecture

All emails follow the existing pattern in `email.service.ts`:
- Use the `sendMail()` internal helper (nodemailer transporter singleton)
- Wrap user-supplied strings with `escapeHtml()` before embedding in HTML
- Use `try/catch` — email failures are logged but never thrown
- All recipients resolved at **submit time** and stored in `approverEmailsSnapshot` on the `FieldTripRequest`

### 7.2 `buildFieldTripApproverEmailSnapshot()` Function

New function in `email.service.ts` (mirrors `buildApproverEmailSnapshot` for POs):

```typescript
export async function buildFieldTripApproverEmailSnapshot(submitterId: string): Promise<{
  supervisor: string[];
  asstDirector: string[];
  director: string[];
  financeDirector: string[];
  transportationSecretary: string[];
}>
```

Resolves:
- `supervisor` — from `UserSupervisor` DB relation (same as PO pattern)
- `asstDirector` — `fetchGroupEmails(ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID)`
- `director` — `fetchGroupEmails(ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID)` (already exists)
- `financeDirector` — `fetchGroupEmails(ENTRA_FINANCE_DIRECTOR_GROUP_ID)` (already exists)
- `transportationSecretary` — `fetchGroupEmails(ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID)` (new)

### 7.3 Email Sent at Each Stage

| Trigger | Function Name | To | Subject Template |
|---------|--------------|-----|-----------------|
| Request submitted | `sendFieldTripSubmitted` | Supervisor (from snapshot) | `Field Trip Approval Required: [Destination]` |
| Transportation needed | `sendFieldTripTransportationAlert` | Transportation Secretary group | `Transportation Requested: Field Trip to [Destination] on [Date]` |
| Supervisor approves | `sendFieldTripStageApproved` | Asst. Director of Schools | `Field Trip Approval Required (Asst. Director): [Destination]` |
| Asst. Director approves | `sendFieldTripStageApproved` | Director of Schools | `Field Trip Approval Required (Director): [Destination]` |
| Director approves | `sendFieldTripStageApproved` | Finance Director | `Field Trip Approval Required (Finance Director): [Destination]` |
| Finance Director approves | `sendFieldTripFinalApproved` | Original submitter | `Your Field Trip Request Has Been Approved: [Destination]` |
| Any stage denies | `sendFieldTripDenied` | Original submitter | `Field Trip Request Denied: [Destination]` |
| Any stage denies | `sendFieldTripDenied` (cc) | Stage denier (confirmation) | Same |

### 7.4 Email Template Content

#### 7.4.1 Field Trip Detail HTML Snippet

Shared helper function `fieldTripDetailHtml()`:

```html
<table style="border-collapse:collapse;width:100%;margin-top:16px;">
  <tr><td style="font-weight:bold;padding:4px 8px;">Teacher/Sponsor:</td>
      <td style="padding:4px 8px;">{teacherName}</td></tr>
  <tr><td style="font-weight:bold;padding:4px 8px;">School/Building:</td>
      <td style="padding:4px 8px;">{schoolBuilding}</td></tr>
  <tr><td style="font-weight:bold;padding:4px 8px;">Grade/Class:</td>
      <td style="padding:4px 8px;">{gradeClass}</td></tr>
  <tr><td style="font-weight:bold;padding:4px 8px;">Destination:</td>
      <td style="padding:4px 8px;">{destination}</td></tr>
  <tr><td style="font-weight:bold;padding:4px 8px;">Trip Date:</td>
      <td style="padding:4px 8px;">{tripDate formatted as MM/DD/YYYY}</td></tr>
  <tr><td style="font-weight:bold;padding:4px 8px;">Number of Students:</td>
      <td style="padding:4px 8px;">{studentCount}</td></tr>
  <tr><td style="font-weight:bold;padding:4px 8px;">Departure Time:</td>
      <td style="padding:4px 8px;">{departureTime}</td></tr>
  <tr><td style="font-weight:bold;padding:4px 8px;">Return Time:</td>
      <td style="padding:4px 8px;">{returnTime}</td></tr>
  <tr><td style="font-weight:bold;padding:4px 8px;">Transportation:</td>
      <td style="padding:4px 8px;">{Yes / No}</td></tr>
  {if totalCost}
  <tr><td style="font-weight:bold;padding:4px 8px;">Total Cost:</td>
      <td style="padding:4px 8px;">${totalCost}</td></tr>
  {/if}
  <tr><td style="font-weight:bold;padding:4px 8px;">Purpose:</td>
      <td style="padding:4px 8px;">{purpose}</td></tr>
</table>
```

#### 7.4.2 Transportation Alert Email

```
Subject: Transportation Requested: Field Trip to {destination} on {tripDate}
Color: #E65100 (orange)

A field trip has been submitted that requires transportation services.

{fieldTripDetailHtml}

Transportation Details:
{transportationDetails}

Please coordinate transportation for this trip. Log in to the system for more details.
```

#### 7.4.3 Final Approval Email (to submitter)

```
Subject: Your Field Trip Request Has Been Approved: {destination}
Color: #2E7D32 (green)

Your field trip request has been fully approved.

{fieldTripDetailHtml}

This field trip has been approved by all required parties including Finance.
Please proceed with your field trip preparations.
```

---

## 8. API Endpoints

### 8.1 Base Path

`/api/field-trips`

### 8.2 Endpoint Summary

| Method | Path | Auth Level | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/field-trips` | FIELD_TRIPS ≥ 1 | List field trip requests (scoped by level) |
| `POST` | `/api/field-trips` | FIELD_TRIPS ≥ 2 | Create a new draft field trip request |
| `GET` | `/api/field-trips/:id` | FIELD_TRIPS ≥ 1 | Get detail of a single request |
| `PUT` | `/api/field-trips/:id` | FIELD_TRIPS ≥ 2 | Update a draft request (own only) |
| `DELETE` | `/api/field-trips/:id` | FIELD_TRIPS ≥ 2 | Delete own draft request |
| `POST` | `/api/field-trips/:id/submit` | FIELD_TRIPS ≥ 2 | Submit draft for approval |
| `POST` | `/api/field-trips/:id/approve` | FIELD_TRIPS ≥ 3 | Approve at current stage (role-aware) |
| `POST` | `/api/field-trips/:id/deny` | FIELD_TRIPS ≥ 3 | Deny at current stage |
| `GET` | `/api/field-trips/:id/history` | FIELD_TRIPS ≥ 1 | Get status history for a request |

### 8.3 Request / Response Shapes

#### `GET /api/field-trips` — Query Parameters

```typescript
{
  page?: number;          // default 1
  limit?: number;         // default 25, max 200
  status?: FieldTripStatus;
  search?: string;        // searches teacherName, destination, schoolBuilding
  dateFrom?: string;      // ISO date string
  dateTo?: string;        // ISO date string
  fiscalYear?: string;
  onlyMine?: boolean;     // true = only own requests
  pendingMyApproval?: boolean; // true = requests pending my action
}
```

#### `GET /api/field-trips` — Response

```typescript
{
  data: FieldTripListItem[];
  total: number;
  page: number;
  limit: number;
}

// FieldTripListItem
{
  id: string;
  teacherName: string;
  schoolBuilding: string;
  destination: string;
  tripDate: string; // ISO
  studentCount: number;
  status: FieldTripStatus;
  transportationNeeded: boolean;
  submittedById: string;
  submittedByName: string;
  submittedAt: string | null;
  createdAt: string;
}
```

#### `POST /api/field-trips` — Request Body

```typescript
{
  teacherName: string;           // max 200
  schoolBuilding: string;        // max 200
  gradeClass: string;            // max 100
  studentCount: number;          // int, 1–500
  tripDate: string;              // ISO date, must be future
  destination: string;           // max 500
  purpose: string;               // min 10, max 2000
  departureTime: string;         // max 20
  returnTime: string;            // max 20
  transportationNeeded: boolean;
  transportationDetails?: string | null; // required if transportationNeeded
  costPerStudent?: number | null;
  totalCost?: number | null;
  fundingSource?: string | null; // max 200
  chaperoneInfo?: string | null; // max 2000
  emergencyContact?: string | null; // max 500
  additionalNotes?: string | null;  // max 2000
}
```

#### `POST /api/field-trips/:id/submit` — No body required

```typescript
// Response 200
{
  id: string;
  status: 'PENDING_SUPERVISOR' | 'PENDING_ASST_DIRECTOR'; // if supervisor bypassed
  message: string;
}
```

#### `POST /api/field-trips/:id/approve` — Request Body

```typescript
{
  notes?: string; // max 2000
}
```

#### `POST /api/field-trips/:id/deny` — Request Body

```typescript
{
  reason: string; // required, min 5 chars, max 2000
  notes?: string;
}
```

### 8.4 List Scoping Rules (Controller Logic)

| permLevel | Can See |
|-----------|---------|
| 1 | Own requests only |
| 2 | Own requests only |
| 3 | All requests in their supervised scope (submit- by users they supervise) + their own |
| 4 | All requests at or beyond PENDING_ASST_DIRECTOR |
| 5 | All requests at or beyond PENDING_DIRECTOR |
| 6 | All requests |
| ADMIN | All requests (bypasses → effective level 6) |

### 8.5 Approval Routing (Controller Logic)

The `POST /api/field-trips/:id/approve` endpoint uses `req.user.permLevel` to determine which stage the user can approve:

```
permLevel 3 → can approve PENDING_SUPERVISOR → advance to PENDING_ASST_DIRECTOR
permLevel 4 → can approve PENDING_ASST_DIRECTOR → advance to PENDING_DIRECTOR
permLevel 5 → can approve PENDING_DIRECTOR → advance to PENDING_FINANCE_DIRECTOR
permLevel 6 → can approve PENDING_FINANCE_DIRECTOR → advance to APPROVED
ADMIN (permLevel effectively 6) → same as level 6
```

If the request's current status does not match the approver's level, return `409 Conflict` with message: `"This request is not awaiting your approval stage."`.

---

## 9. Frontend Components & Pages

### 9.1 New Pages

| Page | Route | File Path |
|------|-------|-----------|
| Field Trip List | `/field-trips` | `frontend/src/pages/FieldTrips/FieldTripList.tsx` |
| Field Trip Detail | `/field-trips/:id` | `frontend/src/pages/FieldTrips/FieldTripDetail.tsx` |
| New Field Trip | `/field-trips/new` | `frontend/src/pages/FieldTrips/FieldTripWizard.tsx` |
| Edit Field Trip | `/field-trips/:id/edit` | `frontend/src/pages/FieldTrips/FieldTripWizard.tsx` (reuse with `isEdit` prop) |

### 9.2 New Components (inside `frontend/src/components/field-trips/`)

| Component | Purpose |
|-----------|---------|
| `FieldTripStatusChip.tsx` | MUI Chip colored per status |
| `FieldTripApprovalPanel.tsx` | Shows current stage info + Approve/Deny buttons (conditionally rendered on detail page based on permLevel and current status) |
| `FieldTripStatusHistory.tsx` | Timeline of status transitions (MUI Timeline or simple table) |
| `FieldTripFormStep1.tsx` | Trip Info step (fields 1–9) |
| `FieldTripFormStep2.tsx` | Transportation & Cost step (fields 10–14) |
| `FieldTripFormStep3.tsx` | Contacts & Review step (fields 15–17 + summary) |

### 9.3 FieldTripWizard — Multi-Step Form

Three steps (MUI Stepper, same pattern as `RequisitionWizard.tsx`):

```
Step 1: Trip Information
  - Teacher/Sponsor Name (pre-filled from auth store user.displayName)
  - School/Building (pre-filled from user.officeLocation if available)
  - Grade/Class
  - Number of Students
  - Date of Trip (MUI DatePicker)
  - Destination
  - Purpose / Educational Objective (multiline TextField)
  - Departure Time
  - Return Time

Step 2: Transportation & Costs
  - Transportation Needed? (MUI Switch/Radio)
  - Transportation Details (shown/required if Yes)
  - Cost per Student
  - Total Cost (auto-calculated, but editable)
  - Funding Source / Account Number

Step 3: Contacts & Review
  - Chaperone Names & Contact Info (multiline)
  - Emergency Contact
  - Additional Notes
  - Review summary of all entered data
  - [Save as Draft] [Submit for Approval] buttons
```

### 9.4 FieldTripList — Tabs

```
Tabs:
  - All         (level 3+)
  - My Requests (level 1+)  ← default tab for level 1-2
  - Pending My Approval (level 3+)
```

Columns:
- Teacher/Sponsor Name
- School/Building
- Destination
- Trip Date
- Students #
- Status (Chip)
- Transportation (icon)
- Submitted By
- Actions (View button)

### 9.5 New Frontend Service

`frontend/src/services/fieldTripService.ts`

Follows the exact pattern of `purchaseOrder.service.ts`:
- Object literal with named functions
- All calls via `api.get/post/put/delete` (Axios instance from `api.ts`)
- Full TypeScript types

### 9.6 New Frontend Types

`frontend/src/types/fieldTrip.types.ts`

### 9.7 New TanStack Query Hooks

`frontend/src/hooks/queries/useFieldTrips.ts`  
`frontend/src/hooks/mutations/useFieldTripMutations.ts`

### 9.8 Router Registration

In `frontend/src/App.tsx`, add under `<Routes>`:

```tsx
<Route path="/field-trips" element={
  <ProtectedRoute minPermLevel={1} module="FIELD_TRIPS">
    <FieldTripList />
  </ProtectedRoute>
} />
<Route path="/field-trips/new" element={
  <ProtectedRoute minPermLevel={2} module="FIELD_TRIPS">
    <FieldTripWizard />
  </ProtectedRoute>
} />
<Route path="/field-trips/:id" element={
  <ProtectedRoute minPermLevel={1} module="FIELD_TRIPS">
    <FieldTripDetail />
  </ProtectedRoute>
} />
<Route path="/field-trips/:id/edit" element={
  <ProtectedRoute minPermLevel={2} module="FIELD_TRIPS">
    <FieldTripWizard isEdit />
  </ProtectedRoute>
} />
```

### 9.9 Navigation Menu Entry

Add to the sidebar/nav menu (wherever PurchaseOrders nav entry is defined) — same visibility guards (FIELD_TRIPS ≥ 1).

---

## 10. Environment Variables

### 10.1 New Variables to Add

Add to `backend/.env.example` **and** to the actual `backend/.env` (production) and `docker-compose.yml`:

```bash
# ─── Field Trip Request Feature ─────────────────────────────────────────────────

# Assistant Director of Schools Entra group — approves at stage 2 of field trip workflow
ENTRA_ASST_DIRECTOR_OF_SCHOOLS_GROUP_ID="<entra-group-object-id>"

# Transportation Secretary Entra group — notified via email when transportation is requested
# Group ID: d0232265-a91b-4cf7-9fdb-b7fdf1eaea30
ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID="d0232265-a91b-4cf7-9fdb-b7fdf1eaea30"
```

### 10.2 Existing Variables Used by Field Trips (no new values needed)

```bash
ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID   # Director stage approver
ENTRA_FINANCE_DIRECTOR_GROUP_ID      # Finance Director stage approver
ENTRA_ALL_STAFF_GROUP_ID             # All staff get FIELD_TRIPS level 2
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM  # Email sending
APP_URL                              # Deep links in emails
```

### 10.3 docker-compose.yml Update

Add both new vars under the `backend` service environment block in `docker-compose.yml`.

---

## 11. Security Considerations

### 11.1 Authentication & Authorization

- All endpoints: `authenticate` middleware (JWT HttpOnly cookie or Bearer header fallback).
- All state-changing endpoints: `validateCsrfToken` middleware (timing-safe comparison).
- Permission check via `requireModule('FIELD_TRIPS', minLevel)`.
- **Row-level access control**: submitters can only see/edit their own requests (permLevel 1-2); supervisors see supervised users' requests; higher levels see all.
- **Ownership check on submit/edit**: service layer verifies `request.submittedById === req.user.id` for level 1-2 users before mutating.

### 11.2 Input Validation (Zod)

- All body/params/query validated with Zod schemas before reaching controller.
- Cross-field validation: `transportationDetails` required when `transportationNeeded = true`.
- Date validation: `tripDate` must be ≥ tomorrow (server UTC clock, not client).
- String length limits enforced both in Zod schema and Prisma DB column types.
- Numbers: `studentCount` capped at 500; costs validated as non-negative decimals.
- UUIDs validated on all ID params.

### 11.3 HTML Email Injection

- All user-supplied strings embedded in email HTML must pass through `escapeHtml()`. This is already the pattern in `email.service.ts`.
- `fieldTripDetailHtml()` must escape every field value.

### 11.4 IDOR (Insecure Direct Object Reference) Prevention

- Level 1-2 users: service returns `NotFoundError` (not `AuthorizationError`) if they attempt to access another user's request, preventing enumeration.
- Level 3 supervisors: service verifies the request's submitter is among the supervisor's supervising targets.

### 11.5 Rate Limiting

- Standard API rate limit already applied globally: 500 requests / 15 minutes per IP.
- Email sends wrapped in `try/catch` — email failure does not expose internal errors.

### 11.6 Structured Logging

- All state transitions logged via `logger.info()` with `{ fieldTripId, fromStatus, toStatus, actedById, stage }`.
- No sensitive data (emails, names) in log messages — use IDs only.
- Email send results logged with redacted recipient: `***@domain.com`.

### 11.7 Microsoft Graph Access

- Graph API calls (group member lookups) use the existing `graphClient` singleton from `backend/src/config/entraId.ts`.
- Use `fetchGroupEmails()` (already in `email.service.ts`) — handles pagination and null emails.
- If Graph is unreachable at submit time, return `503 SERVICE_UNAVAILABLE` (same pattern as PO submit).

### 11.8 Denial Reason Exposure

- `denialReason` is stored and returned to the submitter on `DENIED` status.
- It is also email-escaped before embedding in denial notification emails.
- The API response for non-owners (level 3+ approvers) includes the reason; level 1-2 non-owners do not receive denial reasons for others' requests.

---

## 12. Implementation Steps — Ordered File List

### Phase 1: Backend Foundation

Steps are ordered to respect dependencies.

| Step | Action | File |
|------|--------|------|
| 1 | Add new env var comments | `backend/.env.example` |
| 2 | Add new Prisma models | `backend/prisma/schema.prisma` |
| 3 | Run Prisma migration | *(terminal: `prisma migrate dev --name add_field_trip_requests`)* |
| 4 | Add `FIELD_TRIPS` to `PermissionModuleType` union and `GROUP_MODULE_MAP` | `backend/src/utils/groupAuth.ts` |
| 5 | Create Zod validators | `backend/src/validators/fieldTrip.validators.ts` |
| 6 | Add field trip email functions to email service | `backend/src/services/email.service.ts` |
| 7 | Create field trip service (business logic) | `backend/src/services/fieldTrip.service.ts` |
| 8 | Create field trip controller | `backend/src/controllers/fieldTrip.controller.ts` |
| 9 | Create field trip routes | `backend/src/routes/fieldTrip.routes.ts` |
| 10 | Register routes in server | `backend/src/server.ts` |

### Phase 2: Frontend Foundation

| Step | Action | File |
|------|--------|------|
| 11 | Create TypeScript types | `frontend/src/types/fieldTrip.types.ts` |
| 12 | Create frontend service | `frontend/src/services/fieldTripService.ts` |
| 13 | Add query keys | `frontend/src/lib/queryKeys.ts` |
| 14 | Create query hooks | `frontend/src/hooks/queries/useFieldTrips.ts` |
| 15 | Create mutation hooks | `frontend/src/hooks/mutations/useFieldTripMutations.ts` |

### Phase 3: Frontend UI

| Step | Action | File |
|------|--------|------|
| 16 | Create `FieldTripStatusChip` component | `frontend/src/components/field-trips/FieldTripStatusChip.tsx` |
| 17 | Create `FieldTripFormStep1` component | `frontend/src/components/field-trips/FieldTripFormStep1.tsx` |
| 18 | Create `FieldTripFormStep2` component | `frontend/src/components/field-trips/FieldTripFormStep2.tsx` |
| 19 | Create `FieldTripFormStep3` component | `frontend/src/components/field-trips/FieldTripFormStep3.tsx` |
| 20 | Create `FieldTripApprovalPanel` component | `frontend/src/components/field-trips/FieldTripApprovalPanel.tsx` |
| 21 | Create `FieldTripStatusHistory` component | `frontend/src/components/field-trips/FieldTripStatusHistory.tsx` |
| 22 | Create `FieldTripWizard` page (new + edit) | `frontend/src/pages/FieldTrips/FieldTripWizard.tsx` |
| 23 | Create `FieldTripList` page | `frontend/src/pages/FieldTrips/FieldTripList.tsx` |
| 24 | Create `FieldTripDetail` page | `frontend/src/pages/FieldTrips/FieldTripDetail.tsx` |
| 25 | Register routes in App.tsx | `frontend/src/App.tsx` |
| 26 | Add navigation menu entry | `frontend/src/components/layout/Sidebar.tsx` *(or equivalent nav file)* |

### Phase 4: Configuration

| Step | Action | File |
|------|--------|------|
| 27 | Add new env vars to docker-compose | `docker-compose.yml` |
| 28 | Update `.env.deploy` template | `.env.deploy` |

---

## 13. Research Sources & Best Practices

### 13.1 Multi-Stage Approval Workflows

**Source 1:** _(Node.js state machine patterns)_ Implementing approval workflows with state machines in Node.js recommends:
- Use an enum/union type for status, not arbitrary strings, to prevent invalid transitions.
- Validate transitions server-side; never trust client-provided "next status" values.
- Store a complete `StatusHistory` audit table — invaluable for debugging and compliance.
- Capture approver email snapshots at submission time (not at approval time) to prevent stale lookups.

**Source 2:** _(Prisma multi-approval pattern)_ Best practice for multi-stage approvals in Prisma:
- Use a separate `Approval` table (one row per approval action) rather than nullable columns on the main entity. This supports future reporting ("how long does each stage take on average?").
- Add database indexes on `(status, submittedById)` for efficient list queries.

### 13.2 React Multi-Step Form Patterns

**Source 3:** _(MUI Stepper + React Hook Form pattern)_ Validated form state should be lifted to the top-level wizard and passed down to step components as props; avoid sharing a single massive form context. Each step validates its own fields before `next()` is called. This project's existing `RequisitionWizard.tsx` uses `useState` directly (no RHF) — implement FieldTripWizard consistently using the same local-state approach.

**Source 4:** _(TanStack Query mutation patterns)_ Use `useMutation` + `onSuccess` → `queryClient.invalidateQueries(queryKeys.fieldTrips.all)` to ensure the list re-fetches after a create/update/submit/approve.

### 13.3 Microsoft Graph Group Email Lookup

**Source 5:** _(MS Graph `/groups/{id}/members` API)_ The `fetchGroupEmails()` function already in the codebase correctly handles:
- Pagination via `@odata.nextLink`
- Null email fallback to `userPrincipalName`
- Service principal members (which have no `mail`) are safely skipped

No changes needed to `fetchGroupEmails()` — the new `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID` group is fetched using the same function.

### 13.4 Email Security

**Source 6:** _(OWASP HTML Injection in Emails)_ All user-controlled data embedded in HTML emails must be entity-escaped. The existing `escapeHtml()` in `email.service.ts` covers the standard five characters (`&`, `<`, `>`, `"`, `'`). Field values known to contain rich text (like `purpose`, `additionalNotes`) should be additionally wrapped in `<pre>` or `white-space: pre-wrap` CSS to preserve newlines without injecting HTML.

### 13.5 CSRF Protection

**Source 7:** The existing CSRF pattern uses `crypto.timingSafeEqual()` comparing the `XSRF-TOKEN` cookie value against the `x-xsrf-token` request header. This pattern (double-submit cookie) is applied to all state-changing routes via `router.use(validateCsrfToken)` — identical to how PO routes are protected. Apply the same pattern verbatim.

### 13.6 Row-Level Security Scoping

**Source 8:** The existing PO service's `getPurchaseOrders()` demonstrates the correct pattern: pass `permLevel` and `userId` from the controller into the service, then apply `where` clause conditions based on level in a single Prisma query rather than fetching all and filtering. Use `Prisma.purchase_ordersWhereInput` (respectively `FieldTripRequestWhereInput`) as the typed accumulator.

---

## Appendix A: FieldTripStatus Label/Color Map

```typescript
// For use in FieldTripStatusChip and list pages
export const FIELD_TRIP_STATUS_LABELS: Record<FieldTripStatus, string> = {
  DRAFT:                    'Draft',
  PENDING_SUPERVISOR:       'Pending Supervisor',
  PENDING_ASST_DIRECTOR:    'Pending Asst. Director',
  PENDING_DIRECTOR:         'Pending Director',
  PENDING_FINANCE_DIRECTOR: 'Pending Finance Director',
  APPROVED:                 'Approved',
  DENIED:                   'Denied',
};

export const FIELD_TRIP_STATUS_CHIP_COLOR: Record<FieldTripStatus, 'default' | 'warning' | 'info' | 'primary' | 'success' | 'error'> = {
  DRAFT:                    'default',
  PENDING_SUPERVISOR:       'warning',
  PENDING_ASST_DIRECTOR:    'warning',
  PENDING_DIRECTOR:         'info',
  PENDING_FINANCE_DIRECTOR: 'primary',
  APPROVED:                 'success',
  DENIED:                   'error',
};
```

## Appendix B: Zod Schema Skeleton

```typescript
// backend/src/validators/fieldTrip.validators.ts

export const FieldTripStatusEnum = z.enum([
  'DRAFT', 'PENDING_SUPERVISOR', 'PENDING_ASST_DIRECTOR',
  'PENDING_DIRECTOR', 'PENDING_FINANCE_DIRECTOR', 'APPROVED', 'DENIED',
]);

export const CreateFieldTripSchema = z.object({
  teacherName:           z.string().min(1).max(200),
  schoolBuilding:        z.string().min(1).max(200),
  gradeClass:            z.string().min(1).max(100),
  studentCount:          z.number().int().min(1).max(500),
  tripDate:              z.string().refine((v) => {
                           const d = new Date(v);
                           const tomorrow = new Date();
                           tomorrow.setUTCHours(0, 0, 0, 0);
                           tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
                           return d >= tomorrow;
                         }, 'Trip date must be in the future'),
  destination:           z.string().min(1).max(500),
  purpose:               z.string().min(10).max(2000),
  departureTime:         z.string().min(1).max(20),
  returnTime:            z.string().min(1).max(20),
  transportationNeeded:  z.boolean(),
  transportationDetails: z.string().max(1000).optional().nullable(),
  costPerStudent:        z.number().min(0).optional().nullable(),
  totalCost:             z.number().min(0).optional().nullable(),
  fundingSource:         z.string().max(200).optional().nullable(),
  chaperoneInfo:         z.string().max(2000).optional().nullable(),
  emergencyContact:      z.string().max(500).optional().nullable(),
  additionalNotes:       z.string().max(2000).optional().nullable(),
}).refine(
  (data) => !data.transportationNeeded || (data.transportationDetails && data.transportationDetails.trim().length > 0),
  { message: 'Transportation details are required when transportation is needed', path: ['transportationDetails'] }
);

export const UpdateFieldTripSchema = CreateFieldTripSchema.partial();

export const ApproveFieldTripSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const DenyFieldTripSchema = z.object({
  reason: z.string().min(5).max(2000),
  notes:  z.string().max(2000).optional(),
});

export const FieldTripIdParamSchema = z.object({
  id: z.string().uuid('Invalid field trip request ID'),
});

export const FieldTripQuerySchema = z.object({
  page:              z.preprocess((v) => v ?? '1', z.string().regex(/^\d+$/).transform(Number).refine((n) => n > 0)).optional(),
  limit:             z.preprocess((v) => v ?? '25', z.string().regex(/^\d+$/).transform(Number).refine((n) => n > 0 && n <= 200)).optional(),
  status:            FieldTripStatusEnum.optional(),
  search:            z.string().max(200).optional(),
  dateFrom:          z.string().optional().refine((v) => !v || !isNaN(Date.parse(v))),
  dateTo:            z.string().optional().refine((v) => !v || !isNaN(Date.parse(v))),
  fiscalYear:        z.string().max(20).optional(),
  onlyMine:          z.preprocess((v) => v === 'true' || v === '1', z.boolean().optional()),
  pendingMyApproval: z.preprocess((v) => v === 'true' || v === '1', z.boolean().optional()),
});
```

## Appendix C: Migration SQL Skeleton

The `prisma migrate dev` command will generate the SQL automatically.  
Key constraints to verify after migration:

```sql
-- Verify indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'field_trip_requests';
-- Expected: status, submitted_by_id, trip_date, fiscal_year, status+submitted_by_id

-- Verify FK constraints
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'field_trip_requests' AND constraint_type = 'FOREIGN KEY';
```
