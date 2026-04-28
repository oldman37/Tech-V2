# Admin System Settings — Implementation Specification

**Feature:** Admin System Settings page + `SystemSettings` DB table  
**Sprint:** Post C-2 (new)  
**Spec Author:** Research Subagent  
**Date:** 2026-03-11  

---

## Table of Contents

1. [Current State Findings](#1-current-state-findings)
2. [Database — SystemSettings Model](#2-database--systemsettings-model)
3. [Backend — Validators](#3-backend--validators)
4. [Backend — Settings Service](#4-backend--settings-service)
5. [Backend — Settings Controller](#5-backend--settings-controller)
6. [Backend — Settings Routes](#6-backend--settings-routes)
7. [Backend — server.ts Changes](#7-backend--serverts-changes)
8. [Backend — purchaseOrder.service.ts Changes](#8-backend--purchaseorderservicets-changes)
9. [Backend — purchaseOrder.controller.ts Changes](#9-backend--purchaseordercontrollerts-changes)
10. [Backend — seed.ts Changes](#10-backend--seedts-changes)
11. [Frontend — settingsService.ts](#11-frontend--settingsservicets)
12. [Frontend — AdminSettings.tsx Page](#12-frontend--adminsettingstsx-page)
13. [Frontend — App.tsx Route Registration](#13-frontend--apptsx-route-registration)
14. [Frontend — AppLayout.tsx Nav Changes](#14-frontend--applayouttsx-nav-changes)
15. [Migration](#15-migration)
16. [Ambiguities and Decisions](#16-ambiguities-and-decisions)

---

## 1. Current State Findings

### 1.1 PO Number Generation (issuePurchaseOrder)

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Method:** `issuePurchaseOrder`

The PO number is **not auto-generated**. It comes entirely from the caller:

```typescript
// issuePurchaseOrder receives IssuePODto which contains:
export const IssuePOSchema = z.object({
  poNumber: z
    .string()
    .min(1, 'PO number is required')
    .max(100, 'PO number must be 100 characters or less'),
});

// The service simply persists what is passed in:
data: {
  poNumber:     issueData.poNumber,   // ← user-supplied, no auto-increment
  status:       'po_issued',
  ...
}
```

There is a **duplicate check** before saving:
```typescript
const existing = await this.prisma.purchase_orders.findFirst({
  where: { poNumber: issueData.poNumber, NOT: { id } },
});
if (existing) throw new ValidationError(`PO number "${issueData.poNumber}" is already in use`, 'poNumber');
```

**Conclusion:** PO numbers must currently be typed manually by the DOS-level user. The spec replaces this with auto-generation using a DB-stored sequence counter + optional prefix, while keeping the option to override manually.

### 1.2 Requisition Number Assignment (submitPurchaseOrder)

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Method:** `submitPurchaseOrder`

**No requisition number (`reqNumber`) field exists** on the `purchase_orders` model. The schema has `id` (UUID), `poNumber` (only set at issuance), but no separate req number field.

```prisma
model purchase_orders {
  id        String  @id @default(uuid())
  poNumber  String? @unique          // set only at po_issued
  // ... no reqNumber field
}
```

**Conclusion:** The spec must add a `reqNumber` field to `purchase_orders` and auto-assign it at `submitPurchaseOrder` time using the settings sequence counter + optional prefix.

### 1.3 Email Notification Environment Variables

**File:** `backend/src/controllers/purchaseOrder.controller.ts`

Two env vars are used as **hard-coded email routing**:

| Variable | Location in Code | Trigger |
|---|---|---|
| `FINANCE_NOTIFY_EMAIL` | `submitPurchaseOrder` controller | When self-supervisor bypass fires, notifies Finance |
| `FINANCE_NOTIFY_EMAIL` | `approvePurchaseOrder` controller (permLevel=3) | After supervisor approval, notifies Finance for purchasing stage |
| `DOS_NOTIFY_EMAIL` | `approvePurchaseOrder` controller (permLevel=4) | After purchasing approval, notifies DOS |

Exact code:
```typescript
// In submitPurchaseOrder controller:
const financeEmail = process.env.FINANCE_NOTIFY_EMAIL;
if (financeEmail) {
  sendApprovalActionRequired(po as any, financeEmail, 'Purchasing Approval').catch(() => {});
}

// In approvePurchaseOrder controller:
if (permLvl === 3) {
  const financeEmail = process.env.FINANCE_NOTIFY_EMAIL;
  if (financeEmail) sendApprovalActionRequired(po as any, financeEmail, 'Purchasing Approval').catch(() => {});
} else if (permLvl === 4) {
  const dosEmail = process.env.DOS_NOTIFY_EMAIL;
  if (dosEmail) sendApprovalActionRequired(po as any, dosEmail, 'Director of Services Approval').catch(() => {});
}
```

`FINANCE_NOTIFY_EMAIL` and `DOS_NOTIFY_EMAIL` are **not present in the current `.env` file** — the vars are referenced in code but the `.env` file only contains database/auth/SMTP/group-ID settings. They would need to be added to `.env` manually, OR (the spec's goal) moved to the DB.

### 1.4 Supervisor Bypass Logic

**File:** `backend/src/services/purchaseOrder.service.ts`  
**Method:** `submitPurchaseOrder`

The bypass is hard-coded — there is no feature flag to enable/disable it:

```typescript
// isSelfSupervisor is determined purely from DB data:
isSelfSupervisor =
  !supervisorRecord ||
  supervisorRecord.supervisorId === po.requestorId;

if (isSelfSupervisor) {
  // Jumps draft → purchasing_approved (skips supervisor stage)
  // This is ALWAYS active — cannot be turned off without code change
}
```

The bypass fires when:
1. The user has no primary supervisor assigned in `UserSupervisor`, OR
2. The user's primary supervisor is themselves

History note written to DB when bypass fires:
```
'supervisor_approved stage bypassed: requestor is their own primary supervisor'
```

**Conclusion:** This needs a `settings.supervisorBypassEnabled` flag. When `false`, the self-supervisor condition should still submit `draft → submitted` (normal flow), even if the user IS their own supervisor.

### 1.5 Note: `reqNumber` field does not exist yet

The `purchase_orders` schema has no `reqNumber` field. The migration must add it.

### 1.6 Auth Pattern for Admin Routes

Backend: `admin.routes.ts` uses `requireAdmin` from `../middleware/auth`.  
Frontend: `ProtectedRoute` with `requireAdmin` prop checks `user?.roles?.includes('ADMIN')`.  
Nav: `AppLayout.tsx` filters nav items with `adminOnly: true` using `isAdmin` flag from `useAuthStore`.

---

## 2. Database — SystemSettings Model

### 2.1 Prisma Schema Addition

Add to `backend/prisma/schema.prisma` at the end of the file (before the closing of the schema, after `vendors`):

```prisma
// ============================================
// SYSTEM SETTINGS (singleton)
// ============================================

model SystemSettings {
  /// Singleton row — always "singleton"
  id                      String   @id @default("singleton")

  /// Requisition number sequencing
  nextReqNumber           Int      @default(1)
  reqNumberPrefix         String   @default("REQ")

  /// Purchase order number sequencing
  nextPoNumber            Int      @default(1)
  poNumberPrefix          String   @default("PO")

  /// Workflow feature flags
  supervisorBypassEnabled Boolean  @default(true)

  /// Approval-stage notification emails (replaces env vars)
  supervisorStageEmail    String?  // email to notify when submitted (supervisor stage)
  purchasingStageEmail    String?  // replaces FINANCE_NOTIFY_EMAIL
  dosStageEmail           String?  // replaces DOS_NOTIFY_EMAIL

  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@map("system_settings")
}
```

### 2.2 `purchase_orders` Model — Add `reqNumber`

Also add to the `purchase_orders` model in schema.prisma:

```prisma
model purchase_orders {
  // ... existing fields ...
  reqNumber   String?    @unique    // ← ADD THIS after poNumber
  // ...
}
```

Place it immediately after `poNumber  String?  @unique`.

### 2.3 Migration Name

```
add_system_settings
```

Run with:
```
npx prisma migrate dev --name add_system_settings
```

---

## 3. Backend — Validators

### 3.1 New File: `backend/src/validators/settings.validators.ts`

```typescript
/**
 * Zod validation schemas for system settings endpoints.
 * Follows the exact pattern of fundingSource.validators.ts.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// GET /api/settings — no body
// ---------------------------------------------------------------------------

// (no request body needed for GET)

// ---------------------------------------------------------------------------
// PUT /api/settings — full update (all fields optional for partial updates)
// ---------------------------------------------------------------------------

export const UpdateSettingsSchema = z.object({
  nextReqNumber: z
    .number({ error: 'nextReqNumber must be a number' })
    .int('nextReqNumber must be a whole number')
    .min(1, 'nextReqNumber must be at least 1')
    .optional(),

  reqNumberPrefix: z
    .string()
    .max(20, 'reqNumberPrefix must be 20 characters or less')
    .optional(),

  nextPoNumber: z
    .number({ error: 'nextPoNumber must be a number' })
    .int('nextPoNumber must be a whole number')
    .min(1, 'nextPoNumber must be at least 1')
    .optional(),

  poNumberPrefix: z
    .string()
    .max(20, 'poNumberPrefix must be 20 characters or less')
    .optional(),

  supervisorBypassEnabled: z
    .boolean({ error: 'supervisorBypassEnabled must be a boolean' })
    .optional(),

  supervisorStageEmail: z
    .string()
    .email('supervisorStageEmail must be a valid email')
    .max(255)
    .nullable()
    .optional(),

  purchasingStageEmail: z
    .string()
    .email('purchasingStageEmail must be a valid email')
    .max(255)
    .nullable()
    .optional(),

  dosStageEmail: z
    .string()
    .email('dosStageEmail must be a valid email')
    .max(255)
    .nullable()
    .optional(),
});

// TypeScript DTO types
export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>;
```

---

## 4. Backend — Settings Service

### 4.1 New File: `backend/src/services/settings.service.ts`

```typescript
/**
 * Settings Service
 *
 * Manages the singleton SystemSettings record.
 * Provides atomic increment helpers for req/PO number sequences.
 * Follows the FundingSourceService class pattern exactly.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';
import { UpdateSettingsDto } from '../validators/settings.validators';

// Default settings values — must match schema defaults
const SETTINGS_DEFAULTS = {
  nextReqNumber:           1,
  reqNumberPrefix:         'REQ',
  nextPoNumber:            1,
  poNumberPrefix:          'PO',
  supervisorBypassEnabled: true,
  supervisorStageEmail:    null,
  purchasingStageEmail:    null,
  dosStageEmail:           null,
} as const;

export class SettingsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Return the singleton settings row, creating it with defaults if absent.
   */
  async getSettings() {
    const settings = await this.prisma.systemSettings.upsert({
      where:  { id: 'singleton' },
      update: {},
      create: { id: 'singleton', ...SETTINGS_DEFAULTS },
    });
    return settings;
  }

  /**
   * Partial-update the singleton settings row.
   * Uses upsert so the row is created if it somehow doesn't exist.
   */
  async updateSettings(data: UpdateSettingsDto) {
    const settings = await this.prisma.systemSettings.upsert({
      where:  { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...SETTINGS_DEFAULTS, ...data },
    });
    logger.info('System settings updated', { data });
    return settings;
  }

  /**
   * Atomically claim the next requisition number and increment the counter.
   * Returns the formatted string, e.g. "REQ-00042".
   *
   * Uses a raw UPDATE ... RETURNING to guarantee atomicity under concurrent
   * submissions. Falls back to upsert-then-increment if raw SQL fails.
   */
  async getNextReqNumber(): Promise<string> {
    // Atomic increment via raw SQL
    const result = await this.prisma.$queryRaw<
      Array<{ next_req_number: number; req_number_prefix: string }>
    >`
      UPDATE system_settings
      SET    "nextReqNumber" = "nextReqNumber" + 1,
             "updatedAt"     = NOW()
      WHERE  id = 'singleton'
      RETURNING "nextReqNumber" - 1 AS next_req_number,
                "reqNumberPrefix"   AS req_number_prefix
    `;

    if (!result.length) {
      // Row didn't exist — create it and return 1
      await this.getSettings(); // creates with defaults
      return this.getNextReqNumber(); // retry once
    }

    const { next_req_number, req_number_prefix } = result[0];
    const formatted = `${req_number_prefix}-${String(next_req_number).padStart(5, '0')}`;
    logger.info('Req number issued', { formatted });
    return formatted;
  }

  /**
   * Atomically claim the next PO number and increment the counter.
   * Returns the formatted string, e.g. "PO-00017".
   */
  async getNextPoNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<
      Array<{ next_po_number: number; po_number_prefix: string }>
    >`
      UPDATE system_settings
      SET    "nextPoNumber" = "nextPoNumber" + 1,
             "updatedAt"   = NOW()
      WHERE  id = 'singleton'
      RETURNING "nextPoNumber" - 1 AS next_po_number,
                "poNumberPrefix"   AS po_number_prefix
    `;

    if (!result.length) {
      await this.getSettings();
      return this.getNextPoNumber();
    }

    const { next_po_number, po_number_prefix } = result[0];
    const formatted = `${po_number_prefix}-${String(next_po_number).padStart(5, '0')}`;
    logger.info('PO number issued', { formatted });
    return formatted;
  }
}
```

---

## 5. Backend — Settings Controller

### 5.1 New File: `backend/src/controllers/settings.controller.ts`

```typescript
/**
 * Settings Controller
 *
 * HTTP handlers for system settings.
 * Follows the FundingSourceController pattern exactly:
 *   - Singleton service instance
 *   - try/catch with handleControllerError
 */

import { Request, Response } from 'express';
import { SettingsService } from '../services/settings.service';
import { handleControllerError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';
import { UpdateSettingsSchema } from '../validators/settings.validators';

// ---------------------------------------------------------------------------
// Singleton service instance  
// ---------------------------------------------------------------------------

const service = new SettingsService(prisma);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/settings
 * Returns the singleton settings row (creates with defaults if absent).
 */
export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await service.getSettings();
    res.json(settings);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * PUT /api/settings
 * Partial-update the singleton settings row.
 * Only fields sent in the body are updated (undefined fields are ignored).
 */
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const data     = UpdateSettingsSchema.parse(req.body);
    const settings = await service.updateSettings(data);
    res.json(settings);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

---

## 6. Backend — Settings Routes

### 6.1 New File: `backend/src/routes/settings.routes.ts`

```typescript
/**
 * Settings Routes
 *
 * All routes require authentication + admin role (requireAdmin from auth middleware).
 * CSRF protection applied to state-changing routes.
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { validateCsrfToken } from '../middleware/csrf';
import { UpdateSettingsSchema } from '../validators/settings.validators';
import * as settingsController from '../controllers/settings.controller';

const router = Router();

// All settings routes require authentication and ADMIN role
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/settings
 * Returns the singleton system settings row.
 * No body required.
 */
router.get('/', settingsController.getSettings);

/**
 * PUT /api/settings
 * Partial-update system settings.
 * All fields optional — only sent fields are updated.
 */
router.put(
  '/',
  validateCsrfToken,
  validateRequest(UpdateSettingsSchema, 'body'),
  settingsController.updateSettings,
);

export default router;
```

---

## 7. Backend — server.ts Changes

### 7.1 Add Import

After the last route import (currently `purchaseOrder.routes.ts`), add:

```typescript
import settingsRoutes from './routes/settings.routes';
```

### 7.2 Mount Route

After `app.use('/api/purchase-orders', purchaseOrderRoutes);`, add:

```typescript
app.use('/api/settings', settingsRoutes);
```

Full context for the diff:
```typescript
// BEFORE:
app.use('/api/purchase-orders', purchaseOrderRoutes);

// AFTER:
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/settings', settingsRoutes);
```

---

## 8. Backend — purchaseOrder.service.ts Changes

This is the largest change. Three behaviours change:

### 8.1 Add Import

At the top of `purchaseOrder.service.ts`, import the SettingsService:

```typescript
import { SettingsService } from './settings.service';
```

**Important:** The `SettingsService` is injected — do not create a new `PrismaClient`. Instantiate it with the same prisma instance passed to the constructor. Add a `settingsService` property:

```typescript
export class PurchaseOrderService {
  private settingsService: SettingsService;

  constructor(private prisma: PrismaClient) {
    this.settingsService = new SettingsService(prisma);
  }
  // ...
}
```

### 8.2 Change 1 — submitPurchaseOrder: Assign reqNumber + Supervisor Bypass Feature Flag

**Current code (lines in self-supervisor bypass block):**
```typescript
isSelfSupervisor =
  !supervisorRecord ||
  supervisorRecord.supervisorId === po.requestorId;
```

**Change:** After the supervisor lookup block, read settings and gate the bypass:

```typescript
// After supervisor lookup, before the `if (isSelfSupervisor)` branch:
const settings = await this.settingsService.getSettings();

// If bypass is disabled, treat as normal submit regardless of supervisor situation
if (!settings.supervisorBypassEnabled) {
  isSelfSupervisor = false;
}

// Assign req number atomically
const reqNumber = await this.settingsService.getNextReqNumber();
```

**Change to the self-supervisor bypass transaction data:**
```typescript
// Add reqNumber to the purchase_orders.update call inside the bypass branch:
data: {
  reqNumber:     reqNumber,      // ← ADD
  status:        'purchasing_approved',
  submittedAt:   now,
  submittedDate: now,
},
```

**Change to the normal submit transaction data:**
```typescript
// Add reqNumber to the purchase_orders.update call inside the normal branch:
data: {
  reqNumber:     reqNumber,      // ← ADD
  status:        'submitted',
  submittedAt:   now,
  submittedDate: now,
},
```

**Full replacement for the method signature and the section from supervisor lookup to end of both branches:**

```typescript
async submitPurchaseOrder(
  id: string,
  userId: string,
): Promise<{ po: SubmitPOResult; supervisorEmail: string | null; selfSupervisorBypass: boolean }> {
  const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
  if (!po) throw new NotFoundError('Purchase order', id);

  if (po.requestorId !== userId) {
    throw new AuthorizationError('You can only submit your own purchase orders');
  }

  if (po.status !== 'draft') {
    throw new ValidationError(
      `Only draft purchase orders can be submitted. Current status: "${po.status}"`,
      'status',
    );
  }

  // --- Supervisor lookup (primary supervisor for requestor) ---
  let isSelfSupervisor = true;
  let supervisorEmail: string | null = null;
  try {
    const supervisorRecord = await this.prisma.userSupervisor.findFirst({
      where: { userId: po.requestorId, isPrimary: true },
      include: { supervisor: { select: { id: true, email: true } } },
    });
    isSelfSupervisor =
      !supervisorRecord ||
      supervisorRecord.supervisorId === po.requestorId;
    supervisorEmail = isSelfSupervisor
      ? null
      : (supervisorRecord!.supervisor.email ?? null);
  } catch (err) {
    logger.warn('Supervisor lookup failed, proceeding without supervisor notification', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // --- Load settings; gate bypass on feature flag ---
  const settings = await this.settingsService.getSettings();
  if (!settings.supervisorBypassEnabled) {
    isSelfSupervisor = false;
  }

  // --- Claim req number atomically ---
  const reqNumber = await this.settingsService.getNextReqNumber();

  const now = new Date();

  if (isSelfSupervisor) {
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchase_orders.update({
        where: { id },
        data: {
          reqNumber,
          status:        'purchasing_approved',
          submittedAt:   now,
          submittedDate: now,
        },
        include: {
          User:    { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors: true,
        },
      });

      await tx.requisitionStatusHistory.create({
        data: { purchaseOrderId: id, fromStatus: 'draft', toStatus: 'submitted', changedById: userId, changedAt: now },
      });

      await tx.requisitionStatusHistory.create({
        data: {
          purchaseOrderId: id,
          fromStatus: 'submitted',
          toStatus:   'purchasing_approved',
          changedById: userId,
          changedAt:  now,
          notes: 'supervisor_approved stage bypassed: requestor is their own primary supervisor',
        },
      });

      return updated;
    });

    logger.info('Purchase order auto-advanced past supervisor stage (self-supervisor)', {
      id, submittedBy: userId, newStatus: 'purchasing_approved',
    });

    return { po: record, supervisorEmail: null, selfSupervisorBypass: true };

  } else {
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchase_orders.update({
        where: { id },
        data: {
          reqNumber,
          status:        'submitted',
          submittedAt:   now,
          submittedDate: now,
        },
        include: {
          User:    { select: { id: true, firstName: true, lastName: true, email: true } },
          vendors: true,
        },
      });

      await tx.requisitionStatusHistory.create({
        data: { purchaseOrderId: id, fromStatus: 'draft', toStatus: 'submitted', changedById: userId, changedAt: now },
      });

      return updated;
    });

    logger.info('Purchase order submitted', { id, submittedBy: userId });
    return { po: record, supervisorEmail, selfSupervisorBypass: false };
  }
}
```

### 8.3 Change 2 — issuePurchaseOrder: Auto-generate PO Number

**Current behaviour:** The PO number comes from `issueData.poNumber` (user-supplied via `IssuePOSchema`).

**New behaviour:** Auto-generate using `settingsService.getNextPoNumber()` if `issueData.poNumber` is not explicitly provided. If provided, use the override and do NOT increment the sequence counter.

**Required schema change for `IssuePOSchema`:** Make `poNumber` optional:

```typescript
// In purchaseOrder.validators.ts — change IssuePOSchema:
export const IssuePOSchema = z.object({
  poNumber: z
    .string()
    .min(1, 'PO number must not be empty if provided')
    .max(100, 'PO number must be 100 characters or less')
    .optional(),   // ← was required, now optional
});
```

**Updated `issuePurchaseOrder` method — add auto-generation:**

```typescript
async issuePurchaseOrder(
  id: string,
  issueData: IssuePODto,
  userId: string,
) {
  const po = await this.prisma.purchase_orders.findUnique({ where: { id } });
  if (!po) throw new NotFoundError('Purchase order', id);

  if (po.status !== 'dos_approved') {
    throw new ValidationError(
      `PO can only be issued when status is "dos_approved". Current: "${po.status}"`,
      'status',
    );
  }

  if (!po.accountCode) {
    throw new ValidationError(
      'An account code must be assigned before issuing the PO',
      'accountCode',
    );
  }

  // Auto-generate PO number if not explicitly overridden
  const poNumber = issueData.poNumber
    ? issueData.poNumber
    : await this.settingsService.getNextPoNumber();

  // Ensure po number is not already taken by another PO
  const existing = await this.prisma.purchase_orders.findFirst({
    where: { poNumber, NOT: { id } },
  });
  if (existing) {
    throw new ValidationError(`PO number "${poNumber}" is already in use`, 'poNumber');
  }

  const now = new Date();

  const updated = await this.prisma.$transaction(async (tx) => {
    const record = await tx.purchase_orders.update({
      where: { id },
      data: {
        poNumber,
        status:       'po_issued',
        issuedAt:     now,
        isApproved:   true,
        approvedBy:   userId,
        approvedDate: now,
      },
      include: {
        po_items:       { orderBy: { lineNumber: 'asc' } },
        User:           { select: { id: true, firstName: true, lastName: true, email: true } },
        vendors:        true,
        officeLocation: true,
      },
    });

    await tx.requisitionStatusHistory.create({
      data: {
        purchaseOrderId: id,
        fromStatus: 'dos_approved',
        toStatus:   'po_issued',
        changedById: userId,
        changedAt:  now,
      },
    });

    return record;
  });

  logger.info('Purchase order issued', { id, poNumber, issuedBy: userId });
  // ... (rest of method — PDF generation etc. — unchanged)
  return updated;
}
```

---

## 9. Backend — purchaseOrder.controller.ts Changes

### 9.1 Remove Environment Variable Lookups

Replace all `process.env.FINANCE_NOTIFY_EMAIL` and `process.env.DOS_NOTIFY_EMAIL` lookups with settings DB reads.

**import change** — add SettingsService:
```typescript
import { SettingsService } from '../services/settings.service';
```

Add a singleton settings service at the module level (next to the `service` line):
```typescript
const settingsService = new SettingsService(prisma);
```

**Change: `submitPurchaseOrder` handler**

```typescript
// BEFORE:
const financeEmail = process.env.FINANCE_NOTIFY_EMAIL;
if (financeEmail) {
  sendApprovalActionRequired(po as any, financeEmail, 'Purchasing Approval').catch(() => {});
}

// AFTER:
settingsService.getSettings().then((s) => {
  if (s.purchasingStageEmail) {
    sendApprovalActionRequired(po as any, s.purchasingStageEmail, 'Purchasing Approval').catch(() => {});
  }
}).catch(() => {});
```

Also when non-bypass path notifies the supervisor's email, add notification to supervisorStageEmail:
```typescript
// After existing if (supervisorEmail) { sendRequisitionSubmitted... }
settingsService.getSettings().then((s) => {
  if (s.supervisorStageEmail && s.supervisorStageEmail !== supervisorEmail) {
    sendApprovalActionRequired(po as any, s.supervisorStageEmail, 'Supervisor Approval Required').catch(() => {});
  }
}).catch(() => {});
```

**Change: `approvePurchaseOrder` handler**

```typescript
// BEFORE:
if (permLvl === 3) {
  const financeEmail = process.env.FINANCE_NOTIFY_EMAIL;
  if (financeEmail) {
    sendApprovalActionRequired(po as any, financeEmail, 'Purchasing Approval').catch(() => {});
  }
} else if (permLvl === 4) {
  const dosEmail = process.env.DOS_NOTIFY_EMAIL;
  if (dosEmail) {
    sendApprovalActionRequired(po as any, dosEmail, 'Director of Services Approval').catch(() => {});
  }
}

// AFTER:
if (permLvl === 3 || permLvl === 4) {
  settingsService.getSettings().then((s) => {
    if (permLvl === 3 && s.purchasingStageEmail) {
      sendApprovalActionRequired(po as any, s.purchasingStageEmail, 'Purchasing Approval').catch(() => {});
    } else if (permLvl === 4 && s.dosStageEmail) {
      sendApprovalActionRequired(po as any, s.dosStageEmail, 'Director of Services Approval').catch(() => {});
    }
  }).catch(() => {});
}
```

---

## 10. Backend — seed.ts Changes

Add a `SystemSettings` upsert to `seed.ts`, at the end of `main()` before the final log line:

```typescript
// System settings singleton
console.log('Creating system settings...');
await prisma.systemSettings.upsert({
  where:  { id: 'singleton' },
  update: {},
  create: {
    id:                      'singleton',
    nextReqNumber:           1,
    reqNumberPrefix:         'REQ',
    nextPoNumber:            1,
    poNumberPrefix:          'PO',
    supervisorBypassEnabled: true,
    supervisorStageEmail:    null,
    purchasingStageEmail:    null,
    dosStageEmail:           null,
  },
});
console.log('✅ System settings created (singleton)');
```

---

## 11. Frontend — settingsService.ts

### 11.1 New File: `frontend/src/services/settingsService.ts`

```typescript
/**
 * Settings Service
 *
 * API calls for the SystemSettings singleton.
 * Follows the fundingSourceService object-literal pattern.
 *
 * Base path: /api/settings
 * Authentication: HttpOnly JWT cookie (handled by api.ts interceptors)
 * CSRF: Injected automatically for PUT by api.ts
 */

import { api } from './api';

export interface SystemSettings {
  id:                      string;  // always "singleton"
  nextReqNumber:           number;
  reqNumberPrefix:         string;
  nextPoNumber:            number;
  poNumberPrefix:          string;
  supervisorBypassEnabled: boolean;
  supervisorStageEmail:    string | null;
  purchasingStageEmail:    string | null;
  dosStageEmail:           string | null;
  createdAt:               string;
  updatedAt:               string;
}

export type UpdateSettingsInput = Partial<Omit<SystemSettings, 'id' | 'createdAt' | 'updatedAt'>>;

const settingsService = {
  /**
   * GET /api/settings
   * Returns the singleton settings row.
   */
  get: async (): Promise<SystemSettings> => {
    const res = await api.get<SystemSettings>('/settings');
    return res.data;
  },

  /**
   * PUT /api/settings
   * Partial-update settings. Only provided fields are changed.
   */
  update: async (data: UpdateSettingsInput): Promise<SystemSettings> => {
    const res = await api.put<SystemSettings>('/settings', data);
    return res.data;
  },
};

export default settingsService;
```

---

## 12. Frontend — AdminSettings.tsx Page

### 12.1 New File: `frontend/src/pages/admin/AdminSettings.tsx`

The page must be placed in a new `admin/` subdirectory under `pages/`.

```typescript
/**
 * AdminSettings Page
 *
 * Single admin page allowing ADMIN users to configure:
 *   1. Req/PO number sequences and prefixes
 *   2. Notification emails per approval stage
 *   3. Supervisor bypass toggle
 *
 * Uses React Hook Form with Zod for form management.
 * Uses TanStack Query for data fetching/mutation.
 * Uses MUI components for layout, consistent with existing admin pages.
 */

import { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Divider,
  FormControlLabel,
  Switch,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Typography,
  Stack,
  Grid,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import settingsService, { UpdateSettingsInput } from '../../services/settingsService';

// ---------------------------------------------------------------------------
// Local Zod schema (mirrors backend UpdateSettingsSchema)
// ---------------------------------------------------------------------------

const formSchema = z.object({
  nextReqNumber: z
    .number({ invalid_type_error: 'Must be a number' })
    .int()
    .min(1, 'Must be at least 1'),
  reqNumberPrefix: z.string().max(20, 'Max 20 characters'),
  nextPoNumber: z
    .number({ invalid_type_error: 'Must be a number' })
    .int()
    .min(1, 'Must be at least 1'),
  poNumberPrefix: z.string().max(20, 'Max 20 characters'),
  supervisorBypassEnabled: z.boolean(),
  supervisorStageEmail: z.string().email('Must be a valid email').or(z.literal('')).nullable().optional(),
  purchasingStageEmail: z.string().email('Must be a valid email').or(z.literal('')).nullable().optional(),
  dosStageEmail: z.string().email('Must be a valid email').or(z.literal('')).nullable().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading, isError } = useQuery({
    queryKey: ['settings'],
    queryFn:  settingsService.get,
  });

  const mutation = useMutation({
    mutationFn: (data: UpdateSettingsInput) => settingsService.update(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
    },
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nextReqNumber:           1,
      reqNumberPrefix:         'REQ',
      nextPoNumber:            1,
      poNumberPrefix:          'PO',
      supervisorBypassEnabled: true,
      supervisorStageEmail:    '',
      purchasingStageEmail:    '',
      dosStageEmail:           '',
    },
  });

  // Populate form when settings load
  useEffect(() => {
    if (settings) {
      reset({
        nextReqNumber:           settings.nextReqNumber,
        reqNumberPrefix:         settings.reqNumberPrefix,
        nextPoNumber:            settings.nextPoNumber,
        poNumberPrefix:          settings.poNumberPrefix,
        supervisorBypassEnabled: settings.supervisorBypassEnabled,
        supervisorStageEmail:    settings.supervisorStageEmail ?? '',
        purchasingStageEmail:    settings.purchasingStageEmail ?? '',
        dosStageEmail:           settings.dosStageEmail ?? '',
      });
    }
  }, [settings, reset]);

  const onSubmit = async (values: FormValues) => {
    // Convert empty strings to null for nullable email fields
    const payload: UpdateSettingsInput = {
      ...values,
      supervisorStageEmail: values.supervisorStageEmail || null,
      purchasingStageEmail: values.purchasingStageEmail || null,
      dosStageEmail:        values.dosStageEmail        || null,
    };
    await mutation.mutateAsync(payload);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" mt={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return <Alert severity="error">Failed to load system settings.</Alert>;
  }

  return (
    <Box maxWidth={800} mx="auto" mt={3}>
      <Typography variant="h5" gutterBottom>
        System Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Configure global system behaviour for requisitions and purchase orders.
      </Typography>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack spacing={3}>

          {/* ── Requisition Numbers ── */}
          <Card variant="outlined">
            <CardHeader title="Requisition Numbers" />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Controller
                    name="reqNumberPrefix"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Prefix"
                        size="small"
                        fullWidth
                        inputProps={{ maxLength: 20 }}
                        error={!!errors.reqNumberPrefix}
                        helperText={errors.reqNumberPrefix?.message ?? 'e.g. REQ'}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Controller
                    name="nextReqNumber"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Next Number"
                        type="number"
                        size="small"
                        fullWidth
                        inputProps={{ min: 1 }}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                        error={!!errors.nextReqNumber}
                        helperText={errors.nextReqNumber?.message ?? 'Next sequence value'}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box pt={1}>
                    <Typography variant="body2" color="text.secondary">
                      Preview: <strong>{settings?.reqNumberPrefix}-{String(settings?.nextReqNumber ?? 1).padStart(5, '0')}</strong>
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* ── PO Numbers ── */}
          <Card variant="outlined">
            <CardHeader title="Purchase Order Numbers" />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Controller
                    name="poNumberPrefix"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Prefix"
                        size="small"
                        fullWidth
                        inputProps={{ maxLength: 20 }}
                        error={!!errors.poNumberPrefix}
                        helperText={errors.poNumberPrefix?.message ?? 'e.g. PO'}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Controller
                    name="nextPoNumber"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Next Number"
                        type="number"
                        size="small"
                        fullWidth
                        inputProps={{ min: 1 }}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                        error={!!errors.nextPoNumber}
                        helperText={errors.nextPoNumber?.message ?? 'Next sequence value'}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box pt={1}>
                    <Typography variant="body2" color="text.secondary">
                      Preview: <strong>{settings?.poNumberPrefix}-{String(settings?.nextPoNumber ?? 1).padStart(5, '0')}</strong>
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* ── Notification Emails ── */}
          <Card variant="outlined">
            <CardHeader
              title="Notification Emails"
              subheader="Replaces the FINANCE_NOTIFY_EMAIL and DOS_NOTIFY_EMAIL environment variables."
            />
            <Divider />
            <CardContent>
              <Stack spacing={2}>
                <Controller
                  name="supervisorStageEmail"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ''}
                      label="Supervisor Stage — Notify Email"
                      size="small"
                      fullWidth
                      placeholder="supervisor-notify@district.org"
                      helperText={
                        errors.supervisorStageEmail?.message ??
                        'Optional — Additional email notified when a new requisition reaches supervisor stage.'
                      }
                      error={!!errors.supervisorStageEmail}
                    />
                  )}
                />
                <Controller
                  name="purchasingStageEmail"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ''}
                      label="Purchasing Stage — Notify Email (was FINANCE_NOTIFY_EMAIL)"
                      size="small"
                      fullWidth
                      placeholder="finance@district.org"
                      helperText={
                        errors.purchasingStageEmail?.message ??
                        'Notified when a requisition reaches the Purchasing Approval stage.'
                      }
                      error={!!errors.purchasingStageEmail}
                    />
                  )}
                />
                <Controller
                  name="dosStageEmail"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ''}
                      label="Director of Services Stage — Notify Email (was DOS_NOTIFY_EMAIL)"
                      size="small"
                      fullWidth
                      placeholder="dos@district.org"
                      helperText={
                        errors.dosStageEmail?.message ??
                        'Notified when a requisition reaches the Director of Services Approval stage.'
                      }
                      error={!!errors.dosStageEmail}
                    />
                  )}
                />
              </Stack>
            </CardContent>
          </Card>

          {/* ── Workflow Settings ── */}
          <Card variant="outlined">
            <CardHeader title="Workflow Settings" />
            <Divider />
            <CardContent>
              <Controller
                name="supervisorBypassEnabled"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={field.value}
                        onChange={field.onChange}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1">Supervisor Bypass (Legacy Auto-Approve)</Typography>
                        <Typography variant="body2" color="text.secondary">
                          When enabled, users who are their own primary supervisor skip the supervisor approval
                          stage and jump directly to Purchasing Approval.
                          Disable to require all requisitions to go through full supervisor review.
                        </Typography>
                      </Box>
                    }
                  />
                )}
              />
            </CardContent>
          </Card>

          {/* ── Actions ── */}
          {mutation.isError && (
            <Alert severity="error">
              Failed to save settings. Please try again.
            </Alert>
          )}
          {mutation.isSuccess && (
            <Alert severity="success">Settings saved successfully.</Alert>
          )}

          <Box display="flex" justifyContent="flex-end" gap={2}>
            <Button
              variant="outlined"
              onClick={() => settings && reset({
                nextReqNumber:           settings.nextReqNumber,
                reqNumberPrefix:         settings.reqNumberPrefix,
                nextPoNumber:            settings.nextPoNumber,
                poNumberPrefix:          settings.poNumberPrefix,
                supervisorBypassEnabled: settings.supervisorBypassEnabled,
                supervisorStageEmail:    settings.supervisorStageEmail ?? '',
                purchasingStageEmail:    settings.purchasingStageEmail ?? '',
                dosStageEmail:           settings.dosStageEmail ?? '',
              })}
              disabled={!isDirty || isSubmitting}
            >
              Reset
            </Button>
            <Button
              variant="contained"
              type="submit"
              disabled={!isDirty || isSubmitting}
            >
              {isSubmitting ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
              Save Settings
            </Button>
          </Box>

        </Stack>
      </form>
    </Box>
  );
}
```

**Note:** `react-hook-form` and `@hookform/resolvers` must be installed. Check if already present:
```
npm list react-hook-form @hookform/resolvers
```
Install if missing:
```
npm install react-hook-form @hookform/resolvers
```

---

## 13. Frontend — App.tsx Route Registration

### 13.1 Add Import

After the last `import` in `App.tsx`:
```typescript
import AdminSettings from './pages/admin/AdminSettings';
```

### 13.2 Add Route

After the `/supervisors` route and before the `/rooms` redirect, add:

```tsx
<Route
  path="/admin/settings"
  element={
    <ProtectedRoute requireAdmin>
      <AppLayout>
        <AdminSettings />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

---

## 14. Frontend — AppLayout.tsx Nav Changes

### 14.1 Add Nav Item

In the `Admin` section of `NAV_SECTIONS`, add the settings item:

```typescript
// BEFORE:
{
  title: 'Admin',
  items: [
    { label: 'Users',                   icon: '👥', path: '/users',       adminOnly: true },
    { label: 'Locations & Supervisors', icon: '🏢', path: '/supervisors', adminOnly: true },
  ],
},

// AFTER:
{
  title: 'Admin',
  items: [
    { label: 'Users',                   icon: '👥', path: '/users',            adminOnly: true },
    { label: 'Locations & Supervisors', icon: '🏢', path: '/supervisors',      adminOnly: true },
    { label: 'System Settings',         icon: '⚙️', path: '/admin/settings',   adminOnly: true },
  ],
},
```

---

## 15. Migration

### 15.1 Steps

1. Add the `SystemSettings` model to `schema.prisma` (Section 2.1).
2. Add `reqNumber String? @unique` to `purchase_orders` model (Section 2.2).
3. Run migration:
   ```
   cd backend
   npx prisma migrate dev --name add_system_settings
   ```
4. Run seed to create singleton row:
   ```
   npx prisma db seed
   ```

### 15.2 What the Migration Creates

- New table: `system_settings`
  - `id` TEXT PRIMARY KEY DEFAULT 'singleton'
  - `nextReqNumber` INT DEFAULT 1  
  - `reqNumberPrefix` TEXT DEFAULT 'REQ'  
  - `nextPoNumber` INT DEFAULT 1  
  - `poNumberPrefix` TEXT DEFAULT 'PO'  
  - `supervisorBypassEnabled` BOOLEAN DEFAULT true  
  - `supervisorStageEmail` TEXT NULL  
  - `purchasingStageEmail` TEXT NULL  
  - `dosStageEmail` TEXT NULL  
  - `createdAt` TIMESTAMP DEFAULT now()  
  - `updatedAt` TIMESTAMP  

- Altered table: `purchase_orders`
  - ADD COLUMN `reqNumber` TEXT NULL UNIQUE

---

## 16. Ambiguities and Decisions

### 16.1 `reqNumber` Field Missing from `purchase_orders`
**Finding:** There is no separate `reqNumber` field on the `purchase_orders` table; only `poNumber` exists (set at `po_issued` stage).  
**Decision:** Add `reqNumber String? @unique` to the model and assign it at submit time. This is non-breaking: the field is nullable so existing rows are not affected.

### 16.2 `poNumber` in `IssuePOSchema` — Required vs Optional
**Finding:** Currently `poNumber` is required in `IssuePOSchema`. The spec intends auto-generation.  
**Decision:** Make `poNumber` optional in `IssuePOSchema`. When omitted, `issuePurchaseOrder` calls `getNextPoNumber()`. When provided, it overrides (manual entry) without incrementing the counter. This preserves backward compatibility for any client that explicitly passes a PO number.

### 16.3 `FINANCE_NOTIFY_EMAIL` / `DOS_NOTIFY_EMAIL` Not in `.env`
**Finding:** These env vars are referenced in the controller code but are NOT present in the `.env` file. They have always been a no-op unless someone manually adds them.  
**Decision:** The migration to DB settings is safe immediately. The old env references are removed. As a transition note: if someone had manually added those env vars before deploying this feature, they should manually copy the values into the admin settings UI after deployment.

### 16.4 Format of Req/PO Numbers
**Decision:** Format is `{prefix}-{5-digit-zero-padded-counter}`, e.g. `REQ-00001`, `PO-00001`. The padding width (5) is baked into the service methods. If the district needs a different width it can be added as a settings field later.

### 16.5 Race Condition on Sequence Numbers
**Decision:** Both `getNextReqNumber` and `getNextPoNumber` use a raw `UPDATE ... RETURNING` statement which is atomic at the database level. This is the correct approach for PostgreSQL sequence counters without using a native SEQUENCE object. The `$queryRaw` approach is already established in the codebase (Prisma client is available).

### 16.6 React Hook Form Dependency
**Finding:** `package.json` does not include `react-hook-form` or `@hookform/resolvers`.  
**Decision:** Install both before implementing `AdminSettings.tsx`. The implementation subagent should run:
```
cd frontend && npm install react-hook-form @hookform/resolvers
```

### 16.7 `admin/` subdirectory under `pages/`
**Finding:** No `admin/` subdirectory exists under `frontend/src/pages/`. Existing admin pages (`Users.tsx`, `SupervisorManagement.tsx`, `ReferenceDataManagement.tsx`) are placed directly in `pages/`.  
**Decision:** Create `frontend/src/pages/admin/AdminSettings.tsx` as a new subdirectory. This sets a clean convention for future admin pages. Do NOT move existing admin pages to avoid unnecessary changes.

### 16.8 Supervisor Bypass When Bypass Disabled — Supervisor Email Still Sent?
**Clarification:** When `supervisorBypassEnabled = false`, the flow enters the normal `submitted` branch. The controller will still call `sendRequisitionSubmitted(po, supervisorEmail)` if a supervisor email was found. If no supervisor is assigned, no email is sent. The `supervisorStageEmail` setting provides a fallback notification address.

### 16.9 Prisma `userSupervisor` — capitalization
In `purchaseOrder.service.ts` the query uses `this.prisma.userSupervisor.findFirst` — verify after adding the new model that Prisma client regenerates correctly with `prisma generate`.

---

## File Summary

| File | Action |
|---|---|
| `backend/prisma/schema.prisma` | Add `SystemSettings` model; add `reqNumber` to `purchase_orders` |
| `backend/prisma/seed.ts` | Add `systemSettings` upsert |
| `backend/src/validators/settings.validators.ts` | **New file** |
| `backend/src/services/settings.service.ts` | **New file** |
| `backend/src/controllers/settings.controller.ts` | **New file** |
| `backend/src/routes/settings.routes.ts` | **New file** |
| `backend/src/server.ts` | Add import + mount `/api/settings` |
| `backend/src/validators/purchaseOrder.validators.ts` | Make `IssuePOSchema.poNumber` optional |
| `backend/src/services/purchaseOrder.service.ts` | Inject SettingsService; modify `submitPurchaseOrder`; modify `issuePurchaseOrder` |
| `backend/src/controllers/purchaseOrder.controller.ts` | Replace env var lookups with `settingsService.getSettings()` |
| `frontend/src/services/settingsService.ts` | **New file** |
| `frontend/src/pages/admin/AdminSettings.tsx` | **New file** |
| `frontend/src/App.tsx` | Add import + `/admin/settings` route |
| `frontend/src/components/layout/AppLayout.tsx` | Add "System Settings" nav item to Admin section |
