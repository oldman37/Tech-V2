# Fiscal Year Rollover & Requisition Settings — Comprehensive Plan

**System:** Tech-V2 (Tech Department Management System)  
**Created:** March 2026  
**Status:** Planning / Pre-Implementation  
**Depends On:** Sprint C-2 (Purchase Orders Backend — completed)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State Analysis](#2-current-state-analysis)
3. [Fiscal Year Concept](#3-fiscal-year-concept)
4. [Feature 1: Fiscal Year Tracking & Rollover Gate](#4-feature-1-fiscal-year-tracking--rollover-gate)
5. [Feature 2: "Start New Fiscal Year" Wizard](#5-feature-2-start-new-fiscal-year-wizard)
6. [Feature 3: Dynamic Requisition Workflow Settings](#6-feature-3-dynamic-requisition-workflow-settings)
7. [Database Schema Changes](#7-database-schema-changes)
8. [Backend Implementation](#8-backend-implementation)
9. [Frontend Implementation](#9-frontend-implementation)
10. [Fiscal Year Gate — Enforcement Rules](#10-fiscal-year-gate--enforcement-rules)
11. [Validation & Safety Guards](#11-validation--safety-guards)
12. [Migration Strategy](#12-migration-strategy)
13. [File Change Manifest](#13-file-change-manifest)

---

## 1. Overview

The school district's fiscal year runs **July 1 → June 30**. The requisition/PO system currently has no concept of fiscal year — number sequences continue indefinitely, and there is no mechanism to start a fresh year.

This plan introduces three interconnected features:

| # | Feature | Purpose |
|---|---------|---------|
| 1 | **Fiscal Year Tracking & Gate** | Stamp every PO with a fiscal year. **Block** creation of new requisitions after the fiscal year ends until an admin performs the rollover. |
| 2 | **"Start New Fiscal Year" Wizard** | Admin-only page that walks through resetting sequences, handling in-progress POs, and opening the new year. |
| 3 | **Dynamic Requisition Workflow Settings** | Allow admins to adjust approval-stage required permission levels and notification emails from the settings page rather than requiring code changes. |

**Key design principle:** No data is ever deleted. Historical requisitions are preserved and filterable by fiscal year. The rollover is a one-way, audited operation.

---

## 2. Current State Analysis

### 2.1 Existing `SystemSettings` Model

**File:** `backend/prisma/schema.prisma` (lines 579–604)

```prisma
model SystemSettings {
  id                      String   @id @default("singleton")
  nextReqNumber           Int      @default(1)
  reqNumberPrefix         String   @default("REQ")
  nextPoNumber            Int      @default(1)
  poNumberPrefix          String   @default("PO")
  supervisorBypassEnabled Boolean  @default(true)
  supervisorStageEmail    String?
  purchasingStageEmail    String?
  dosStageEmail           String?
  poEntryStageEmail       String?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  @@map("system_settings")
}
```

**What exists:** Number sequencing, supervisor bypass flag, notification emails.  
**What's missing:** Fiscal year fields, approval-stage permission levels, workflow configuration.

### 2.2 Existing `purchase_orders` Model

**File:** `backend/prisma/schema.prisma` (lines 339–385)

No `fiscalYear` field. No way to filter by year or know which year a requisition belongs to.

### 2.3 Hardcoded Workflow Constants

**File:** `backend/src/services/purchaseOrder.service.ts` (lines 38–55)

```typescript
const STATUS_APPROVAL_REQUIREMENTS = {
  'submitted':                 { to: 'supervisor_approved',        requiredLevel: 3 },
  'supervisor_approved':       { to: 'finance_director_approved',  requiredLevel: 5 },
  'finance_director_approved': { to: 'dos_approved',               requiredLevel: 6 },
};

const EDITABLE_STATUSES: POStatus[] = ['draft'];
const DELETABLE_STATUSES: POStatus[] = ['draft'];
const REJECTABLE_STATUSES: POStatus[] = [
  'submitted',
  'supervisor_approved',
  'finance_director_approved',
  'dos_approved',
];
```

These are compile-time constants. Any change to the approval chain requires a code change and redeployment.

### 2.4 Existing Settings Infrastructure

| Layer | File | Pattern |
|-------|------|---------|
| Schema | `prisma/schema.prisma` | Singleton `SystemSettings` |
| Service | `src/services/settings.service.ts` | `SettingsService` class with `getSettings()` / `updateSettings()` |
| Controller | `src/controllers/settings.controller.ts` | `getSettings` / `updateSettings` handlers |
| Routes | `src/routes/settings.routes.ts` | `GET /api/settings`, `PUT /api/settings` (ADMIN only) |
| Validators | `src/validators/settings.validators.ts` | `UpdateSettingsSchema` (Zod) |
| Frontend Service | `frontend/src/services/settingsService.ts` | `get()` / `update()` API calls |
| Frontend Page | `frontend/src/pages/admin/AdminSettings.tsx` | React Hook Form + MUI |
| Frontend Route | `frontend/src/App.tsx` | `/admin/settings` → `AdminSettings` |

This infrastructure is fully operational and will be extended (not replaced).

---

## 3. Fiscal Year Concept

### 3.1 Calendar

| Term | Dates | Example |
|------|-------|---------|
| Fiscal Year Label | `"YYYY-YYYY"` | `"2025-2026"` |
| Start Date | July 1 at 00:00:00 local time | `2025-07-01T00:00:00` |
| End Date | June 30 at 23:59:59 local time | `2026-06-30T23:59:59` |
| Timezone | `America/Chicago` (per `.env` TZ) | Central Time |

### 3.2 Year Label Convention

The label is always `"<start-calendar-year>-<end-calendar-year>"`, e.g.:

- July 1, 2025 → June 30, 2026 = `"2025-2026"`
- July 1, 2026 → June 30, 2027 = `"2026-2027"`

### 3.3 Auto-Suggestion Logic

Given the current date, the wizard suggests the next fiscal year:

```typescript
function suggestNextFiscalYear(): { label: string; start: Date; end: Date } {
  const now = new Date(); // in America/Chicago
  const year = now.getMonth() >= 6 // July = month 6 (0-indexed)
    ? now.getFullYear()
    : now.getFullYear() - 1;
  // Next year is always current + 1
  const nextStart = year + 1;
  return {
    label: `${nextStart}-${nextStart + 1}`,
    start: new Date(`${nextStart}-07-01T00:00:00`),
    end:   new Date(`${nextStart + 1}-06-30T23:59:59`),
  };
}
```

---

## 4. Feature 1: Fiscal Year Tracking & Rollover Gate

### 4.1 Fiscal Year Gate — The Core Rule

> **After `fiscalYearEnd` passes, the system BLOCKS creation and submission of new requisitions until an administrator performs the fiscal year rollover.**

This is a **hard gate**, not a warning. Users cannot bypass it.

### 4.2 What Gets Blocked vs. What's Allowed

| Action | Blocked After FY End? | Reason |
|--------|----------------------|--------|
| **Create new draft** | **YES** | No new requisitions in an expired fiscal year |
| **Submit existing draft** | **YES** | Can't push a req into the pipeline for a closed year |
| **Edit existing draft** | **YES** | Drafts from the old year cannot be modified either |
| **Approve in-progress POs** | No | Let approvers finish work already submitted before year end |
| **Issue PO on approved POs** | No | Same — pipeline drains gracefully |
| **Reject in-progress POs** | No | Admins/supervisors should still deny stale requisitions |
| **Assign account code** | No | Part of the issuance pipeline |
| **View / list / PDF / history** | No | Read-only access always allowed |
| **Delete own draft** | No | Cleanup of stale drafts is allowed |

**Pipeline drain principle:** Anything already submitted before June 30 can still flow through approval and issuance. Only *new work initiation* is blocked.

### 4.3 Backend Enforcement

A private helper in `PurchaseOrderService`:

```typescript
/**
 * Throws ValidationError if the current fiscal year has expired and
 * no rollover has been performed.
 * Called at the top of createPurchaseOrder() and submitPurchaseOrder().
 */
private async assertFiscalYearActive(): Promise<void> {
  const settings = await this.settingsService.getSettings();

  // First-time setup: no fiscal year configured yet.
  // Decision: BLOCK and require initial fiscal year setup.
  if (!settings.fiscalYearEnd) {
    throw new ValidationError(
      'No fiscal year has been configured. An administrator must set up the initial fiscal year before requisitions can be created.',
      'fiscalYear',
    );
  }

  const now = new Date();
  if (now > new Date(settings.fiscalYearEnd)) {
    throw new ValidationError(
      `The fiscal year ${settings.currentFiscalYear} ended on ` +
      `${new Date(settings.fiscalYearEnd).toLocaleDateString('en-US')}. ` +
      `An administrator must start a new fiscal year before new requisitions can be created.`,
      'fiscalYear',
    );
  }
}
```

**Called in:**
- `createPurchaseOrder()` — first line
- `submitPurchaseOrder()` — first line (guards against drafts created at 11:59 PM June 30 and submitted July 1)

**NOT called in:** `approvePurchaseOrder()`, `rejectPurchaseOrder()`, `assignAccountCode()`, `issuePurchaseOrder()`.

### 4.4 Frontend Enforcement

#### 4.4.1 Proactive UI Banner (PO List Page)

When `GET /api/settings` returns a `fiscalYearEnd` that is in the past:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚠  The fiscal year 2025-2026 ended on June 30, 2026.                 │
│     New requisitions are disabled until an administrator starts the    │
│     new fiscal year.                                                   │
│     [Start New Fiscal Year →]  (link, visible to admins only)         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 4.4.2 Disable "New Requisition" Button

On `PurchaseOrderList.tsx`, when the fiscal year is expired:
- Grey out the "New Requisition" button
- Show a tooltip: *"New requisitions are disabled — fiscal year rollover required"*

#### 4.4.3 Admin Dashboard Alert

On the admin home or dashboard, display a red alert card:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🔴  ACTION REQUIRED                                                   │
│  The fiscal year 2025-2026 ended on June 30, 2026.                    │
│  Start the new fiscal year to re-enable requisitions.                 │
│  [Start New Fiscal Year →]                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Fiscal Year Stamping on POs

Every purchase order created gets stamped with the current fiscal year:

```typescript
// In createPurchaseOrder():
const settings = await this.settingsService.getSettings();
// ...
const record = await tx.purchase_orders.create({
  data: {
    // ... existing fields ...
    fiscalYear: settings.currentFiscalYear,  // e.g. "2025-2026"
  },
});
```

This enables **year-based filtering** on the PO list page.

### 4.6 PO List Page — Fiscal Year Filter

Add a dropdown to the PO list page filters:

```
Fiscal Year: [ 2025-2026 ▾ ]  Status: [ All ▾ ]  Search: [ _________ ]
```

- Default: current active fiscal year
- Options: all distinct fiscal years from the database + "All Years"
- Backend: add `fiscalYear` to `PurchaseOrderQueryDto` and the `where` clause

---

## 5. Feature 2: "Start New Fiscal Year" Wizard

### 5.1 Route & Access

| Property | Value |
|----------|-------|
| Frontend route | `/admin/new-fiscal-year` |
| Backend endpoint | `POST /api/settings/new-fiscal-year` |
| Required role | ADMIN only |
| Navigation | Sidebar link under Admin section; also linked from the FY-expired banner |

### 5.2 Wizard Steps (MUI Stepper)

#### Step 1: Confirm New Fiscal Year

| Field | Type | Default / Auto-Calculated | Editable? |
|-------|------|--------------------------|-----------|
| New fiscal year label | Text | Auto-suggested (e.g. `"2026-2027"`) | Yes |
| Start date | Date display | July 1 of start year | Display only |
| End date | Date display | June 30 of end year | Display only |
| Previous fiscal year | Text display | Current `settings.currentFiscalYear` | Display only |

**Validation:**
- New fiscal year label must match format `YYYY-YYYY`
- The second year must equal the first year + 1
- Cannot roll over to the same year as current
- The start date of the new year must be >= today (can't create a past year)

#### Step 2: Handle In-Progress Requisitions

Display a summary table fetched from the backend:

```
┌──────────────────────────────────────────────────────────────────┐
│  In-Progress Requisitions for FY 2025-2026                      │
│                                                                  │
│  Status                         Count                           │
│  ────────────────────────────── ─────                           │
│  draft                          12                              │
│  submitted                       3                              │
│  supervisor_approved             1                              │
│  finance_director_approved       0                              │
│  dos_approved                    2                              │
│  ────────────────────────────── ─────                           │
│  Total in-progress              18                              │
│                                                                  │
│  Choose how to handle these:                                    │
│                                                                  │
│  ○ Carry forward — Leave in-progress (approvals continue)       │
│  ○ Auto-deny drafts only — Deny all drafts; carry forward rest  │
│  ○ Auto-deny all — Deny everything still in the pipeline        │
│                                                                  │
│  Denial reason (for auto-deny):                                 │
│  [ FY 2025-2026 closed — requisition not completed before_____] │
└──────────────────────────────────────────────────────────────────┘
```

**Options explained:**

| Option | Behavior |
|--------|----------|
| **Carry forward** | All in-progress POs remain at their current status. They keep their original `fiscalYear` stamp. Approvers can still process them in the new year. |
| **Auto-deny drafts only** | All POs with `status = 'draft'` are bulk-set to `denied` with the provided reason. Submitted/approved POs continue through the pipeline. |
| **Auto-deny all** | All non-terminal POs (`status` not in `['po_issued', 'denied']`) are bulk-set to `denied`. Clean slate. |

#### Step 3: Reset Number Sequences

| Field | Type | Default | Editable? |
|-------|------|---------|-----------|
| REQ prefix | Text | Current prefix or suggested `"REQ-2627"` | Yes |
| Reset REQ number to | Number | `1` | Yes |
| PO prefix | Text | Current prefix or suggested `"PO-2627"` | Yes |
| Reset PO number to | Number | `1` | Yes |
| Preview | Display | `REQ-2627-00001` / `PO-2627-00001` | Display only |

#### Step 4: Workflow Settings (Optional Adjustment)

| Field | Type | Current Value Shown | Editable? |
|-------|------|-------------------|-----------|
| Supervisor bypass enabled | Toggle | Current setting | Yes |
| Supervisor stage email | Email | Current setting | Yes |
| Purchasing stage email | Email | Current setting | Yes |
| DOS stage email | Email | Current setting | Yes |
| PO Entry stage email | Email | Current setting | Yes |

Also (if Feature 3 is implemented):

| Field | Type | Current Value | Editable? |
|-------|------|--------------|-----------|
| Supervisor approval: required level | Number | 3 | Yes |
| Finance Director approval: required level | Number | 5 | Yes |
| Director of Schools approval: required level | Number | 6 | Yes |

#### Step 5: Review & Confirm

Summary of all changes in a read-only review card:

```
┌──────────────────────────────────────────────────────────────────┐
│  📋  FISCAL YEAR ROLLOVER SUMMARY                               │
│                                                                  │
│  New Fiscal Year:        2026-2027                              │
│  Period:                 July 1, 2026 — June 30, 2027          │
│                                                                  │
│  In-Progress POs:        18 total                               │
│  Action:                 Auto-deny drafts (12); carry forward 6 │
│  Denial Reason:          "FY 2025-2026 closed"                  │
│                                                                  │
│  REQ Numbers:            REQ-2627-00001 (reset to 1)            │
│  PO Numbers:             PO-2627-00001 (reset to 1)             │
│                                                                  │
│  Supervisor Bypass:      Enabled                                │
│  Notification Emails:    (unchanged)                            │
│                                                                  │
│  ⚠  This action cannot be undone.                               │
│                                                                  │
│         [ Cancel ]    [ Start New Fiscal Year ]                 │
└──────────────────────────────────────────────────────────────────┘
```

The **"Start New Fiscal Year"** button requires a confirmation dialog:

```
Are you sure you want to start fiscal year 2026-2027?
This will:
  • Reset REQ/PO number sequences
  • Auto-deny 12 draft requisitions
  • Enable new requisition creation for FY 2026-2027

This action cannot be undone.

[ Cancel ]  [ Confirm & Start New Year ]
```

### 5.3 Backend Endpoint

**`POST /api/settings/new-fiscal-year`**

Request body:

```typescript
interface StartNewFiscalYearDto {
  fiscalYearLabel:      string;   // "2026-2027"
  fiscalYearStart:      string;   // ISO date "2026-07-01T00:00:00"
  fiscalYearEnd:        string;   // ISO date "2027-06-30T23:59:59"

  // In-progress PO handling
  inProgressAction:     'carry_forward' | 'deny_drafts' | 'deny_all';
  denialReason?:        string;   // Required if action is deny_*

  // Number sequence resets
  reqNumberPrefix:      string;
  nextReqNumber:        number;
  poNumberPrefix:       string;
  nextPoNumber:         number;

  // Workflow settings (optional — only update if provided)
  supervisorBypassEnabled?: boolean;
  supervisorStageEmail?:    string | null;
  purchasingStageEmail?:    string | null;
  dosStageEmail?:           string | null;
  poEntryStageEmail?:       string | null;
}
```

**Transaction logic** (all-or-nothing):

```typescript
async startNewFiscalYear(data: StartNewFiscalYearDto, adminUserId: string) {
  return this.prisma.$transaction(async (tx) => {
    const now = new Date();

    // 1. Handle in-progress POs based on chosen action
    let deniedCount = 0;
    if (data.inProgressAction === 'deny_drafts') {
      const result = await tx.purchase_orders.updateMany({
        where: { status: 'draft' },
        data:  { status: 'denied', denialReason: data.denialReason },
      });
      deniedCount = result.count;
      // Write history entries for each denied PO
      // (fetch IDs first, then bulk-create history rows)
    } else if (data.inProgressAction === 'deny_all') {
      const result = await tx.purchase_orders.updateMany({
        where: { status: { notIn: ['po_issued', 'denied'] } },
        data:  { status: 'denied', denialReason: data.denialReason },
      });
      deniedCount = result.count;
    }
    // 'carry_forward' = do nothing to existing POs

    // 2. Update SystemSettings with new fiscal year + resets
    await tx.systemSettings.update({
      where: { id: 'singleton' },
      data: {
        currentFiscalYear:      data.fiscalYearLabel,
        fiscalYearStart:        new Date(data.fiscalYearStart),
        fiscalYearEnd:          new Date(data.fiscalYearEnd),
        nextReqNumber:          data.nextReqNumber,
        reqNumberPrefix:        data.reqNumberPrefix,
        nextPoNumber:           data.nextPoNumber,
        poNumberPrefix:         data.poNumberPrefix,
        lastYearRolloverAt:     now,
        lastYearRolloverBy:     adminUserId,
        // Optional workflow settings
        ...(data.supervisorBypassEnabled !== undefined && {
          supervisorBypassEnabled: data.supervisorBypassEnabled,
        }),
        ...(data.supervisorStageEmail !== undefined && {
          supervisorStageEmail: data.supervisorStageEmail,
        }),
        ...(data.purchasingStageEmail !== undefined && {
          purchasingStageEmail: data.purchasingStageEmail,
        }),
        ...(data.dosStageEmail !== undefined && {
          dosStageEmail: data.dosStageEmail,
        }),
        ...(data.poEntryStageEmail !== undefined && {
          poEntryStageEmail: data.poEntryStageEmail,
        }),
      },
    });

    // 3. Write a FiscalYearHistory audit record
    await tx.fiscalYearHistory.create({
      data: {
        fiscalYear:       data.fiscalYearLabel,
        fiscalYearStart:  new Date(data.fiscalYearStart),
        fiscalYearEnd:    new Date(data.fiscalYearEnd),
        action:           data.inProgressAction,
        deniedCount,
        reqPrefix:        data.reqNumberPrefix,
        reqStartNumber:   data.nextReqNumber,
        poPrefix:         data.poNumberPrefix,
        poStartNumber:    data.nextPoNumber,
        performedById:    adminUserId,
        performedAt:      now,
      },
    });

    return {
      fiscalYear: data.fiscalYearLabel,
      deniedCount,
      message: `Fiscal year ${data.fiscalYearLabel} started successfully.`,
    };
  });
}
```

### 5.4 Pre-Rollover Summary Endpoint

**`GET /api/settings/fiscal-year-summary`**

Returns data the wizard needs for Step 2:

```typescript
interface FiscalYearSummary {
  currentFiscalYear:    string | null;
  fiscalYearEnd:        string | null;
  isExpired:            boolean;
  inProgressCounts: {
    draft:                        number;
    submitted:                    number;
    supervisor_approved:          number;
    finance_director_approved:    number;
    dos_approved:                 number;
    total:                        number;
  };
  suggestedNextYear: {
    label:  string;
    start:  string;
    end:    string;
  };
}
```

---

## 6. Feature 3: Dynamic Requisition Workflow Settings

### 6.1 Goal

Move the hardcoded `STATUS_APPROVAL_REQUIREMENTS` from `purchaseOrder.service.ts` into `SystemSettings` so admins can adjust **which permission level is required** at each approval stage without code changes.

### 6.2 New Settings Fields

Add to `SystemSettings`:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `supervisorApprovalLevel` | `Int` | `3` | Min level to approve `submitted → supervisor_approved` |
| `financeDirectorApprovalLevel` | `Int` | `5` | Min level to approve `supervisor_approved → finance_director_approved` |
| `dosApprovalLevel` | `Int` | `6` | Min level to approve `finance_director_approved → dos_approved` |

### 6.3 Service Change

Replace the hardcoded constant with a dynamic lookup:

```typescript
// BEFORE (hardcoded):
const STATUS_APPROVAL_REQUIREMENTS = {
  'submitted':                 { to: 'supervisor_approved',        requiredLevel: 3 },
  'supervisor_approved':       { to: 'finance_director_approved',  requiredLevel: 5 },
  'finance_director_approved': { to: 'dos_approved',               requiredLevel: 6 },
};

// AFTER (dynamic from settings):
private async getApprovalRequirements(): Promise<Record<string, { to: POStatus; requiredLevel: number }>> {
  const s = await this.settingsService.getSettings();
  return {
    'submitted':                 { to: 'supervisor_approved',        requiredLevel: s.supervisorApprovalLevel },
    'supervisor_approved':       { to: 'finance_director_approved',  requiredLevel: s.financeDirectorApprovalLevel },
    'finance_director_approved': { to: 'dos_approved',               requiredLevel: s.dosApprovalLevel },
  };
}
```

**Note:** The *status names* and *transition flow* remain hardcoded. Only the *required permission levels* become configurable. This is the simple-and-safe approach — it avoids the complexity of fully dynamic stage definitions while giving 90% of the flexibility.

### 6.4 AdminSettings Page Addition

Add a new card section to the existing `AdminSettings.tsx`:

```
┌──────────────────────────────────────────────────────────────────┐
│  Approval Stage Permission Levels                               │
│  ────────────────────────────────────────────────────────────── │
│                                                                  │
│  Supervisor Approval          Min Level:  [ 3 ]                 │
│  (submitted → supervisor_approved)                              │
│                                                                  │
│  Finance Director Approval    Min Level:  [ 5 ]                 │
│  (supervisor_approved → finance_director_approved)              │
│                                                                  │
│  Director of Schools Approval Min Level:  [ 6 ]                 │
│  (finance_director_approved → dos_approved)                     │
│                                                                  │
│  ⓘ  These levels correspond to REQUISITIONS permission levels   │
│     assigned to users. Level 4 (PO Entry) uses /issue only.    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Database Schema Changes

### 7.1 `SystemSettings` — New Fields

```prisma
model SystemSettings {
  id                      String    @id @default("singleton")

  // ── Existing fields (unchanged) ──
  nextReqNumber           Int       @default(1)
  reqNumberPrefix         String    @default("REQ")
  nextPoNumber            Int       @default(1)
  poNumberPrefix          String    @default("PO")
  supervisorBypassEnabled Boolean   @default(true)
  supervisorStageEmail    String?
  purchasingStageEmail    String?
  dosStageEmail           String?
  poEntryStageEmail       String?

  // ── NEW: Fiscal Year Fields ──
  currentFiscalYear       String?   // e.g. "2025-2026"
  fiscalYearStart         DateTime? // July 1 of start year
  fiscalYearEnd           DateTime? // June 30 of end year
  lastYearRolloverAt      DateTime? // When rollover was last performed
  lastYearRolloverBy      String?   // User ID who performed it

  // ── NEW: Dynamic Approval Levels ──
  supervisorApprovalLevel      Int  @default(3)
  financeDirectorApprovalLevel Int  @default(5)
  dosApprovalLevel             Int  @default(6)

  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  @@map("system_settings")
}
```

### 7.2 `purchase_orders` — New Field

```prisma
model purchase_orders {
  // ... existing fields ...

  // ── NEW: Fiscal Year Stamp ──
  fiscalYear    String?   // e.g. "2025-2026" — set at creation from SystemSettings

  // ... existing relations and indexes ...
  @@index([fiscalYear])   // NEW: for year-based filtering
}
```

### 7.3 New Model: `FiscalYearHistory` — Audit Trail

```prisma
model FiscalYearHistory {
  id               String   @id @default(uuid())
  fiscalYear       String   // "2026-2027"
  fiscalYearStart  DateTime
  fiscalYearEnd    DateTime
  action           String   // "carry_forward" | "deny_drafts" | "deny_all"
  deniedCount      Int      @default(0)
  reqPrefix        String
  reqStartNumber   Int
  poPrefix         String
  poStartNumber    Int
  performedById    String
  performedAt      DateTime @default(now())

  performedBy      User     @relation(fields: [performedById], references: [id])

  @@map("fiscal_year_history")
  @@index([fiscalYear])
}
```

---

## 8. Backend Implementation

### 8.1 Migration

**Name:** `YYYYMMDDHHMMSS_add_fiscal_year_rollover`

Steps:
1. Add nullable `currentFiscalYear`, `fiscalYearStart`, `fiscalYearEnd`, `lastYearRolloverAt`, `lastYearRolloverBy` to `system_settings`.
2. Add `supervisorApprovalLevel` (default 3), `financeDirectorApprovalLevel` (default 5), `dosApprovalLevel` (default 6) to `system_settings`.
3. Add nullable `fiscalYear` column to `purchase_orders` with index.
4. Create `fiscal_year_history` table.
5. **Data migration:** Set existing system settings to the current fiscal year based on today's date. Backfill `fiscalYear` on existing `purchase_orders` based on their `createdAt` date.

### 8.2 Settings Service Changes

**File:** `backend/src/services/settings.service.ts`

New methods:

| Method | Purpose |
|--------|---------|
| `getFiscalYearSummary()` | Returns in-progress PO counts + suggested next FY |
| `startNewFiscalYear(data, adminUserId)` | Performs the rollover transaction |
| `isFiscalYearActive()` | Returns boolean — used by the gate check |

### 8.3 Settings Controller Changes

**File:** `backend/src/controllers/settings.controller.ts`

New handlers:

| Handler | Route | Method |
|---------|-------|--------|
| `getFiscalYearSummary` | `GET /api/settings/fiscal-year-summary` | GET |
| `startNewFiscalYear` | `POST /api/settings/new-fiscal-year` | POST |

### 8.4 Settings Routes Changes

**File:** `backend/src/routes/settings.routes.ts`

Add two new routes (ADMIN only):

```typescript
router.get('/fiscal-year-summary', settingsController.getFiscalYearSummary);
router.post(
  '/new-fiscal-year',
  validateCsrfToken,
  validateRequest(StartNewFiscalYearSchema, 'body'),
  settingsController.startNewFiscalYear,
);
```

### 8.5 Settings Validator Changes

**File:** `backend/src/validators/settings.validators.ts`

Add:
- `StartNewFiscalYearSchema` — validates the wizard payload
- Update `UpdateSettingsSchema` — add optional `supervisorApprovalLevel`, `financeDirectorApprovalLevel`, `dosApprovalLevel`

### 8.6 Purchase Order Service Changes

**File:** `backend/src/services/purchaseOrder.service.ts`

1. Add `assertFiscalYearActive()` private method.
2. Call it at the top of `createPurchaseOrder()` and `submitPurchaseOrder()`.
3. In `createPurchaseOrder()`, stamp `fiscalYear` from settings.
4. Replace hardcoded `STATUS_APPROVAL_REQUIREMENTS` with `getApprovalRequirements()` that reads from settings.
5. Add `fiscalYear` to `PurchaseOrderQueryDto` and the `getPurchaseOrders()` where clause.

### 8.7 Settings Defaults Update

**File:** `backend/src/services/settings.service.ts`

Update `SETTINGS_DEFAULTS`:

```typescript
const SETTINGS_DEFAULTS = {
  // ... existing ...
  currentFiscalYear:            null,
  fiscalYearStart:              null,
  fiscalYearEnd:                null,
  lastYearRolloverAt:           null,
  lastYearRolloverBy:           null,
  supervisorApprovalLevel:      3,
  financeDirectorApprovalLevel: 5,
  dosApprovalLevel:             6,
} as const;
```

---

## 9. Frontend Implementation

### 9.1 New Page: `NewFiscalYear.tsx`

**Location:** `frontend/src/pages/admin/NewFiscalYear.tsx`

- MUI `Stepper` component with 5 steps
- React Hook Form for each step's form
- TanStack Query: `useQuery` for fiscal year summary, `useMutation` for rollover
- Confirmation dialog before final submit
- Success screen with summary after completion
- Redirects to PO list on "Done"

### 9.2 New Route

**File:** `frontend/src/App.tsx`

```tsx
<Route
  path="/admin/new-fiscal-year"
  element={
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <NewFiscalYear />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

### 9.3 Settings Service Update

**File:** `frontend/src/services/settingsService.ts`

Add:

```typescript
export interface FiscalYearSummary {
  currentFiscalYear:    string | null;
  fiscalYearEnd:        string | null;
  isExpired:            boolean;
  inProgressCounts: {
    draft:                        number;
    submitted:                    number;
    supervisor_approved:          number;
    finance_director_approved:    number;
    dos_approved:                 number;
    total:                        number;
  };
  suggestedNextYear: {
    label: string;
    start: string;
    end:   string;
  };
}

export interface StartNewFiscalYearInput {
  fiscalYearLabel:      string;
  fiscalYearStart:      string;
  fiscalYearEnd:        string;
  inProgressAction:     'carry_forward' | 'deny_drafts' | 'deny_all';
  denialReason?:        string;
  reqNumberPrefix:      string;
  nextReqNumber:        number;
  poNumberPrefix:       string;
  nextPoNumber:         number;
  supervisorBypassEnabled?: boolean;
  supervisorStageEmail?:    string | null;
  purchasingStageEmail?:    string | null;
  dosStageEmail?:           string | null;
  poEntryStageEmail?:       string | null;
}

// Add to settingsService object:
getFiscalYearSummary: async (): Promise<FiscalYearSummary> => {
  const res = await api.get<FiscalYearSummary>('/settings/fiscal-year-summary');
  return res.data;
},

startNewFiscalYear: async (data: StartNewFiscalYearInput): Promise<{ fiscalYear: string; deniedCount: number; message: string }> => {
  const res = await api.post('/settings/new-fiscal-year', data);
  return res.data;
},
```

### 9.4 SystemSettings Interface Update

**File:** `frontend/src/services/settingsService.ts`

Add fields to `SystemSettings`:

```typescript
export interface SystemSettings {
  // ... existing fields ...
  currentFiscalYear:            string | null;
  fiscalYearStart:              string | null;
  fiscalYearEnd:                string | null;
  lastYearRolloverAt:           string | null;
  lastYearRolloverBy:           string | null;
  supervisorApprovalLevel:      number;
  financeDirectorApprovalLevel: number;
  dosApprovalLevel:             number;
}
```

### 9.5 PO List Page Changes

**File:** `frontend/src/pages/PurchaseOrders/PurchaseOrderList.tsx`

1. Add fiscal year expired banner (§4.4.1)
2. Disable "New Requisition" button when expired (§4.4.2)
3. Add fiscal year dropdown filter (§4.6)

### 9.6 AdminSettings Page Changes

**File:** `frontend/src/pages/admin/AdminSettings.tsx`

1. Add "Approval Stage Permission Levels" card (§6.4)
2. Add "Fiscal Year" info card showing current FY, with link to rollover wizard
3. Update form schema with new fields

### 9.7 Navigation Update

**File:** `frontend/src/components/layout/AppLayout.tsx`

Add sidebar link:

```typescript
{ label: 'New Fiscal Year', icon: '📅', path: '/admin/new-fiscal-year', adminOnly: true },
```

---

## 10. Fiscal Year Gate — Enforcement Rules

### 10.1 Full Decision Matrix

| Date | FY Configured? | FY Expired? | Create Draft | Submit | Approve | Issue | Reject | View |
|------|---------------|-------------|-------------|--------|---------|-------|--------|------|
| Any | No (null) | N/A | **BLOCKED** | **BLOCKED** | ✅ | ✅ | ✅ | ✅ |
| June 30 | Yes | No | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| July 1 (no rollover) | Yes | **Yes** | **BLOCKED** | **BLOCKED** | ✅ | ✅ | ✅ | ✅ |
| July 1 (after rollover) | Yes | No | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 10.2 First-Time Setup

On a fresh install, `currentFiscalYear` is `null`. The system **blocks** new requisitions and requires an initial fiscal year setup. The admin can navigate to `/admin/new-fiscal-year` which detects the first-run state and presents a simplified setup (no "handle in-progress POs" step since there are none).

### 10.3 Timezone Handling

All fiscal year date comparisons use `America/Chicago` timezone (from the `TZ` environment variable) to match the school district's local midnight. The comparison is done server-side to prevent client timezone mismatch.

### 10.4 Edge Cases

| Scenario | Behavior |
|----------|----------|
| June 30, 11:59 PM CT — user creates draft | ✅ Allowed — FY still active |
| July 1, 12:00 AM CT — user creates draft | ❌ Blocked — FY expired |
| July 1 — user submits draft created June 29 | ❌ Blocked — submit is also gated |
| July 1 — supervisor approves req submitted June 28 | ✅ Allowed — pipeline drains |
| July 1 — PO Entry issues PO on approved req | ✅ Allowed — pipeline drains |
| Admin runs rollover July 3 | Gate lifts immediately — new reqs enabled |
| Admin tries to rollover twice to same year | ❌ Blocked — validation error |
| Admin tries to rollover mid-year (January) | ⚠ Allowed but with strong confirmation warning |

---

## 11. Validation & Safety Guards

### 11.1 Rollover Validation Rules

| Rule | Error If Violated |
|------|------------------|
| Fiscal year label must be `YYYY-YYYY` format | `"Invalid fiscal year format"` |
| Second year must equal first year + 1 | `"End year must be exactly one year after start year"` |
| Cannot rollover to the same year | `"Fiscal year 2025-2026 is already the current year"` |
| If deny action chosen, denial reason required | `"Denial reason is required when auto-denying requisitions"` |
| REQ/PO number must be ≥ 1 | `"Next number must be at least 1"` |
| Approval levels must be 1–6 | `"Approval level must be between 1 and 6"` |

### 11.2 Rollover Safety Protections

| Protection | Implementation |
|------------|----------------|
| **Irreversibility warning** | Frontend shows explicit "cannot be undone" warning |
| **Confirmation dialog** | Requires clicking through a confirmation modal |
| **Audit trail** | `FiscalYearHistory` records every rollover permanently |
| **ADMIN-only** | Route middleware enforces ADMIN role |
| **CSRF protection** | POST endpoint validates CSRF token |
| **Double-rollover guard** | Cannot roll to a year that already exists in `FiscalYearHistory` |

### 11.3 No Early Run Guard (Updated)

Unlike the original proposal that limited rollover to within 30 days of year end, the system allows rollover at any time but shows an appropriate warning:

- **If before June 1:** Warning banner — *"The current fiscal year doesn't end until [date]. Are you sure you want to start a new year early?"*
- **If June 1 – July 31:** Normal flow, no extra warning.
- **If after July 31:** Info banner — *"The fiscal year ended [X days] ago."*

---

## 12. Migration Strategy

### 12.1 For Existing Installations

When deploying this update on a system that already has purchase orders:

1. **Migration runs automatically** via `prisma migrate deploy`.
2. `currentFiscalYear` starts as `null` → the fiscal year gate kicks in.
3. **Immediate action required:** An admin must go to `/admin/new-fiscal-year` and set up the initial fiscal year. This is the "first run" experience.
4. Existing POs get `fiscalYear` backfilled based on `createdAt`:
   - `createdAt` between July 1 2025 and June 30 2026 → `"2025-2026"`
   - `createdAt` between July 1 2024 and June 30 2025 → `"2024-2025"`
   - etc.

### 12.2 Backfill Script

A data migration in the Prisma migration SQL:

```sql
-- Backfill fiscalYear on existing purchase_orders
UPDATE purchase_orders
SET "fiscalYear" = CASE
  WHEN EXTRACT(MONTH FROM "createdAt") >= 7
    THEN EXTRACT(YEAR FROM "createdAt")::text || '-' || (EXTRACT(YEAR FROM "createdAt") + 1)::text
  ELSE (EXTRACT(YEAR FROM "createdAt") - 1)::text || '-' || EXTRACT(YEAR FROM "createdAt")::text
END
WHERE "fiscalYear" IS NULL;
```

### 12.3 For Fresh Installations

On first login, the admin sees the fiscal year setup prompt. The system guides them through initial configuration before any requisitions can be created.

---

## 13. File Change Manifest

### 13.1 Backend Files — Modified

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add fiscal year fields to `SystemSettings`, `fiscalYear` to `purchase_orders`, new `FiscalYearHistory` model |
| `src/services/settings.service.ts` | Add `getFiscalYearSummary()`, `startNewFiscalYear()`, `isFiscalYearActive()`, update defaults |
| `src/controllers/settings.controller.ts` | Add `getFiscalYearSummary`, `startNewFiscalYear` handlers |
| `src/routes/settings.routes.ts` | Add `GET /fiscal-year-summary`, `POST /new-fiscal-year` routes |
| `src/validators/settings.validators.ts` | Add `StartNewFiscalYearSchema`, update `UpdateSettingsSchema` |
| `src/services/purchaseOrder.service.ts` | Add `assertFiscalYearActive()`, stamp `fiscalYear`, dynamic approval levels, fiscal year filter |
| `src/validators/purchaseOrder.validators.ts` | Add `fiscalYear` to query DTO |

### 13.2 Backend Files — New

| File | Purpose |
|------|---------|
| `prisma/migrations/YYYYMMDDHHMMSS_add_fiscal_year_rollover/migration.sql` | Schema + data migration |

### 13.3 Frontend Files — Modified

| File | Changes |
|------|---------|
| `src/App.tsx` | Add `/admin/new-fiscal-year` route |
| `src/services/settingsService.ts` | Add `SystemSettings` fields, new API methods, new interfaces |
| `src/pages/admin/AdminSettings.tsx` | Add approval levels card, fiscal year info card |
| `src/pages/PurchaseOrders/PurchaseOrderList.tsx` | Add FY expired banner, disable new-req button, FY filter dropdown |
| `src/components/layout/AppLayout.tsx` | Add "New Fiscal Year" sidebar link |
| `src/lib/queryKeys.ts` | Add `fiscalYearSummary` key |

### 13.4 Frontend Files — New

| File | Purpose |
|------|---------|
| `src/pages/admin/NewFiscalYear.tsx` | Fiscal year rollover wizard page |

---

*End of specification.*
