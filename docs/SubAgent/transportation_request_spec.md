# Transportation Request Feature — Comprehensive Specification

**Feature:** Standalone "Request for Transportation" form  
**Date:** 2026-04-30  
**Author:** Subagent (Research Phase)  
**Status:** Ready for Implementation

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Feature Overview](#2-feature-overview)
3. [Prisma Schema Additions](#3-prisma-schema-additions)
4. [Permission Module Addition](#4-permission-module-addition)
5. [Backend API Endpoints](#5-backend-api-endpoints)
6. [Backend File Structure](#6-backend-file-structure)
7. [Frontend Pages & Components](#7-frontend-pages--components)
8. [Navigation Integration](#8-navigation-integration)
9. [Email Notifications](#9-email-notifications)
10. [Security Considerations](#10-security-considerations)
11. [Complete File List](#11-complete-file-list)
12. [Step-by-Step Implementation Plan](#12-step-by-step-implementation-plan)

---

## 1. Current State Analysis

### What Already Exists (Do Not Modify)

The codebase already contains a `FieldTripTransportationRequest` model and associated files. This is a **different** feature — it is Step 2 of the multi-stage Field Trip approval workflow (tied to a `FieldTripRequest` parent record, processed by the Transportation **Director**).

| Existing File | Purpose | Status |
|---|---|---|
| `backend/prisma/schema.prisma` (lines 631–673) | `FieldTripTransportationRequest` model | Already implemented — **do not modify** |
| `backend/src/controllers/fieldTripTransportation.controller.ts` | Field trip transportation Step 2 | Already implemented — **do not modify** |
| `backend/src/services/fieldTripTransportation.service.ts` | Field trip transportation Step 2 | Already implemented — **do not modify** |
| `backend/src/routes/fieldTrip.routes.ts` | All field trip routes incl. transportation sub-routes | Already implemented — **do not modify** |
| `backend/src/validators/fieldTripTransportation.validators.ts` | Field trip transportation validation | Already implemented — **do not modify** |
| `frontend/src/services/fieldTripTransportation.service.ts` | Frontend API calls for step 2 | Already implemented — **do not modify** |
| `frontend/src/pages/FieldTrip/FieldTripTransportationPage.tsx` | Frontend form for step 2 | Already implemented — **do not modify** |

### What Needs to Be Created

A **standalone** "Request for Transportation" feature for any staff member to request transportation for any group activity — not just field trips. This feature:
- Is submitted directly (not tied to a field trip approval chain)
- Is approved/denied by the **Transportation Secretary** group only
- Maps to the "Request for Transportation" PDF form

### Existing Patterns to Follow

| Pattern | Location |
|---|---|
| Controller with handleControllerError | `backend/src/controllers/fieldTripTransportation.controller.ts` |
| Service class with Prisma | `backend/src/services/fieldTripTransportation.service.ts` |
| Zod validators file | `backend/src/validators/fieldTripTransportation.validators.ts` |
| Router with authenticate + requireModule + CSRF | `backend/src/routes/fieldTrip.routes.ts` |
| Email service with fetchGroupEmails | `backend/src/services/email.service.ts` |
| groupAuth.ts GROUP_MODULE_MAP | `backend/src/utils/groupAuth.ts` |
| Frontend service file | `frontend/src/services/fieldTripTransportation.service.ts` |
| Frontend list page with TanStack Query + MUI | `frontend/src/pages/FieldTrip/FieldTripListPage.tsx` |
| MUI Table + Chip status badges | `frontend/src/pages/FieldTrip/FieldTripListPage.tsx` |

---

## 2. Feature Overview

### What It Is

A standalone form that allows any authenticated staff member to submit a transportation request (e.g., for group activities, sports, community events, non-field-trip school activities). The Transportation Secretary reviews and approves or denies each request.

### Workflow

```
Staff Member fills form → PENDING (submitted)
                                 ↓
                   Transportation Secretary reviews
                         ↙              ↘
                  APPROVED            DENIED (with reason)
                     ↓                    ↓
           Email to submitter      Email to submitter
```

### Roles

| Role | Can Do |
|---|---|
| Any authenticated staff | Create, view own requests, delete own PENDING requests |
| Transportation Secretary (`ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID`) | View all requests, approve, deny with reason |
| ADMIN | Full access (bypasses all checks per existing pattern) |

---

## 3. Prisma Schema Additions

### New Enum

```prisma
enum TransportationRequestStatus {
  PENDING
  APPROVED
  DENIED
}
```

> **Note on Prisma enums:** The project currently uses string fields (not Prisma enums) for status in existing models (e.g., `FieldTripRequest.status`, `maintenance_orders.status`). Follow the existing pattern and use `String @default("PENDING")` with a constrained set of values validated at the Zod layer, rather than a Prisma-level enum. This is consistent with the rest of the codebase.

### New Model: `TransportationRequest`

Add to the bottom of `backend/prisma/schema.prisma`, before the closing of the file, after the `vendors` model:

```prisma
// ============================================
// STANDALONE TRANSPORTATION REQUESTS
// ============================================

model TransportationRequest {
  id            String   @id @default(uuid())

  // Submitter (auto-populated from JWT)
  submittedById String
  submittedBy   User     @relation("TransportationRequestSubmitter", fields: [submittedById], references: [id])

  // Part A — Requestor fills out (mirrors PDF form)
  dateSubmitted          DateTime              @default(now())
  school                 String                @db.VarChar(200)
  groupOrActivity        String                @db.VarChar(300)    // "Group or activity requesting transportation"
  sponsorName            String                @db.VarChar(200)    // Teacher/coordinator name
  chargedTo              String?               @db.VarChar(300)    // Department/account billed
  tripDate               DateTime
  busCount               Int
  studentCount           Int
  chaperoneCount         Int
  needsDriver            Boolean               @default(true)      // true = district driver requested
  driverName             String?               @db.VarChar(200)    // Required when needsDriver = false

  // Location & times
  loadingLocation        String                @db.VarChar(500)
  loadingTime            String                @db.VarChar(20)
  leavingSchoolTime      String                @db.VarChar(20)
  arriveFirstDestTime    String?               @db.VarChar(20)
  leaveLastDestTime      String?               @db.VarChar(20)
  returnToSchoolTime     String                @db.VarChar(20)

  // Destinations (supports multiple stops)
  primaryDestinationName    String             @db.VarChar(500)
  primaryDestinationAddress String             @db.VarChar(500)
  additionalDestinations    Json?              // Array of { name: string; address: string }

  // Free-text notes
  tripItinerary          String?               @db.Text

  // Workflow
  status                 String                @default("PENDING")
  // PENDING | APPROVED | DENIED

  // Approval/Denial fields (set by Transportation Secretary)
  approvalComments       String?               @db.Text
  approvedById           String?
  approvedAt             DateTime?
  deniedById             String?
  deniedAt               DateTime?
  denialReason           String?               @db.Text

  // Snapshot of submitter email (for notifications at approval/denial time)
  submitterEmail         String

  // Timestamps
  createdAt              DateTime              @default(now())
  updatedAt              DateTime              @updatedAt

  // Relations
  approvedBy             User?                 @relation("TransportationRequestApprover", fields: [approvedById], references: [id])
  deniedBy               User?                 @relation("TransportationRequestDenier", fields: [deniedById], references: [id])

  @@index([status])
  @@index([submittedById])
  @@index([tripDate])
  @@index([status, submittedById])
  @@map("transportation_requests")
}
```

### User Model Relations to Add

In the existing `User` model (near the other `transportationApprovals` / `transportationDenials` lines), add:

```prisma
  // Standalone Transportation Request relations
  transportationRequests          TransportationRequest[]  @relation("TransportationRequestSubmitter")
  transportationRequestApprovals  TransportationRequest[]  @relation("TransportationRequestApprover")
  transportationRequestDenials    TransportationRequest[]  @relation("TransportationRequestDenier")
```

---

## 4. Permission Module Addition

### New Module: `TRANSPORTATION_REQUESTS`

Modify `backend/src/utils/groupAuth.ts` to add the new module to:

1. **The `PermissionModuleType` union type:**

```typescript
type PermissionModuleType = 'TECHNOLOGY' | 'MAINTENANCE' | 'REQUISITIONS' | 'WORK_ORDERS' | 'FIELD_TRIPS' | 'TRANSPORTATION_REQUESTS';
```

2. **The `GROUP_MODULE_MAP`:**

```typescript
  TRANSPORTATION_REQUESTS: [
    ['ENTRA_ADMIN_GROUP_ID',                      2],
    ['ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID',    2],  // Secretary: can approve/deny all
    ['ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID',     2],  // Director also gets secretary access
    ['ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID',         2],
    ['ENTRA_ALL_STAFF_GROUP_ID',                   1],  // All staff: submit + view own
  ],
```

**Permission levels:**
- Level 1 — Any authenticated staff: create new request, view own requests, delete own PENDING requests
- Level 2 — Transportation Secretary / Director / Admin: view all requests, approve, deny

### New Environment Variable

Add to `backend/.env` (already provided by user, not yet in file):

```
# Transportation Secretary group (standalone transportation request approver)
ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID=d0232265-a91b-4cf7-9fdb-b7fdf1eaea30
```

---

## 5. Backend API Endpoints

### Base Path: `/api/transportation-requests`

All routes require:
- `authenticate` middleware (JWT validation)
- `validateCsrfToken` middleware (state-changing routes)
- `requireModule('TRANSPORTATION_REQUESTS', minLevel)` for permission control

---

### `POST /api/transportation-requests`

**Permission:** Level 1 (any staff)  
**Description:** Submit a new transportation request. Status is immediately `PENDING` (no draft state — it goes directly to the secretary queue).  
**Request Body:**

```typescript
{
  school:                   string;           // max 200
  groupOrActivity:          string;           // max 300
  sponsorName:              string;           // max 200
  chargedTo?:               string | null;    // max 300
  tripDate:                 string;           // ISO date string
  busCount:                 number;           // int, min 1, max 99
  studentCount:             number;           // int, min 1, max 5000
  chaperoneCount:           number;           // int, min 0, max 500
  needsDriver:              boolean;
  driverName?:              string | null;    // required when needsDriver = false
  loadingLocation:          string;           // max 500
  loadingTime:              string;           // max 20 (e.g., "7:30 AM")
  leavingSchoolTime:        string;           // max 20
  arriveFirstDestTime?:     string | null;    // max 20
  leaveLastDestTime?:       string | null;    // max 20
  returnToSchoolTime:       string;           // max 20
  primaryDestinationName:   string;           // max 500
  primaryDestinationAddress: string;          // max 500
  additionalDestinations?:  Array<{ name: string; address: string }> | null;  // max 10
  tripItinerary?:           string | null;    // max 5000
}
```

**Business Rules:**
- `driverName` is required when `needsDriver === false`
- `tripDate` must be in the future (at least tomorrow)
- `busCount` >= 1
- submitterEmail auto-populated from `req.user.email`
- `submittedById` auto-populated from `req.user.id`
- Email notification sent to Transportation Secretary group (non-blocking)

**Response:** `201 Created` — full request object

---

### `GET /api/transportation-requests`

**Permission:** Level 1 (any staff)  
**Description:** List requests. Staff (level 1) see only their own. Secretary/admin (level 2+) see all.  
**Query Params:**
- `status?: 'PENDING' | 'APPROVED' | 'DENIED'` — filter by status
- `from?: string` — ISO date, filter tripDate >= from
- `to?: string` — ISO date, filter tripDate <= to

**Response:** `200 OK` — array of request objects (with submittedBy user info)

---

### `GET /api/transportation-requests/:id`

**Permission:** Level 1 (own requests only), Level 2 (any request)  
**Description:** Get a single transportation request with full detail.  
**Authorization Logic:** Service checks `submittedById === req.user.id` OR `permLevel >= 2`  
**Response:** `200 OK` — full request object | `403 Forbidden` | `404 Not Found`

---

### `PUT /api/transportation-requests/:id/approve`

**Permission:** Level 2 (Secretary only)  
**Description:** Approve a PENDING transportation request.  
**Request Body:**

```typescript
{
  comments?: string | null;  // max 3000 — optional approval notes
}
```

**Business Rules:**
- Request must be in `PENDING` status
- Sets `status = 'APPROVED'`, `approvedById`, `approvedAt`, `approvalComments`
- Sends email to submitter (non-blocking)

**Response:** `200 OK` — updated request

---

### `PUT /api/transportation-requests/:id/deny`

**Permission:** Level 2 (Secretary only)  
**Description:** Deny a PENDING transportation request with a required reason.  
**Request Body:**

```typescript
{
  denialReason: string;   // required, min 10 chars, max 3000
}
```

**Business Rules:**
- Request must be in `PENDING` status
- Sets `status = 'DENIED'`, `deniedById`, `deniedAt`, `denialReason`
- Sends email to submitter (non-blocking)

**Response:** `200 OK` — updated request

---

### `DELETE /api/transportation-requests/:id`

**Permission:** Level 1 (own PENDING requests only)  
**Description:** Delete a pending request the current user submitted.  
**Business Rules:**
- Only the original submitter can delete
- Only `PENDING` requests can be deleted (not APPROVED/DENIED)
- Hard delete from DB

**Response:** `204 No Content` | `403 Forbidden` | `404 Not Found`

---

## 6. Backend File Structure

### Files to Create

#### `backend/src/validators/transportationRequest.validators.ts`

```typescript
import { z } from 'zod';

export const TRANSPORTATION_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'DENIED'] as const;
export type TransportationRequestStatus = (typeof TRANSPORTATION_REQUEST_STATUSES)[number];

const AdditionalDestinationSchema = z.object({
  name:    z.string().min(1).max(500),
  address: z.string().min(1).max(500),
});

export const CreateTransportationRequestSchema = z.object({
  school:                    z.string().min(1).max(200),
  groupOrActivity:           z.string().min(1).max(300),
  sponsorName:               z.string().min(1).max(200),
  chargedTo:                 z.string().max(300).optional().nullable(),
  tripDate:                  z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  busCount:                  z.number().int().min(1).max(99),
  studentCount:              z.number().int().min(1).max(5000),
  chaperoneCount:            z.number().int().min(0).max(500),
  needsDriver:               z.boolean(),
  driverName:                z.string().max(200).optional().nullable(),
  loadingLocation:           z.string().min(1).max(500),
  loadingTime:               z.string().min(1).max(20),
  leavingSchoolTime:         z.string().min(1).max(20),
  arriveFirstDestTime:       z.string().max(20).optional().nullable(),
  leaveLastDestTime:         z.string().max(20).optional().nullable(),
  returnToSchoolTime:        z.string().min(1).max(20),
  primaryDestinationName:    z.string().min(1).max(500),
  primaryDestinationAddress: z.string().min(1).max(500),
  additionalDestinations:    z.array(AdditionalDestinationSchema).max(10).optional().nullable(),
  tripItinerary:             z.string().max(5000).optional().nullable(),
}).refine(
  (data) => data.needsDriver || (data.driverName && data.driverName.trim().length > 0),
  { message: 'Driver name is required when you are providing your own driver', path: ['driverName'] },
);

export type CreateTransportationRequestDto = z.infer<typeof CreateTransportationRequestSchema>;

export const ApproveTransportationRequestSchema = z.object({
  comments: z.string().max(3000).optional().nullable(),
});

export type ApproveTransportationRequestDto = z.infer<typeof ApproveTransportationRequestSchema>;

export const DenyTransportationRequestSchema = z.object({
  denialReason: z.string().min(10, 'Denial reason must be at least 10 characters').max(3000),
});

export type DenyTransportationRequestDto = z.infer<typeof DenyTransportationRequestSchema>;

export const TransportationRequestIdParamSchema = z.object({
  id: z.string().uuid('Invalid transportation request ID'),
});

export const ListTransportationRequestsQuerySchema = z.object({
  status: z.enum(TRANSPORTATION_REQUEST_STATUSES).optional(),
  from:   z.string().optional(),
  to:     z.string().optional(),
});
```

---

#### `backend/src/services/transportationRequest.service.ts`

```typescript
/**
 * TransportationRequestService
 *
 * Business logic for standalone transportation requests.
 * Pattern follows FieldTripTransportationService exactly:
 *   - Class instance, exported as singleton
 *   - Prisma includes defined as const at top
 *   - Custom errors: NotFoundError, ValidationError, AuthorizationError
 */
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { NotFoundError, ValidationError, AuthorizationError } from '../utils/errors';
import type {
  CreateTransportationRequestDto,
  ApproveTransportationRequestDto,
  DenyTransportationRequestDto,
} from '../validators/transportationRequest.validators';

// Prisma include shape (reused across all reads)
const TR_WITH_USERS = {
  submittedBy: {
    select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
  },
  approvedBy: {
    select: { id: true, displayName: true, firstName: true, lastName: true },
  },
  deniedBy: {
    select: { id: true, displayName: true, firstName: true, lastName: true },
  },
} as const;

export class TransportationRequestService {

  async create(userId: string, userEmail: string, data: CreateTransportationRequestDto) {
    if (!data.needsDriver && !data.driverName?.trim()) {
      throw new ValidationError('Driver name is required when providing your own driver');
    }

    const tripDate = new Date(data.tripDate);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    if (tripDate < tomorrow) {
      throw new ValidationError('Trip date must be in the future');
    }

    logger.info('Creating transportation request', { userId });

    return prisma.transportationRequest.create({
      data: {
        submittedById:             userId,
        submitterEmail:            userEmail,
        school:                    data.school,
        groupOrActivity:           data.groupOrActivity,
        sponsorName:               data.sponsorName,
        chargedTo:                 data.chargedTo ?? null,
        tripDate:                  tripDate,
        busCount:                  data.busCount,
        studentCount:              data.studentCount,
        chaperoneCount:            data.chaperoneCount,
        needsDriver:               data.needsDriver,
        driverName:                data.driverName ?? null,
        loadingLocation:           data.loadingLocation,
        loadingTime:               data.loadingTime,
        leavingSchoolTime:         data.leavingSchoolTime,
        arriveFirstDestTime:       data.arriveFirstDestTime ?? null,
        leaveLastDestTime:         data.leaveLastDestTime ?? null,
        returnToSchoolTime:        data.returnToSchoolTime,
        primaryDestinationName:    data.primaryDestinationName,
        primaryDestinationAddress: data.primaryDestinationAddress,
        additionalDestinations:    data.additionalDestinations ?? Prisma.DbNull,
        tripItinerary:             data.tripItinerary ?? null,
        status:                    'PENDING',
      },
      include: TR_WITH_USERS,
    });
  }

  async list(userId: string, permLevel: number, filters: {
    status?: string;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.TransportationRequestWhereInput = {};

    // Level 1: own requests only; level 2+: all requests
    if (permLevel < 2) {
      where.submittedById = userId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.from || filters.to) {
      where.tripDate = {};
      if (filters.from) (where.tripDate as any).gte = new Date(filters.from);
      if (filters.to)   (where.tripDate as any).lte = new Date(filters.to);
    }

    return prisma.transportationRequest.findMany({
      where,
      include: TR_WITH_USERS,
      orderBy: [{ tripDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getById(id: string, userId: string, permLevel: number) {
    const record = await prisma.transportationRequest.findUnique({
      where:   { id },
      include: TR_WITH_USERS,
    });

    if (!record) throw new NotFoundError('TransportationRequest', id);

    // Level 1 users can only see their own
    if (permLevel < 2 && record.submittedById !== userId) {
      throw new AuthorizationError('You do not have access to this transportation request');
    }

    return record;
  }

  async approve(id: string, approverId: string, data: ApproveTransportationRequestDto) {
    const record = await prisma.transportationRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('TransportationRequest', id);
    if (record.status !== 'PENDING') {
      throw new ValidationError(`Cannot approve a request with status '${record.status}'`);
    }

    logger.info('Approving transportation request', { id, approverId });

    return prisma.transportationRequest.update({
      where: { id },
      data: {
        status:           'APPROVED',
        approvedById:     approverId,
        approvedAt:       new Date(),
        approvalComments: data.comments ?? null,
      },
      include: TR_WITH_USERS,
    });
  }

  async deny(id: string, denierId: string, data: DenyTransportationRequestDto) {
    const record = await prisma.transportationRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('TransportationRequest', id);
    if (record.status !== 'PENDING') {
      throw new ValidationError(`Cannot deny a request with status '${record.status}'`);
    }

    logger.info('Denying transportation request', { id, denierId });

    return prisma.transportationRequest.update({
      where: { id },
      data: {
        status:       'DENIED',
        deniedById:   denierId,
        deniedAt:     new Date(),
        denialReason: data.denialReason,
      },
      include: TR_WITH_USERS,
    });
  }

  async delete(id: string, userId: string) {
    const record = await prisma.transportationRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('TransportationRequest', id);
    if (record.submittedById !== userId) {
      throw new AuthorizationError('You can only delete your own transportation requests');
    }
    if (record.status !== 'PENDING') {
      throw new ValidationError('Only PENDING requests can be deleted');
    }

    logger.info('Deleting transportation request', { id, userId });
    await prisma.transportationRequest.delete({ where: { id } });
  }
}

export const transportationRequestService = new TransportationRequestService();
```

---

#### `backend/src/controllers/transportationRequest.controller.ts`

```typescript
/**
 * Transportation Request Controller
 *
 * HTTP handlers for standalone transportation requests.
 * Follows the fieldTripTransportation.controller.ts pattern exactly.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { transportationRequestService } from '../services/transportationRequest.service';
import {
  CreateTransportationRequestSchema,
  ApproveTransportationRequestSchema,
  DenyTransportationRequestSchema,
  ListTransportationRequestsQuerySchema,
} from '../validators/transportationRequest.validators';
import {
  fetchGroupEmails,
  sendTransportationRequestSubmitted,
  sendTransportationRequestApproved,
  sendTransportationRequestDenied,
} from '../services/email.service';
import { handleControllerError } from '../utils/errorHandler';

// POST /api/transportation-requests
export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data      = CreateTransportationRequestSchema.parse(req.body);
    const userId    = req.user!.id;
    const userEmail = req.user!.email;

    const result = await transportationRequestService.create(userId, userEmail, data);

    // Non-blocking: notify Transportation Secretary group
    const secretaryGroupId = process.env.ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID;
    if (secretaryGroupId) {
      fetchGroupEmails(secretaryGroupId)
        .then((emails) => {
          if (emails.length === 0) return;
          return sendTransportationRequestSubmitted(emails, result, req.user!.name);
        })
        .catch((err: unknown) => {
          logger.error('Failed to notify transportation secretary', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    res.status(201).json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// GET /api/transportation-requests
export const list = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query     = ListTransportationRequestsQuerySchema.parse(req.query);
    const userId    = req.user!.id;
    const permLevel = req.user!.permLevel ?? 1;

    const results = await transportationRequestService.list(userId, permLevel, query);
    res.json(results);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// GET /api/transportation-requests/:id
export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId    = req.user!.id;
    const permLevel = req.user!.permLevel ?? 1;
    const { id }    = req.params;

    const result = await transportationRequestService.getById(id, userId, permLevel);
    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// PUT /api/transportation-requests/:id/approve
export const approve = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data   = ApproveTransportationRequestSchema.parse(req.body);
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await transportationRequestService.approve(id, userId, data);

    // Non-blocking: notify submitter
    sendTransportationRequestApproved(result.submitterEmail, result)
      .catch((err: unknown) => {
        logger.error('Failed to send transportation approval email', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// PUT /api/transportation-requests/:id/deny
export const deny = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data   = DenyTransportationRequestSchema.parse(req.body);
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await transportationRequestService.deny(id, userId, data);

    // Non-blocking: notify submitter
    sendTransportationRequestDenied(result.submitterEmail, result, data.denialReason)
      .catch((err: unknown) => {
        logger.error('Failed to send transportation denial email', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    res.json(result);
  } catch (error) {
    handleControllerError(error, res);
  }
};

// DELETE /api/transportation-requests/:id
export const remove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await transportationRequestService.delete(id, userId);
    res.status(204).send();
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

---

#### `backend/src/routes/transportationRequest.routes.ts`

```typescript
/**
 * Transportation Request Routes
 *
 * All routes require authentication via `authenticate`.
 * CSRF protection applied to all state-changing routes.
 * Permission levels use the TRANSPORTATION_REQUESTS module:
 *   Level 1 — All staff: create and view own requests
 *   Level 2 — Transportation Secretary: view all, approve, deny
 *
 * NOTE: ADMIN role bypasses all requireModule checks.
 */
import { Router }             from 'express';
import { authenticate }       from '../middleware/auth';
import { validateRequest }    from '../middleware/validation';
import { validateCsrfToken }  from '../middleware/csrf';
import { requireModule }      from '../utils/groupAuth';
import {
  CreateTransportationRequestSchema,
  ApproveTransportationRequestSchema,
  DenyTransportationRequestSchema,
  TransportationRequestIdParamSchema,
  ListTransportationRequestsQuerySchema,
} from '../validators/transportationRequest.validators';
import * as ctrl from '../controllers/transportationRequest.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CSRF protection for state-changing routes
router.use(validateCsrfToken);

// GET /api/transportation-requests — list (own for level 1; all for level 2+)
router.get(
  '/',
  validateRequest(ListTransportationRequestsQuerySchema, 'query'),
  requireModule('TRANSPORTATION_REQUESTS', 1),
  ctrl.list,
);

// POST /api/transportation-requests — create new request
router.post(
  '/',
  validateRequest(CreateTransportationRequestSchema, 'body'),
  requireModule('TRANSPORTATION_REQUESTS', 1),
  ctrl.create,
);

// GET /api/transportation-requests/:id — get single request
router.get(
  '/:id',
  validateRequest(TransportationRequestIdParamSchema, 'params'),
  requireModule('TRANSPORTATION_REQUESTS', 1),
  ctrl.getById,
);

// PUT /api/transportation-requests/:id/approve — secretary only
router.put(
  '/:id/approve',
  validateRequest(TransportationRequestIdParamSchema, 'params'),
  validateRequest(ApproveTransportationRequestSchema, 'body'),
  requireModule('TRANSPORTATION_REQUESTS', 2),
  ctrl.approve,
);

// PUT /api/transportation-requests/:id/deny — secretary only
router.put(
  '/:id/deny',
  validateRequest(TransportationRequestIdParamSchema, 'params'),
  validateRequest(DenyTransportationRequestSchema, 'body'),
  requireModule('TRANSPORTATION_REQUESTS', 2),
  ctrl.deny,
);

// DELETE /api/transportation-requests/:id — own PENDING requests only
router.delete(
  '/:id',
  validateRequest(TransportationRequestIdParamSchema, 'params'),
  requireModule('TRANSPORTATION_REQUESTS', 1),
  ctrl.remove,
);

export default router;
```

---

### Server Registration

In `backend/src/server.ts`, add two lines:

1. Import (after existing route imports):
```typescript
import transportationRequestRoutes from './routes/transportationRequest.routes';
```

2. Route registration (after the `fieldTripRoutes` line):
```typescript
app.use('/api/transportation-requests', transportationRequestRoutes);
```

---

### Email Functions to Add to `backend/src/services/email.service.ts`

Add three new exported functions at the end of the file, following the same pattern as `sendTransportationStep2SubmittedNotice`, `sendTransportationApproved`, `sendTransportationDenied`:

#### `sendTransportationRequestSubmitted`

```typescript
/**
 * Notify the Transportation Secretary group that a new standalone
 * transportation request has been submitted and needs review.
 */
export async function sendTransportationRequestSubmitted(
  emails: string[],
  request: {
    id:              string;
    school:          string;
    groupOrActivity: string;
    sponsorName:     string;
    tripDate:        Date | string;
    primaryDestinationName: string;
    busCount:        number;
    studentCount:    number;
  },
  submitterName: string,
): Promise<void> {
  if (emails.length === 0) return;

  const dateStr = new Date(request.tripDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await sendMail({
    to:      emails,
    subject: `Transportation Request Submitted: ${escapeHtml(request.groupOrActivity)} — ${dateStr}`,
    html: `
      <h2 style="color:#E65100;">New Transportation Request Awaiting Review</h2>
      <p><strong>${escapeHtml(submitterName)}</strong> has submitted a transportation request that needs your review.</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">School:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.school)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Group / Activity:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.groupOrActivity)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Sponsor:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.sponsorName)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Trip Date:</td>
            <td style="padding:4px 8px;">${dateStr}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Destination:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.primaryDestinationName)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Buses Requested:</td>
            <td style="padding:4px 8px;">${request.busCount}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Students:</td>
            <td style="padding:4px 8px;">${request.studentCount}</td></tr>
      </table>
      <p style="margin-top:24px;">
        <a href="${escapeHtml(process.env.APP_URL ?? '')}/transportation-requests/${escapeHtml(request.id)}"
           style="display:inline-block;padding:10px 20px;background-color:#E65100;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">
          Review Request
        </a>
      </p>
    `,
  });
}
```

#### `sendTransportationRequestApproved`

```typescript
/**
 * Notify the submitter their transportation request was approved.
 */
export async function sendTransportationRequestApproved(
  submitterEmail: string,
  request: {
    id:              string;
    school:          string;
    groupOrActivity: string;
    tripDate:        Date | string;
    primaryDestinationName: string;
    approvalComments?: string | null;
  },
): Promise<void> {
  const dateStr = new Date(request.tripDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await sendMail({
    to:      submitterEmail,
    subject: `Transportation Request Approved: ${request.groupOrActivity} — ${dateStr}`,
    html: `
      <h2 style="color:#2E7D32;">Your Transportation Request Has Been Approved</h2>
      <p>Your transportation request for <strong>${escapeHtml(request.groupOrActivity)}</strong> on ${dateStr} has been approved by the Transportation Secretary.</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">School:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.school)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Destination:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.primaryDestinationName)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Trip Date:</td>
            <td style="padding:4px 8px;">${dateStr}</td></tr>
      </table>
      ${request.approvalComments ? `
      <p style="margin-top:16px;"><strong>Notes from Transportation Secretary:</strong></p>
      <blockquote style="border-left:4px solid #2E7D32;margin:8px 0;padding:8px 16px;background:#E8F5E9;">
        ${escapeHtml(request.approvalComments)}
      </blockquote>` : ''}
      <p style="margin-top:24px;">Please ensure all transportation arrangements are confirmed before the trip date.</p>
    `,
  });
}
```

#### `sendTransportationRequestDenied`

```typescript
/**
 * Notify the submitter their transportation request was denied.
 */
export async function sendTransportationRequestDenied(
  submitterEmail: string,
  request: {
    id:              string;
    school:          string;
    groupOrActivity: string;
    tripDate:        Date | string;
    primaryDestinationName: string;
  },
  denialReason: string,
): Promise<void> {
  const dateStr = new Date(request.tripDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  await sendMail({
    to:      submitterEmail,
    subject: `Transportation Request Denied: ${request.groupOrActivity} — ${dateStr}`,
    html: `
      <h2 style="color:#C62828;">Your Transportation Request Has Been Denied</h2>
      <p>We regret to inform you that your transportation request for <strong>${escapeHtml(request.groupOrActivity)}</strong> has been denied.</p>
      <table style="border-collapse:collapse;width:100%;margin-top:16px;">
        <tr><td style="padding:4px 8px;font-weight:bold;">School:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.school)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Destination:</td>
            <td style="padding:4px 8px;">${escapeHtml(request.primaryDestinationName)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;">Trip Date:</td>
            <td style="padding:4px 8px;">${dateStr}</td></tr>
      </table>
      <p style="margin-top:16px;"><strong>Reason for denial:</strong></p>
      <blockquote style="border-left:4px solid #C62828;margin:8px 0;padding:8px 16px;background:#FFEBEE;">
        ${escapeHtml(denialReason)}
      </blockquote>
      <p style="margin-top:16px;">If you believe this decision was made in error, please contact the Transportation department directly.</p>
    `,
  });
}
```

---

## 7. Frontend Pages & Components

### Frontend Types: `frontend/src/types/transportationRequest.types.ts`

```typescript
// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type TransportationRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export const TRANSPORTATION_REQUEST_STATUS_LABELS: Record<TransportationRequestStatus, string> = {
  PENDING:  'Pending Review',
  APPROVED: 'Approved',
  DENIED:   'Denied',
};

export type StatusChipColor = 'warning' | 'success' | 'error' | 'default';

export const TRANSPORTATION_REQUEST_STATUS_COLORS: Record<TransportationRequestStatus, StatusChipColor> = {
  PENDING:  'warning',
  APPROVED: 'success',
  DENIED:   'error',
};

// ---------------------------------------------------------------------------
// Destination entry
// ---------------------------------------------------------------------------

export interface AdditionalDestination {
  name:    string;
  address: string;
}

// ---------------------------------------------------------------------------
// Main type (mirrors Prisma output with includes)
// ---------------------------------------------------------------------------

export interface TransportationRequest {
  id:            string;
  submittedById: string;
  submittedBy?: {
    id:          string;
    firstName:   string;
    lastName:    string;
    displayName: string | null;
    email:       string;
  };

  // Part A fields
  dateSubmitted:             string;
  school:                    string;
  groupOrActivity:           string;
  sponsorName:               string;
  chargedTo:                 string | null;
  tripDate:                  string;
  busCount:                  number;
  studentCount:              number;
  chaperoneCount:            number;
  needsDriver:               boolean;
  driverName:                string | null;
  loadingLocation:           string;
  loadingTime:               string;
  leavingSchoolTime:         string;
  arriveFirstDestTime:       string | null;
  leaveLastDestTime:         string | null;
  returnToSchoolTime:        string;
  primaryDestinationName:    string;
  primaryDestinationAddress: string;
  additionalDestinations:    AdditionalDestination[] | null;
  tripItinerary:             string | null;

  // Workflow
  status:          TransportationRequestStatus;
  approvalComments?: string | null;
  approvedById?:   string | null;
  approvedAt?:     string | null;
  approvedBy?: {
    id:          string;
    displayName: string | null;
    firstName:   string;
    lastName:    string;
  } | null;

  deniedById?:     string | null;
  deniedAt?:       string | null;
  denialReason?:   string | null;
  deniedBy?: {
    id:          string;
    displayName: string | null;
    firstName:   string;
    lastName:    string;
  } | null;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// DTOs for API calls
// ---------------------------------------------------------------------------

export interface CreateTransportationRequestDto {
  school:                    string;
  groupOrActivity:           string;
  sponsorName:               string;
  chargedTo?:                string | null;
  tripDate:                  string;
  busCount:                  number;
  studentCount:              number;
  chaperoneCount:            number;
  needsDriver:               boolean;
  driverName?:               string | null;
  loadingLocation:           string;
  loadingTime:               string;
  leavingSchoolTime:         string;
  arriveFirstDestTime?:      string | null;
  leaveLastDestTime?:        string | null;
  returnToSchoolTime:        string;
  primaryDestinationName:    string;
  primaryDestinationAddress: string;
  additionalDestinations?:   AdditionalDestination[] | null;
  tripItinerary?:            string | null;
}

export interface ApproveTransportationRequestDto {
  comments?: string | null;
}

export interface DenyTransportationRequestDto {
  denialReason: string;
}
```

---

### Frontend Service: `frontend/src/services/transportationRequest.service.ts`

```typescript
/**
 * Transportation Request Frontend Service
 *
 * All API calls for standalone transportation requests.
 * Authentication cookies and CSRF tokens handled by api.ts interceptors.
 */
import { api } from './api';
import type {
  TransportationRequest,
  CreateTransportationRequestDto,
  ApproveTransportationRequestDto,
  DenyTransportationRequestDto,
} from '../types/transportationRequest.types';

const BASE = '/transportation-requests';

export const transportationRequestService = {

  list: async (filters?: {
    status?: string;
    from?:   string;
    to?:     string;
  }): Promise<TransportationRequest[]> => {
    const res = await api.get<TransportationRequest[]>(BASE, { params: filters });
    return res.data;
  },

  getById: async (id: string): Promise<TransportationRequest> => {
    const res = await api.get<TransportationRequest>(`${BASE}/${id}`);
    return res.data;
  },

  create: async (data: CreateTransportationRequestDto): Promise<TransportationRequest> => {
    const res = await api.post<TransportationRequest>(BASE, data);
    return res.data;
  },

  approve: async (id: string, data: ApproveTransportationRequestDto): Promise<TransportationRequest> => {
    const res = await api.put<TransportationRequest>(`${BASE}/${id}/approve`, data);
    return res.data;
  },

  deny: async (id: string, data: DenyTransportationRequestDto): Promise<TransportationRequest> => {
    const res = await api.put<TransportationRequest>(`${BASE}/${id}/deny`, data);
    return res.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },
};
```

---

### Frontend Pages

Create a `TransportationRequests/` folder under `frontend/src/pages/`.

#### Page 1: `TransportationRequestsPage.tsx` — List View

**Features:**
- Table list of requests with columns: Trip Date, School, Group/Activity, Sponsor, Buses, Students, Status, Submitted
- Status `Chip` with color from `TRANSPORTATION_REQUEST_STATUS_COLORS`
- "New Request" button → navigates to `/transportation-requests/new`
- Row click → navigates to `/transportation-requests/:id`
- Secretary (permLevel 2+) sees all requests; staff sees only their own
- Filter controls: status dropdown, date range pickers
- TanStack Query key: `['transportation-requests', filters]`

**Pattern to follow:** `FieldTripListPage.tsx` exactly — same MUI Table + TableHead + TableBody + Chip + CircularProgress pattern.

#### Page 2: `TransportationRequestFormPage.tsx` — Create Form

**Features:**
- Multi-section MUI form matching the PDF "Request for Transportation"
- Sections (use MUI `Card` or `Paper` with `Typography` headers):
  - **Part A — Trip Information**
    - School (TextField)
    - Group or Activity (TextField)
    - Sponsor Name (TextField)
    - Charged/Billed To (TextField, optional)
    - Trip Date (DatePicker from MUI X)
    - Number of Buses (NumberField, min 1)
    - Number of Students (NumberField, min 1)
    - Number of Chaperones (NumberField, min 0)
    - Need a Driver? (Switch/Toggle: Yes = district driver needed, No = provide own)
    - If No: Driver Name (TextField, conditionally required)
  - **Part B — Logistics**
    - Loading Location (TextField)
    - Loading Time (TimePicker or TextField)
    - Leaving School Time (TimePicker or TextField)
    - Arrive at First Destination (TimePicker or TextField, optional)
    - Leave Last Destination (TimePicker or TextField, optional)
    - Return to School Time (TimePicker or TextField)
  - **Part C — Destinations**
    - Primary Destination Name (TextField)
    - Primary Destination Address (TextField)
    - Additional Destinations (dynamic list with Add/Remove buttons, each entry has Name + Address fields)
  - **Part D — Notes**
    - Trip Itinerary / Additional Notes (TextField multiline, optional)

- Form validation with react-hook-form + zod resolver (following project patterns)
- Submit button → calls `transportationRequestService.create(data)` → mutate with TanStack Query `useMutation`
- On success: navigate to `/transportation-requests` with success snackbar
- On error: display inline alert

**Time fields:** Use plain `TextField` with `placeholder="8:30 AM"` to avoid MUI X TimePicker license complexity (consistent with existing codebase — `FieldTripTransportationPage.tsx` uses plain time strings).

#### Page 3: `TransportationRequestDetailPage.tsx` — Detail + Approval

**Features:**
- Full detail view of all form fields (read-only for most users)
- Status badge at top
- For **Transportation Secretary** (permLevel 2+): show approval action card at bottom:
  - If `status === 'PENDING'`:
    - "Approve" button → opens approval dialog with optional comments field
    - "Deny" button → opens denial dialog with required reason TextField
  - If `status === 'APPROVED'` or `'DENIED'`: show outcome summary (who, when, what comments/reason)
- For **submitter** with `status === 'PENDING'`: show "Withdraw / Delete" button with confirmation dialog
- "Back to My Requests" / "Back to All Requests" navigation button
- Uses `useQuery` to fetch, `useMutation` for approve/deny/delete
- TanStack Query keys: `['transportation-requests', id]`

**Approval Dialog Pattern:**
```
MUI Dialog
  DialogTitle: "Approve Request"
  DialogContent:
    TextField (comments, optional, multiline, placeholder="Any notes or instructions...")
  DialogActions:
    Button "Cancel" → closes dialog
    Button "Confirm Approval" (variant="contained" color="success") → submits
```

**Denial Dialog Pattern:**
```
MUI Dialog
  DialogTitle: "Deny Request"
  DialogContent:
    Typography: "Reason is required and will be sent to the requester."
    TextField (denialReason, required, multiline, helperText="Minimum 10 characters")
  DialogActions:
    Button "Cancel" → closes dialog
    Button "Confirm Denial" (variant="contained" color="error") → submits
```

#### Index File: `frontend/src/pages/TransportationRequests/index.ts`

```typescript
export { TransportationRequestsPage }         from './TransportationRequestsPage';
export { TransportationRequestFormPage }      from './TransportationRequestFormPage';
export { TransportationRequestDetailPage }    from './TransportationRequestDetailPage';
```

---

## 8. Navigation Integration

### Sidebar Menu (`frontend/src/components/layout/AppLayout.tsx`)

In the `Operations` section of `NAV_SECTIONS`, add two items after "Field Trips":

```typescript
{ label: 'Transportation Requests', icon: '🚌', path: '/transportation-requests' },
{ label: 'Transport. Approvals',    icon: '✅', path: '/transportation-requests?status=PENDING' },
```

> **Note:** The approvals link uses a query param filter. The list page should read `?status=PENDING` from the URL on initial load. Alternatively, the second nav item can point to the list page which then filters. Make the second item visible only to secretaries by checking permLevel in `AppLayout`'s render logic (similar to how admin-only items are hidden).

### Routes (`frontend/src/App.tsx`)

Add imports at the top:
```typescript
import {
  TransportationRequestsPage,
  TransportationRequestFormPage,
  TransportationRequestDetailPage,
} from './pages/TransportationRequests';
```

Add routes after the existing field trip routes:
```tsx
<Route
  path="/transportation-requests"
  element={
    <ProtectedRoute>
      <AppLayout>
        <TransportationRequestsPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>
<Route
  path="/transportation-requests/new"
  element={
    <ProtectedRoute>
      <AppLayout>
        <TransportationRequestFormPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>
<Route
  path="/transportation-requests/:id"
  element={
    <ProtectedRoute>
      <AppLayout>
        <TransportationRequestDetailPage />
      </AppLayout>
    </ProtectedRoute>
  }
/>
```

---

## 9. Email Notifications

### Trigger Points

| Event | Recipient | Email Function |
|---|---|---|
| New request submitted | Transportation Secretary group (ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID) | `sendTransportationRequestSubmitted` |
| Request approved | Submitter (stored in `submitterEmail` field) | `sendTransportationRequestApproved` |
| Request denied | Submitter (stored in `submitterEmail` field) | `sendTransportationRequestDenied` |

### Implementation Notes

- All email sends are **non-blocking** — wrapped in `.then().catch()` off the main async flow
- The `submitterEmail` is captured at creation time (snapshot) to avoid stale lookups
- `fetchGroupEmails` already exists in `email.service.ts` and handles Microsoft Graph pagination
- The `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID` env var must be set for secretary notifications to fire

---

## 10. Security Considerations

### Authentication & Authorization
- All routes protected by `authenticate` middleware — validates JWT from httpOnly cookie or Bearer header
- `requireModule('TRANSPORTATION_REQUESTS', 1)` ensures minimum authenticated staff access
- `requireModule('TRANSPORTATION_REQUESTS', 2)` restricts approve/deny to Transportation Secretary group
- Service layer enforces ownership checks (`submittedById === userId`) for delete — belt-and-suspenders beyond middleware
- Secretary cannot delete requests (only approve/deny) — service enforces this by not exposing a secretary-delete route

### Input Validation
- All user input passes through Zod schemas before reaching service layer
- `driverName` conditional requirement enforced in Zod `.refine()`
- String length limits prevent overflow: all text fields capped (20–5000 chars depending on field)
- `tripDate` validated to be in the future in the service layer to prevent backdated requests
- `additionalDestinations` capped at 10 entries (Zod `.max(10)`)

### HTML Email Security
- All user-supplied strings passed through the existing `escapeHtml()` function in `email.service.ts` before embedding in HTML email bodies — prevents XSS via crafted field values

### CSRF Protection
- All state-changing routes (POST, PUT, DELETE) go through `validateCsrfToken` middleware (applied via `router.use(validateCsrfToken)`)

### Data Isolation
- Level 1 users cannot see others' requests — enforced both in the service `list()` query (`where.submittedById = userId`) and in `getById()` authorization check
- Denial reason stored in DB and returned only on the detail endpoint — not exposed in the list endpoint `include`

### OWASP Notes
- **A01 Broken Access Control**: Addressed via `requireModule` + service-layer ownership checks
- **A03 Injection**: Addresses via Prisma ORM (parameterized queries) + Zod input validation
- **A07 Identity and Authentication Failures**: Addressed via existing JWT + httpOnly cookie architecture

---

## 11. Complete File List

### Files to Create

| Path | Description |
|---|---|
| `backend/src/validators/transportationRequest.validators.ts` | Zod schemas for all endpoints |
| `backend/src/services/transportationRequest.service.ts` | Business logic, Prisma queries |
| `backend/src/controllers/transportationRequest.controller.ts` | HTTP handlers |
| `backend/src/routes/transportationRequest.routes.ts` | Express router |
| `frontend/src/types/transportationRequest.types.ts` | TypeScript interfaces + status maps |
| `frontend/src/services/transportationRequest.service.ts` | Axios API calls |
| `frontend/src/pages/TransportationRequests/TransportationRequestsPage.tsx` | List view |
| `frontend/src/pages/TransportationRequests/TransportationRequestFormPage.tsx` | Create form |
| `frontend/src/pages/TransportationRequests/TransportationRequestDetailPage.tsx` | Detail + approval |
| `frontend/src/pages/TransportationRequests/index.ts` | Barrel export |

### Files to Modify

| Path | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `TransportationRequest` model + User relations |
| `backend/src/server.ts` | Import and register `transportationRequest.routes.ts` |
| `backend/src/utils/groupAuth.ts` | Add `TRANSPORTATION_REQUESTS` to module type + GROUP_MODULE_MAP |
| `backend/src/services/email.service.ts` | Add 3 new email functions at end of file |
| `backend/.env` | Add `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID=d0232265-a91b-4cf7-9fdb-b7fdf1eaea30` |
| `frontend/src/App.tsx` | Import pages + add 3 new routes |
| `frontend/src/components/layout/AppLayout.tsx` | Add nav items to Operations section |

---

## 12. Step-by-Step Implementation Plan

> **Order matters:** Database schema must be applied before backend code; backend must be complete before frontend; `.env` changes apply immediately.

### Step 1 — Environment Variable
Add to `backend/.env`:
```
ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID=d0232265-a91b-4cf7-9fdb-b7fdf1eaea30
```

### Step 2 — Prisma Schema
1. Add `TransportationRequest` model to `schema.prisma`
2. Add the three User relation lines to the `User` model
3. Run migration:
   ```
   cd backend
   npx prisma migrate dev --name add_transportation_requests
   ```
4. Verify: `npx prisma generate` (should complete with no errors)

### Step 3 — Permission Module
Modify `backend/src/utils/groupAuth.ts`:
1. Extend `PermissionModuleType` union to include `'TRANSPORTATION_REQUESTS'`
2. Add `TRANSPORTATION_REQUESTS` entry to `GROUP_MODULE_MAP`

### Step 4 — Backend Validators
Create `backend/src/validators/transportationRequest.validators.ts`

### Step 5 — Backend Service
Create `backend/src/services/transportationRequest.service.ts`

### Step 6 — Backend Controller
Create `backend/src/controllers/transportationRequest.controller.ts`

### Step 7 — Backend Router
Create `backend/src/routes/transportationRequest.routes.ts`

### Step 8 — Email Functions
Append three new functions to `backend/src/services/email.service.ts`:
- `sendTransportationRequestSubmitted`
- `sendTransportationRequestApproved`
- `sendTransportationRequestDenied`

### Step 9 — Register Routes in Server
Modify `backend/src/server.ts`:
- Add import for `transportationRequestRoutes`
- Add `app.use('/api/transportation-requests', transportationRequestRoutes)`

### Step 10 — Build & Verify Backend
```
cd backend && npm run build
```
Confirm zero TypeScript compilation errors.

### Step 11 — Frontend Types
Create `frontend/src/types/transportationRequest.types.ts`

### Step 12 — Frontend Service
Create `frontend/src/services/transportationRequest.service.ts`

### Step 13 — Frontend Pages
Create all files in `frontend/src/pages/TransportationRequests/`:
1. `TransportationRequestsPage.tsx` (list)
2. `TransportationRequestFormPage.tsx` (create form)
3. `TransportationRequestDetailPage.tsx` (detail + approvals)
4. `index.ts` (barrel export)

### Step 14 — App.tsx Routes
Modify `frontend/src/App.tsx`:
- Import the three new pages
- Add three route entries

### Step 15 — Navigation
Modify `frontend/src/components/layout/AppLayout.tsx`:
- Add "Transportation Requests" and "Transport. Approvals" to `Operations` nav section

### Step 16 — Build & Verify Frontend
```
cd frontend && npm run build
```
Confirm zero TypeScript compilation errors.

---

## Appendix: Key Design Decisions

| Decision | Rationale |
|---|---|
| Standalone model (not tied to FieldTripRequest) | The PDF form is for any group transportation, not just field trips. Field trip transportation sub-form already exists separately. |
| No DRAFT status | The form goes directly to PENDING on submit (same pattern as Work Orders). Simpler UX for a simple approval workflow. |
| Single approver group (Transportation Secretary) | Per the spec: `ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID` is the ONLY approver. |
| `submitterEmail` snapshot | Prevents stale lookups after user email changes — same pattern as `FieldTripRequest.submitterEmail`. |
| String status field (not Prisma enum) | All existing models use string status columns. Consistent with codebase convention. |
| Time fields as strings | Consistent with `FieldTripTransportationRequest.loadingTime` (VarChar 20, e.g. "8:30 AM"). Avoids database timezone complications. |
| `additionalDestinations` as JSON | Variable-length array of objects — same pattern as `FieldTripTransportationRequest.additionalDestinations`. |
| New `TRANSPORTATION_REQUESTS` module | Clean separation from `FIELD_TRIPS` module; allows independent permission assignment in future. |
