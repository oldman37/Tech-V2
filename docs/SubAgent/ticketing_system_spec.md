# Unified Ticketing System — Comprehensive Specification

**Project:** Tech-V2 — Unified Ticket System  
**Prepared By:** Research Subagent  
**Date:** April 21, 2026  
**Status:** DRAFT — Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Research Sources](#2-research-sources)
3. [Current State Analysis — Legacy Systems](#3-current-state-analysis--legacy-systems)
4. [Unified Data Model (Prisma)](#4-unified-data-model-prisma)
5. [Backend Architecture](#5-backend-architecture)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Workflow & Routing Logic](#7-workflow--routing-logic)
8. [Status State Machine](#8-status-state-machine)
9. [Security Considerations](#9-security-considerations)
10. [Implementation Steps](#10-implementation-steps)
11. [Dependencies](#11-dependencies)

---

## 1. Executive Summary

### What the Unified System Does

Tech-V2 currently has two separate legacy ticketing workflows running in the PHP `wwwroot` system:

- **Maintenance Tickets** (`newMaintOrder.php` / `updateMaintOrder.php`) — used by facilities/maintenance staff to track physical plant issues (plumbing, HVAC, building repairs). Captures equipment MFG/model/serial.
- **Technology Tickets** (`newTechOrder.php` / `updateTechOrder.php`) — used by technology department staff to track device support requests. Links to the asset inventory via equipment tag number.

Both systems share nearly identical data structures, workflows, permission level patterns, and views. The unified **Ticket** system replaces both with a single model distinguished by a `department` enum field.

### Department Selection

When a user creates a new ticket:

1. User lands on `/tickets/new`
2. A `ToggleButtonGroup` (MUI) presents **"Technology"** and **"Maintenance"** as department options
3. Selecting a department dynamically reveals department-specific fields:
   - **Technology**: Asset tag selector (equipment in that room from inventory)
   - **Maintenance**: Manufacturer, Model, Serial number (free-text, optional)
4. Both branches share: location, room, issue category, description, and priority

### How Routing Works

- On creation, ticket is tagged with `department: TECHNOLOGY | MAINTENANCE`
- Backend routes to the appropriate staff queue automatically
- Technology staff (TICKETS module level ≥ 3) see Technology tickets in their queue
- Maintenance staff (TICKETS module level ≥ 3 with MAINTENANCE department scope) see Maintenance tickets
- Supervisors (level 4) can see all tickets for their assigned office locations
- Admins (level 5+) see everything

---

## 2. Research Sources

The following sources informed the architecture and best practices for this specification:

1. **ITIL v4 Service Management Framework** — Incident Management lifecycle, priority matrix, status state machine canonical reference. `https://www.axelos.com/certifications/itil-service-management/itil-4-foundation`

2. **Atlassian Jira Software Documentation — Issue Workflow Design** — Best practices for ticket status transitions, role-based workflow permissions, and multi-department routing queues. `https://support.atlassian.com/jira-software-cloud/docs/use-workflow-triggers/`

3. **Help Scout — Ticketing System Design Patterns (2024)** — Unified inbox with department tagging, team-based routing, ticket assignment to individual vs. group. `https://www.helpscout.com/blog/help-desk-software/`

4. **Material UI (MUI) — Data Grid & Form Components Best Practices** — DataGrid v7 for ticket list, `ToggleButtonGroup` for department selection, `Chip` for status indicators, `Stepper` for workflow state. `https://mui.com/x/react-data-grid/`

5. **TanStack Query v5 — Optimistic Updates & Cache Invalidation** — Pattern for ticket status mutation with optimistic UI update and rollback on failure; matching existing Tech-V2 query patterns. `https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates`

6. **Prisma ORM — Enum Types and Self-Relations** — Using `enum` for status/department/priority fields; `@@index` strategy for high-frequency filter queries; single-table inheritance pattern. `https://www.prisma.io/docs/orm/prisma-schema/data-model/models#defining-enums`

7. **OWASP — Broken Access Control (A01:2021)** — Server-side authorization on every route; never trust client-supplied role or permission values; CSRF validation on all mutation endpoints. `https://owasp.org/Top10/A01_2021-Broken_Access_Control/`

8. **Zod Documentation — Schema Validation Best Practices** — Composing shared schema fragments across department-specific schemas using `.merge()`, `.extend()`, and discriminated unions. `https://zod.dev/`

---

## 3. Current State Analysis — Legacy Systems

### 3.1 Legacy Maintenance Ticket System

#### Database Tables (Year-Scoped)

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `morder{YYYY}` | `morder_id`, `morder_status`, `morder_school`, `morder_room`, `morder_user`, `morder_mfg`, `morder_model`, `morder_serial`, `morder_type` | One table per school year |
| `mwork{YYYY}` | `mwork_order` (FK), `mwork_date`, `mwork_user`, `mwork_info` | Append-only work log |
| `mtype` | `mtype_type` | Lookup table for issue categories |

#### Form Fields at Creation

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| school | hidden | Yes | Passed via GET param |
| room | hidden | Yes | Passed via GET param |
| user | hidden | Yes | Session user (maintLevel=3) or GET param |
| mfg | text | No | Manufacturer — shown only to non-Level-3 users |
| model | text | No | Equipment model |
| serial | text | No | Serial number |
| type | select | Yes | From `mtype` table |
| info | textarea | Yes | Problem description |

#### Ticket Statuses

| Status | Description |
|--------|-------------|
| `open` | Default on creation |
| `closed` | Set by maintenance staff when work is complete |

No intermediate states (in-progress, on-hold) exist in the legacy system.

#### Permission Levels (`$_SESSION['maintLevel']`)

| Level | Name | Access |
|-------|------|--------|
| 1 | Admin/Summary | `viewMaintSummary` — county-wide open ticket count by school (blocks: level > 1) |
| 2 | School Level | `viewMaintSchool` — all open tickets for a school; create tickets and choose user (blocks: level > 2) |
| 3 | Maintenance Staff | `viewMaintRoom`, `updateMaintOrder`, `newMaintOrder` — update tickets, close tickets (blocks: level > 3) |

#### Workflow Summary

```
User submits via roomSearchSchoolMaint.php
  → school + room selected
  → newMaintOrder.php (GET) — shows form
  → newMaintOrder.php (POST) — inserts into morder + mwork
  → viewMaintSchool.php — school-level queue view
  → updateMaintOrder.php — staff add work entries, can close
  → viewMaintSummary.php — supervisor summary by school
  → viewMaintCounty.php — county-wide all-schools view
```

#### Notification Behavior

None detected in legacy files. No email/notification system in the legacy maintenance ticket workflow.

---

### 3.2 Legacy Technology Ticket System

#### Database Tables (Year-Scoped)

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `torder{YYYY}` | `torder_id`, `torder_status`, `torder_school`, `torder_room`, `torder_user`, `torder_tag`, `torder_type` | One table per school year |
| `twork{YYYY}` | `twork_order` (FK), `twork_date`, `twork_user`, `twork_info` | Append-only work log |
| `ttype` | `ttype_type` | Lookup table for issue categories |

#### Form Fields at Creation

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| school | hidden | Yes | Passed via GET param |
| room | hidden | Yes | Passed via GET param |
| user | hidden | Yes | Session user (techLevel=3) or GET param |
| tag | radio | No | Equipment asset tag — selected from inventory list shown for that room |
| type | select | Yes | From `ttype` table |
| info | textarea | Yes | Problem description |

The technology ticket form displays a **DataTable of all active, non-disposed equipment** registered in the room. The user selects the device by radio button.

#### Ticket Statuses

| Status | Description |
|--------|-------------|
| `open` | Default on creation |
| `closed` | Set by tech staff when work is complete |

#### Permission Levels (`$_SESSION['techLevel']`)

| Level | Name | Access |
|-------|------|--------|
| 1 | Admin/Summary | `viewTechSummary` — county-wide open ticket count by school |
| 2 | School Level | `viewTechSchool`, `viewTechSchoolOld`, `viewTechSchoolAll` — school view, all statuses |
| 3 | Tech Staff | `viewTechRoom`, `viewTechRoomAll`, `updateTechOrder` — update tickets, close tickets |

#### Workflow Summary

```
User submits via roomSearchSchoolTech.php
  → school + room selected
  → newTechOrder.php (GET) — shows equipment list + form
  → newTechOrder.php (POST) — inserts into torder + twork
  → viewTechSchool.php — school-level queue view
  → updateTechOrder.php — staff add work entries, can close
  → viewTechSummary.php — supervisor summary by school
  → viewTechCounty.php — county-wide all-schools view
```

#### Notification Behavior

None detected in legacy files.

---

### 3.3 System Comparison

| Aspect | Maintenance | Technology | Unified Handling |
|--------|-------------|------------|-----------------|
| School/Location | `morder_school` | `torder_school` | `officeLocationId` → `OfficeLocation` relation |
| Room | `morder_room` | `torder_room` | `roomId` → `Room` relation |
| Reporter/User | `morder_user` | `torder_user` | `reportedById` → `User` relation |
| Equipment ref | MFG + model + serial (free text) | Asset tag (FK to inventory) | Both: `equipmentTag` (nullable) + `equipmentMfg`/`model`/`serial` (nullable) |
| Category/Type | `mtype` table | `ttype` table | Unified `TicketCategory` enum per department |
| Status | open/closed | open/closed | Expanded: OPEN → IN_PROGRESS → ON_HOLD → RESOLVED → CLOSED |
| Work log | `mwork*` (append-only) | `twork*` (append-only) | `TicketComment` model |
| Year scoping | Separate table per year | Separate table per year | `fiscalYear` field on `Ticket` model (same pattern as POs) |
| Permission levels | maintLevel 1–3 | techLevel 1–3 | TICKETS module levels 1–5 |
| County/Summary view | `viewMaintSummary`, `viewMaintCounty` | `viewTechSummary`, `viewTechCounty` | Single `/tickets` page with department filter |
| School view | `viewMaintSchool` | `viewTechSchool` | Location filter on `/tickets` |
| Room view | `viewMaintRoom` | `viewTechRoom` | Room filter on `/tickets` |

#### What Is Identical (Unified Without Branching)

- Location + Room selection flow
- Reporter identity
- Issue description (text area)
- Work log / comment thread
- Open/closed status lifecycle (extended in v2)
- Per-school, per-county aggregate views
- Permission level hierarchy

#### What Differs (Requires Department Branching)

- **Technology only**: Asset tag link to equipment inventory
- **Maintenance only**: Manufacturer, model, serial number free-text fields
- Category lists differ per department (though same mechanism — will be an enum with department-scoped values)

---

## 4. Unified Data Model (Prisma)

The following additions to `schema.prisma` replace the legacy `maintenance_orders` model (which had no real-world usage and was a placeholder) with a production-ready `Ticket` model. The old `maintenance_orders` model should be removed or aliased.

### 4.1 New Enums

```prisma
enum TicketDepartment {
  TECHNOLOGY
  MAINTENANCE
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  ON_HOLD
  RESOLVED
  CLOSED
}

enum TicketPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum TechTicketCategory {
  HARDWARE_FAILURE
  SOFTWARE_ISSUE
  NETWORK_CONNECTIVITY
  PRINTING
  PROJECTOR_DISPLAY
  CHROMEBOOK
  DEVICE_SETUP
  PASSWORD_RESET
  ACCOUNT_ACCESS
  OTHER
}

enum MaintTicketCategory {
  PLUMBING
  ELECTRICAL
  HVAC_HEATING
  HVAC_COOLING
  CARPENTRY
  PAINTING
  FLOORING
  PEST_CONTROL
  CLEANING
  DOOR_LOCK
  WINDOW
  ROOF
  GROUNDS
  OTHER
}
```

### 4.2 Ticket Model

```prisma
model Ticket {
  id               String             @id @default(uuid())
  ticketNumber     String             @unique // Auto-generated: TECH-2026-0001 or MAINT-2026-0001
  department       TicketDepartment
  status           TicketStatus       @default(OPEN)
  priority         TicketPriority     @default(MEDIUM)
  fiscalYear       String             // e.g. "2025-2026"

  // Core relations
  reportedById     String
  reportedBy       User               @relation("TicketReporter", fields: [reportedById], references: [id])

  assignedToId     String?
  assignedTo       User?              @relation("TicketAssignee", fields: [assignedToId], references: [id])

  officeLocationId String?
  officeLocation   OfficeLocation?    @relation(fields: [officeLocationId], references: [id])

  roomId           String?
  room             Room?              @relation(fields: [roomId], references: [id])

  // Issue description
  title            String             // Short summary (required)
  description      String             // Full problem description (required)

  // Category — stored as String to accommodate both departments
  // Values from TechTicketCategory or MaintTicketCategory enum — enforced in service layer
  category         String?

  // Technology-specific fields (nullable, only populated for TECHNOLOGY dept)
  equipmentId      String?            // FK to equipment table (asset tag link)
  equipment        equipment?         @relation("TicketEquipment", fields: [equipmentId], references: [id])

  // Maintenance-specific fields (nullable, only populated for MAINTENANCE dept)
  equipmentMfg     String?            // Manufacturer (free text)
  equipmentModel   String?            // Model (free text)
  equipmentSerial  String?            // Serial number (free text)

  // Timestamps
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  resolvedAt       DateTime?
  closedAt         DateTime?

  // Relations
  comments         TicketComment[]
  statusHistory    TicketStatusHistory[]

  @@index([department])
  @@index([status])
  @@index([priority])
  @@index([reportedById])
  @@index([assignedToId])
  @@index([officeLocationId])
  @@index([roomId])
  @@index([fiscalYear])
  @@index([department, status])
  @@index([officeLocationId, department, status])
  @@map("tickets")
}

model TicketComment {
  id         String   @id @default(uuid())
  ticketId   String
  authorId   String
  body       String
  isInternal Boolean  @default(false) // Internal notes visible only to staff
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  ticket     Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author     User     @relation("TicketCommentAuthor", fields: [authorId], references: [id])

  @@index([ticketId])
  @@index([authorId])
  @@map("ticket_comments")
}

model TicketStatusHistory {
  id         String       @id @default(uuid())
  ticketId   String
  fromStatus TicketStatus?
  toStatus   TicketStatus
  changedById String
  changedAt  DateTime     @default(now())
  notes      String?

  ticket     Ticket       @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  changedBy  User         @relation("TicketStatusChangedBy", fields: [changedById], references: [id])

  @@index([ticketId])
  @@index([changedAt])
  @@map("ticket_status_history")
}
```

### 4.3 User Model Additions

The following relations must be added to the `User` model in `schema.prisma`:

```prisma
  // Tickets
  reportedTickets       Ticket[]         @relation("TicketReporter")
  assignedTickets       Ticket[]         @relation("TicketAssignee")
  ticketComments        TicketComment[]  @relation("TicketCommentAuthor")
  ticketStatusHistory   TicketStatusHistory[] @relation("TicketStatusChangedBy")
```

### 4.4 Equipment Model Addition

Add to `equipment` model:

```prisma
  tickets             Ticket[]         @relation("TicketEquipment")
```

### 4.5 Room & OfficeLocation Model Additions

Add to `Room` model:

```prisma
  tickets             Ticket[]
```

Add to `OfficeLocation` model:

```prisma
  tickets             Ticket[]
```

### 4.6 Ticket Number Generation

Ticket numbers are auto-generated in the service layer using the pattern:

- Technology: `TECH-{YYYY}-{NNNN}` (e.g., `TECH-2026-0042`)
- Maintenance: `MAINT-{YYYY}-{NNNN}` (e.g., `MAINT-2026-0017`)

Where `NNNN` is a zero-padded sequential count per department per fiscal year.

---

## 5. Backend Architecture

### 5.1 File Structure

```
backend/src/
  routes/
    tickets.routes.ts          # NEW
  controllers/
    tickets.controller.ts      # NEW
  services/
    tickets.service.ts         # NEW
  validators/
    tickets.validators.ts      # NEW
```

### 5.2 Permission Module

A new `TICKETS` permission module is added to the existing `PermissionModule` type in `permissions.ts`.

| Level | Name | Scope |
|-------|------|-------|
| 1 | **Viewer** | View own submitted tickets only |
| 2 | **General User** | Create tickets + view own tickets |
| 3 | **Tech/Maint Staff** | View all tickets for their department at their location(s); update status; add comments |
| 4 | **Supervisor** | View all tickets for their department across all assigned office locations; assign tickets; close tickets |
| 5 | **Admin** | Full CRUD on all tickets, all departments, all locations |

**Note:** The `ADMIN` application role bypasses all module checks (existing behavior). For the `TICKETS` module, the seed script must add `TICKETS` as a valid module and create default permission records.

### 5.3 Routes

**File:** `backend/src/routes/tickets.routes.ts`

```
GET    /api/tickets                    → getTickets         (TICKETS ≥ 1)
POST   /api/tickets                    → createTicket        (TICKETS ≥ 2)
GET    /api/tickets/:id                → getTicket           (TICKETS ≥ 1)
PUT    /api/tickets/:id                → updateTicket        (TICKETS ≥ 3)
DELETE /api/tickets/:id                → deleteTicket        (TICKETS = 5 or ADMIN)
POST   /api/tickets/:id/comments       → addComment          (TICKETS ≥ 2)
PUT    /api/tickets/:id/status         → updateStatus        (TICKETS ≥ 3)
PUT    /api/tickets/:id/assign         → assignTicket        (TICKETS ≥ 4)
GET    /api/tickets/stats/summary      → getTicketSummary    (TICKETS ≥ 4)
```

All routes:
- Require `authenticate` middleware
- Require `validateCsrfToken` on mutating routes (POST/PUT/DELETE)
- Use `requireModule('TICKETS', minLevel)` for permission gating

### 5.4 Validators (`tickets.validators.ts`)

```typescript
// Key schemas:

export const TicketDepartmentEnum = z.enum(['TECHNOLOGY', 'MAINTENANCE']);
export const TicketStatusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED']);
export const TicketPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const CreateTicketSchema = z.object({
  department:       TicketDepartmentEnum,
  priority:         TicketPriorityEnum.default('MEDIUM'),
  officeLocationId: z.string().uuid().optional(),
  roomId:           z.string().uuid().optional(),
  title:            z.string().min(3).max(200),
  description:      z.string().min(10).max(5000),
  category:         z.string().max(100).optional(),
  // Technology-specific
  equipmentId:      z.string().uuid().optional().nullable(),
  // Maintenance-specific
  equipmentMfg:     z.string().max(200).optional().nullable(),
  equipmentModel:   z.string().max(200).optional().nullable(),
  equipmentSerial:  z.string().max(200).optional().nullable(),
}).superRefine((data, ctx) => {
  // Cross-field validation: tech tickets should have equipmentId if available
  // Maintenance fields should only appear on MAINTENANCE tickets
  if (data.department === 'TECHNOLOGY' && (data.equipmentMfg || data.equipmentModel || data.equipmentSerial)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Maintenance fields not valid for Technology tickets', path: ['equipmentMfg'] });
  }
  if (data.department === 'MAINTENANCE' && data.equipmentId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Equipment ID not valid for Maintenance tickets', path: ['equipmentId'] });
  }
});

export const UpdateTicketSchema = z.object({
  title:            z.string().min(3).max(200).optional(),
  description:      z.string().min(10).max(5000).optional(),
  priority:         TicketPriorityEnum.optional(),
  category:         z.string().max(100).optional().nullable(),
  equipmentId:      z.string().uuid().optional().nullable(),
  equipmentMfg:     z.string().max(200).optional().nullable(),
  equipmentModel:   z.string().max(200).optional().nullable(),
  equipmentSerial:  z.string().max(200).optional().nullable(),
  roomId:           z.string().uuid().optional().nullable(),
  officeLocationId: z.string().uuid().optional().nullable(),
});

export const UpdateStatusSchema = z.object({
  status: TicketStatusEnum,
  notes:  z.string().max(1000).optional(),
});

export const AssignTicketSchema = z.object({
  assignedToId: z.string().uuid().nullable(),
});

export const AddCommentSchema = z.object({
  body:       z.string().min(1).max(5000),
  isInternal: z.boolean().default(false),
});

export const TicketQuerySchema = z.object({
  page:             z.preprocess(v => v ?? '1', z.string().regex(/^\d+$/).transform(Number).refine(v => v > 0)).optional(),
  limit:            z.preprocess(v => v ?? '25', z.string().regex(/^\d+$/).transform(Number).refine(v => v > 0 && v <= 200)).optional(),
  department:       TicketDepartmentEnum.optional(),
  status:           TicketStatusEnum.optional(),
  priority:         TicketPriorityEnum.optional(),
  officeLocationId: z.string().uuid().optional(),
  roomId:           z.string().uuid().optional(),
  assignedToId:     z.string().uuid().optional(),
  reportedById:     z.string().uuid().optional(),
  fiscalYear:       z.string().optional(),
  search:           z.string().max(200).optional(),
});
```

### 5.5 Service Layer (`tickets.service.ts`)

Key service methods:

```typescript
class TicketService {
  getTickets(query, userId, permLevel, userDepartment?): Promise<PaginatedResult<Ticket>>
  // - permLevel 1–2: own tickets only (WHERE reportedById = userId)
  // - permLevel 3: own location(s) + own department (WHERE officeLocationId IN userLocations AND department = userDept)
  // - permLevel 4: all locations for user's supervisor scope + department
  // - permLevel 5 (ADMIN): all tickets

  getTicket(id, userId, permLevel): Promise<Ticket>
  // - Includes: comments (sorted ASC), statusHistory (sorted ASC), reportedBy, assignedTo, room, officeLocation, equipment

  createTicket(data, userId): Promise<Ticket>
  // - Auto-generates ticketNumber (query MAX for dept+year, increment)
  // - Sets fiscalYear from schoolYear utility (same as POs)
  // - Creates initial TicketStatusHistory entry (null → OPEN)
  // - Returns full ticket with relations

  updateTicket(id, data, userId, permLevel): Promise<Ticket>
  // - permLevel 3+ required
  // - Logs field changes to statusHistory if status changes

  updateStatus(id, status, notes, userId, permLevel): Promise<Ticket>
  // - Validates transition per state machine (see §8)
  // - Creates TicketStatusHistory record
  // - Sets resolvedAt/closedAt timestamps on terminal states

  assignTicket(id, assignedToId, userId, permLevel): Promise<Ticket>
  // - permLevel 4+ required
  // - Adds comment noting assignment

  addComment(ticketId, data, userId, permLevel): Promise<TicketComment>
  // - isInternal=true comments only visible to permLevel 3+

  deleteTicket(id, userId, permLevel): Promise<void>
  // - ADMIN only (permLevel 5)
  // - Cascade deletes comments + status history

  getTicketSummary(officeLocationId?, department?, fiscalYear?): Promise<Summary>
  // - Returns: open count, in_progress count, on_hold count, resolved count, closed count
  // - Grouped optionally by officeLocation
}
```

### 5.6 Controller (`tickets.controller.ts`)

Follows exact `purchaseOrder.controller.ts` pattern:
- Singleton `TicketService` instance
- Each handler: try/catch → `handleControllerError`
- Reads `req.user.id` and `req.user.permLevel`
- Parses validated body via Zod schema (already parsed by `validateRequest` middleware)

### 5.7 Server.ts Registration

Add to `backend/src/server.ts`:

```typescript
import ticketRoutes from './routes/tickets.routes';
// ...
app.use('/api/tickets', ticketRoutes);
```

---

## 6. Frontend Architecture

### 6.1 File Structure

```
frontend/src/
  pages/
    Tickets/
      TicketList.tsx            # /tickets — unified list
      NewTicket.tsx             # /tickets/new
      TicketDetail.tsx          # /tickets/:id
  components/
    tickets/
      TicketForm.tsx            # Shared form (adapts by department)
      TicketCard.tsx            # Compact card for list
      TicketStatusChip.tsx      # MUI Chip with color-coded status
      TicketPriorityChip.tsx    # MUI Chip with color-coded priority
      TicketCommentThread.tsx   # Chronological comment/work-log list
      TicketStatusStepper.tsx   # MUI Stepper showing current state in workflow
      DepartmentToggle.tsx      # TECHNOLOGY / MAINTENANCE toggle
  services/
    tickets.service.ts          # API calls (matches pattern of purchaseOrder.service.ts)
  hooks/
    queries/
      useTickets.ts             # useTicketList(), useTicket(), useTicketSummary()
    mutations/
      useTicketMutations.ts     # useCreateTicket(), useUpdateTicket(), useUpdateStatus(), etc.
  types/
    ticket.types.ts             # TypeScript types (matches shared/src/types/ticket.types.ts)
```

### 6.2 React Router Registration

Add to `App.tsx`:

```tsx
<Route path="/tickets" element={<ProtectedRoute module="TICKETS" minLevel={1}><TicketList /></ProtectedRoute>} />
<Route path="/tickets/new" element={<ProtectedRoute module="TICKETS" minLevel={2}><NewTicket /></ProtectedRoute>} />
<Route path="/tickets/:id" element={<ProtectedRoute module="TICKETS" minLevel={1}><TicketDetail /></ProtectedRoute>} />
```

### 6.3 Page: `/tickets` — TicketList

**Component:** `pages/Tickets/TicketList.tsx`

Features:
- MUI `DataGrid` (same pattern as `InventoryManagement.tsx`) showing tickets
- Filter toolbar: Department toggle (ALL / TECHNOLOGY / MAINTENANCE), Status multiselect, Priority multiselect, Location select, Search text
- Columns: `ticketNumber`, `department` (chip), `status` (TicketStatusChip), `priority` (TicketPriorityChip), `title`, `reportedBy.displayName`, `officeLocation.name`, `room.name`, `createdAt`, `assignedTo.displayName`
- Clicking a row navigates to `/tickets/:id`
- "New Ticket" button → `/tickets/new`
- Permission-scoped: level 1 sees only own; level 3 sees location; level 4+ sees all (enforced on backend; frontend shows what the API returns)
- Summary stats bar at top (open count, in-progress count)

### 6.4 Page: `/tickets/new` — NewTicket

**Component:** `pages/Tickets/NewTicket.tsx`

```tsx
// Step 1: Department Selection (prominent, top of form)
<DepartmentToggle value={department} onChange={setDepartment} />

// Step 2: Location + Room (shared)
<LocationSelect /> → <RoomSelect locationId={locationId} />

// Step 3: Issue Details (shared)
<TextField label="Title" />           // Short summary
<CategorySelect department={department} />  // List changes based on department
<PrioritySelect />
<TextField label="Description" multiline rows={4} />

// Step 4: Equipment (conditional)
{department === 'TECHNOLOGY' && (
  <EquipmentSelect roomId={roomId} />   // Radio table of equipment in room (from /api/equipment?roomId=)
)}
{department === 'MAINTENANCE' && (
  <>
    <TextField label="Manufacturer" />
    <TextField label="Model" />
    <TextField label="Serial Number" />
  </>
)}

// Submit button
```

Uses `useCreateTicket()` mutation, navigates to `/tickets/:id` on success.

### 6.5 Page: `/tickets/:id` — TicketDetail

**Component:** `pages/Tickets/TicketDetail.tsx`

Layout (two-column on desktop, single on mobile):

**Left Column (main content):**
- Ticket header: `ticketNumber`, `title`, department badge, status chip, priority chip
- Original description
- `TicketCommentThread` — scrollable list of comments (work log entries) in chronological order
- Add Comment form at bottom (level 2+ users; `isInternal` checkbox for level 3+)

**Right Column (metadata sidebar):**
- Reporter, assignee, location, room
- Equipment info (tech: tag + equipment card; maintenance: MFG/model/serial)
- Created date, updated date, age in days
- `TicketStatusStepper` — horizontal MUI Stepper showing OPEN → IN_PROGRESS → ON_HOLD → RESOLVED → CLOSED with current step highlighted
- Status change buttons (level 3+): "Mark In Progress", "Put On Hold", "Resolve", "Close"
- Assign button (level 4+)
- Edit button (level 3+) → opens same `TicketForm` in edit mode

### 6.6 Component: `TicketStatusChip`

```tsx
const STATUS_COLOR_MAP: Record<TicketStatus, ChipProps['color']> = {
  OPEN:        'warning',
  IN_PROGRESS: 'info',
  ON_HOLD:     'default',
  RESOLVED:    'success',
  CLOSED:      'default',
};

export const TicketStatusChip = ({ status }: { status: TicketStatus }) => (
  <Chip label={status.replace('_', ' ')} color={STATUS_COLOR_MAP[status]} size="small" />
);
```

### 6.7 Component: `DepartmentToggle`

```tsx
<ToggleButtonGroup
  exclusive
  value={department}
  onChange={(_, val) => val && onChange(val)}
>
  <ToggleButton value="TECHNOLOGY">
    <ComputerIcon /> Technology
  </ToggleButton>
  <ToggleButton value="MAINTENANCE">
    <BuildIcon /> Maintenance
  </ToggleButton>
</ToggleButtonGroup>
```

### 6.8 Service: `tickets.service.ts`

Follows exact pattern of `purchaseOrder.service.ts`:

```typescript
export const ticketsService = {
  getTickets: (params: TicketQuery) => apiClient.get('/tickets', { params }),
  getTicket: (id: string) => apiClient.get(`/tickets/${id}`),
  createTicket: (data: CreateTicketDto) => apiClient.post('/tickets', data),
  updateTicket: (id: string, data: UpdateTicketDto) => apiClient.put(`/tickets/${id}`, data),
  updateStatus: (id: string, status: TicketStatus, notes?: string) =>
    apiClient.put(`/tickets/${id}/status`, { status, notes }),
  assignTicket: (id: string, assignedToId: string | null) =>
    apiClient.put(`/tickets/${id}/assign`, { assignedToId }),
  addComment: (id: string, data: AddCommentDto) =>
    apiClient.post(`/tickets/${id}/comments`, data),
  deleteTicket: (id: string) => apiClient.delete(`/tickets/${id}`),
  getTicketSummary: (params?: SummaryParams) =>
    apiClient.get('/tickets/stats/summary', { params }),
};
```

### 6.9 TanStack Query Hooks

**`useTickets.ts`:**
```typescript
export const useTicketList = (params: TicketQuery) =>
  useQuery({
    queryKey: ['tickets', params],
    queryFn: () => ticketsService.getTickets(params),
    placeholderData: keepPreviousData,
  });

export const useTicket = (id: string) =>
  useQuery({
    queryKey: ['tickets', id],
    queryFn: () => ticketsService.getTicket(id),
    enabled: !!id,
  });
```

**`useTicketMutations.ts`:**
```typescript
export const useCreateTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ticketsService.createTicket,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });
};

export const useUpdateStatus = (ticketId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ status, notes }: { status: TicketStatus; notes?: string }) =>
      ticketsService.updateStatus(ticketId, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
};
```

---

## 7. Workflow & Routing Logic

### 7.1 Ticket Creation Flow

```
User navigates to /tickets/new
  │
  ├── Selects department: TECHNOLOGY or MAINTENANCE
  │
  ├── Selects Office Location (from user's assigned locations or all for level 4+)
  │
  ├── Selects Room (filtered by selected location, from GET /api/rooms?locationId=X)
  │
  ├── [TECHNOLOGY branch]
  │   └── Equipment selector loads GET /api/equipment?roomId=Y&status=active&isDisposed=false
  │       User selects radio button for device (or skips if none)
  │
  ├── [MAINTENANCE branch]
  │   └── Optional: Manufacturer, Model, Serial text fields
  │
  ├── Fills: Title, Category (department-specific), Priority, Description
  │
  └── Submits → POST /api/tickets
                  → ticket.department = selected department
                  → ticket.officeLocationId = selected location
                  → ticket.roomId = selected room
                  → ticket.reportedById = req.user.id
                  → ticket.status = OPEN
                  → ticket.fiscalYear = current fiscal year
                  → Returns created ticket, navigate to /tickets/:id
```

### 7.2 Department Routing to Staff Queues

The "routing" in v2 is achieved through filtered views at `/tickets`, not separate pages. Staff see only what they have permission and department scope for.

| Staff Type | Default View at /tickets |
|-----------|--------------------------|
| General User (level 2) | Own submitted tickets, all departments |
| Tech Staff (level 3, TECHNOLOGY) | All open TECHNOLOGY tickets at their location(s) |
| Maint Staff (level 3, MAINTENANCE) | All open MAINTENANCE tickets at their location(s) |
| Supervisor (level 4) | All tickets (both departments) at their supervised locations |
| Admin (level 5) | All tickets, all departments, all locations |

**Implementation note:** The service layer uses `req.user.permLevel` and queries user's `LocationSupervisor` records to determine location scope for levels 3 and 4. The user's department affiliation is determined by their Entra group membership (stored in `User.department`).

### 7.3 Assignment

- On creation, tickets are **unassigned** (go to the department's general queue)
- Level 4 (supervisor) and level 5 (admin) can assign tickets to specific users via the `PUT /api/tickets/:id/assign` endpoint
- When assigned, a comment is automatically added to the thread: `"Ticket assigned to [name] by [assigner]"`
- Re-assignment is allowed any time by level 4+

---

## 8. Status State Machine

### 8.1 Valid Transitions

```
                    ┌─────────┐
                    │  OPEN   │◄──────────────────────┐
                    └────┬────┘                       │
                         │ (staff takes it)           │
                         ▼                            │ (reopen)
                  ┌─────────────┐                     │
                  │ IN_PROGRESS │──────────────────────┘
                  └──────┬──────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
              ▼          ▼          ▼
          ┌───────┐  ┌──────────┐  ┌──────────┐
          │ON_HOLD│  │ RESOLVED │  │  CLOSED  │
          └───┬───┘  └────┬─────┘  └──────────┘
              │           │ (confirm/archive)
              │           ▼
              │       ┌──────────┐
              └──────►│  CLOSED  │
                      └──────────┘
```

### 8.2 Transition Rules

| From | To | Who Can Transition | Notes |
|------|----|--------------------|-------|
| `OPEN` | `IN_PROGRESS` | Level 3+ (staff) | Staff starts work |
| `OPEN` | `CLOSED` | Level 4+ (supervisor) | Duplicate or cancelled tickets |
| `IN_PROGRESS` | `ON_HOLD` | Level 3+ | Waiting for parts/info |
| `IN_PROGRESS` | `RESOLVED` | Level 3+ | Work complete, pending confirmation |
| `IN_PROGRESS` | `CLOSED` | Level 4+ | Force-close |
| `ON_HOLD` | `IN_PROGRESS` | Level 3+ | Resuming work |
| `ON_HOLD` | `CLOSED` | Level 4+ | Cancelled while on hold |
| `RESOLVED` | `CLOSED` | Level 3+ or reporter | Final closure after resolution confirmed |
| `RESOLVED` | `IN_PROGRESS` | Level 3+ | Reopened — issue recurred |
| `CLOSED` | (none) | — | Terminal state; cannot reopen |

### 8.3 Timestamp Behavior

| Status Reached | Timestamp Set |
|---------------|---------------|
| `RESOLVED` | `resolvedAt = now()` |
| `CLOSED` | `closedAt = now()` |

Both are cleared (set to null) if the ticket moves back from RESOLVED to IN_PROGRESS (reopen).

---

## 9. Security Considerations

### 9.1 Authentication & Authorization

- All `/api/tickets/*` routes require `authenticate` middleware (JWT validation)
- All mutating routes (POST/PUT/DELETE) require `validateCsrfToken`
- `requireModule('TICKETS', minLevel)` applied per-route
- Backend enforces row-level visibility: own-only for level 1–2, location-scoped for level 3, supervisor-scoped for level 4
- Frontend guards are UX-only; **all** enforcement is server-side

### 9.2 Input Validation (Zod)

- All request bodies and query strings validated via Zod schemas before reaching controller
- `validateRequest` middleware throws 400 with field-level error detail on schema failure
- Max lengths enforced: title 200, description 5000, comments 5000
- UUID format validated for all ID fields
- Enum values enforced for status, priority, department

### 9.3 Injection Prevention

- All database queries use Prisma ORM — no raw SQL; no SQL injection vectors
- No legacy `mysql_query()` string concatenation patterns
- `isInternal` field can only be set to `true` by users with permLevel ≥ 3 (enforced in service layer)

### 9.4 Information Disclosure

- Internal comments (`isInternal: true`) are filtered out from API responses for users with permLevel < 3
- Ticket detail endpoint checks user has access to the specific ticket before returning (not just "any ticket")
- Error messages do not expose stack traces in production (`NODE_ENV !== 'development'`)

### 9.5 OWASP A01 — Broken Access Control

- `getTickets` filters in the WHERE clause using userId and permLevel — never trusts query params to expand scope beyond what permission allows
- Users cannot escalate by passing `assignedToId` of an admin user
- `deleteTicket` restricted to ADMIN role only

---

## 10. Implementation Steps

### Step 1: Prisma Schema Changes + Migration *(~2 hours)*

**Files to modify:** `backend/prisma/schema.prisma`

1. Remove/deprecate old `maintenance_orders` model (rename table in schema to avoid conflict — add `@map("maintenance_orders_legacy")` or drop if empty)
2. Add enums: `TicketDepartment`, `TicketStatus`, `TicketPriority`, `TechTicketCategory`, `MaintTicketCategory`
3. Add models: `Ticket`, `TicketComment`, `TicketStatusHistory`
4. Add relations to `User`, `equipment`, `Room`, `OfficeLocation` models
5. Run: `npx prisma migrate dev --name add-unified-tickets`
6. Update `backend/prisma/seed.ts` to add `TICKETS` permission module seeds

**Seed additions:**
```typescript
// Add to permissionModules seeding block:
{ module: 'TICKETS', level: 1, name: 'Viewer', description: 'View own tickets' },
{ module: 'TICKETS', level: 2, name: 'General User', description: 'Create and view own tickets' },
{ module: 'TICKETS', level: 3, name: 'Staff', description: 'View and update location tickets' },
{ module: 'TICKETS', level: 4, name: 'Supervisor', description: 'Full ticket management for supervised locations' },
{ module: 'TICKETS', level: 5, name: 'Admin', description: 'Full ticket admin' },
```

### Step 2: Shared Types in `/shared` *(~30 min)*

**File:** `shared/src/types/ticket.types.ts`

```typescript
export type TicketDepartment = 'TECHNOLOGY' | 'MAINTENANCE';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TicketSummary {
  id: string;
  ticketNumber: string;
  department: TicketDepartment;
  status: TicketStatus;
  priority: TicketPriority;
  title: string;
  reportedBy: { id: string; displayName: string; };
  assignedTo: { id: string; displayName: string; } | null;
  officeLocation: { id: string; name: string; } | null;
  room: { id: string; name: string; } | null;
  createdAt: string;
  updatedAt: string;
  fiscalYear: string;
  _count?: { comments: number; };
}

export interface TicketDetail extends TicketSummary {
  description: string;
  category: string | null;
  // Technology
  equipmentId: string | null;
  equipment: { id: string; assetTag: string; name: string; } | null;
  // Maintenance
  equipmentMfg: string | null;
  equipmentModel: string | null;
  equipmentSerial: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  comments: TicketComment[];
  statusHistory: TicketStatusHistory[];
}

export interface TicketComment {
  id: string;
  ticketId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author: { id: string; displayName: string; };
}

export interface TicketStatusHistory {
  id: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedAt: string;
  notes: string | null;
  changedBy: { id: string; displayName: string; };
}

export interface CreateTicketDto {
  department: TicketDepartment;
  priority?: TicketPriority;
  officeLocationId?: string;
  roomId?: string;
  title: string;
  description: string;
  category?: string;
  equipmentId?: string | null;
  equipmentMfg?: string | null;
  equipmentModel?: string | null;
  equipmentSerial?: string | null;
}

export interface UpdateTicketDto extends Partial<Omit<CreateTicketDto, 'department'>> {}

export interface TicketQuery {
  page?: number;
  limit?: number;
  department?: TicketDepartment;
  status?: TicketStatus;
  priority?: TicketPriority;
  officeLocationId?: string;
  roomId?: string;
  assignedToId?: string;
  reportedById?: string;
  fiscalYear?: string;
  search?: string;
}
```

### Step 3: Backend — Validators, Service, Controller, Routes *(~3–4 hours)*

**Order:**
1. `backend/src/validators/tickets.validators.ts`
2. `backend/src/services/tickets.service.ts`
3. `backend/src/controllers/tickets.controller.ts`
4. `backend/src/routes/tickets.routes.ts`
5. Register in `backend/src/server.ts`
6. Add `'TICKETS'` to `PermissionModule` union type in `backend/src/types/` or `backend/src/middleware/permissions.ts`

### Step 4: Frontend — Services, Hooks, Pages, Components *(~4–6 hours)*

**Order:**
1. `frontend/src/types/ticket.types.ts` (copy/re-export from shared)
2. `frontend/src/services/tickets.service.ts`
3. `frontend/src/hooks/queries/useTickets.ts`
4. `frontend/src/hooks/mutations/useTicketMutations.ts`
5. `frontend/src/components/tickets/TicketStatusChip.tsx`
6. `frontend/src/components/tickets/TicketPriorityChip.tsx`
7. `frontend/src/components/tickets/DepartmentToggle.tsx`
8. `frontend/src/components/tickets/TicketCommentThread.tsx`
9. `frontend/src/components/tickets/TicketStatusStepper.tsx`
10. `frontend/src/components/tickets/TicketForm.tsx`
11. `frontend/src/pages/Tickets/TicketList.tsx`
12. `frontend/src/pages/Tickets/NewTicket.tsx`
13. `frontend/src/pages/Tickets/TicketDetail.tsx`
14. Register routes in `frontend/src/App.tsx`
15. Add "Tickets" nav link to `AppLayout.tsx`

---

## 11. Dependencies

No new npm packages required. All implementation uses existing stack:

| Requirement | Existing Package |
|------------|-----------------|
| HTTP validation | `zod` (already installed) |
| ORM | `@prisma/client` (already installed) |
| Authentication | `authenticate` middleware (already exists) |
| CSRF | `validateCsrfToken` middleware (already exists) |
| Permission checks | `requireModule` utility (already exists) |
| API client | `axios` via `api.ts` (already installed) |
| Data fetching | `@tanstack/react-query` (already installed) |
| UI components | `@mui/material`, `@mui/x-data-grid` (already installed) |
| Routing | `react-router-dom` v7 (already installed) |
| Icons | `@mui/icons-material` (already installed) |

---

## Appendix A: Legacy Permission Level Mapping

| Legacy Level | Legacy Name | Tech-V2 TICKETS Level |
|-------------|-------------|----------------------|
| maintLevel 1 / techLevel 1 | Summary/Admin view | Level 4 (Supervisor) |
| maintLevel 2 / techLevel 2 | School level view + create | Level 3 (Staff) |
| maintLevel 3 / techLevel 3 | Update + close tickets | Level 3 (Staff) |
| — | — | Level 2 (General User — create own tickets) |
| — | — | Level 1 (Viewer — read own tickets) |
| — | — | Level 5 (Admin — full control) |

Note: Legacy had no concept of a general user creating their own ticket — school-level staff always created tickets on behalf of users. In Tech-V2, any authenticated user with level 2 can submit their own ticket.

---

## Appendix B: Category Reference

### Technology Categories (TechTicketCategory)

| Value | Display Label |
|-------|--------------|
| HARDWARE_FAILURE | Hardware Failure |
| SOFTWARE_ISSUE | Software Issue |
| NETWORK_CONNECTIVITY | Network / Connectivity |
| PRINTING | Printing |
| PROJECTOR_DISPLAY | Projector / Display |
| CHROMEBOOK | Chromebook |
| DEVICE_SETUP | Device Setup / New Device |
| PASSWORD_RESET | Password Reset |
| ACCOUNT_ACCESS | Account / Login Access |
| OTHER | Other |

### Maintenance Categories (MaintTicketCategory)

| Value | Display Label |
|-------|--------------|
| PLUMBING | Plumbing |
| ELECTRICAL | Electrical |
| HVAC_HEATING | HVAC — Heating |
| HVAC_COOLING | HVAC — Cooling / A/C |
| CARPENTRY | Carpentry / Woodwork |
| PAINTING | Painting |
| FLOORING | Flooring |
| PEST_CONTROL | Pest Control |
| CLEANING | Cleaning / Sanitation |
| DOOR_LOCK | Door / Lock |
| WINDOW | Window |
| ROOF | Roof |
| GROUNDS | Grounds / Outdoor |
| OTHER | Other |

---

*End of Specification*
