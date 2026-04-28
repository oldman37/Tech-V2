# Help Desk Ticketing System — Comprehensive Implementation Specification

**System:** Tech-V2 (Tech Department Management System)  
**Created:** March 13, 2026  
**Sprint:** C-3 (Tickets & Maintenance)  
**Priority:** 🔴 CRITICAL — Blocks go-live

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Proposed Data Model](#2-proposed-data-model)
3. [Backend Architecture](#3-backend-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Ticket Categories](#5-ticket-categories)
6. [Workflow & Lifecycle](#6-workflow--lifecycle)
7. [Permissions & Roles](#7-permissions--roles)
8. [Security Considerations](#8-security-considerations)
9. [Implementation Phases](#9-implementation-phases)
10. [File Structure](#10-file-structure)

---

## 1. Current State Analysis

### 1.1 Legacy Technology Ticket Workflow

**Files:** `newTechOrder.php`, `updateTechOrder.php`, `viewTechOrder.php`, `viewTechSchool.php`, `viewTechSummary.php`, `viewTechCounty.php`, `roomSearchSchoolTech.php`

**Database Tables (year-scoped):**
- `torder{YEAR}` — ticket header (one row per ticket)
- `twork{YEAR}` — work log entries (many rows per ticket)
- `ttype` — lookup table for tech ticket categories

**`torder` Schema:**
| Column | Type | Purpose |
|--------|------|---------|
| `torder_id` | INT AUTO_INCREMENT | Ticket number (displayed to users) |
| `torder_status` | VARCHAR | `"open"` or `"closed"` |
| `torder_school` | VARCHAR | School name (string, not FK) |
| `torder_room` | VARCHAR | Room name (string, not FK) |
| `torder_user` | VARCHAR | Username of ticket creator |
| `torder_tag` | VARCHAR | Asset tag of affected equipment (nullable) |
| `torder_type` | VARCHAR | Category from `ttype` table |

**`twork` Schema:**
| Column | Type | Purpose |
|--------|------|---------|
| `twork_order` | INT | FK to `torder.torder_id` |
| `twork_date` | DATETIME | Timestamp of work entry |
| `twork_user` | VARCHAR | Username of technician adding the entry |
| `twork_info` | TEXT | Description of work performed |

**Ticket Creation Flow:**
1. User navigates through `roomSearchSchoolTech.php` to select school → room
2. School and room are passed as GET parameters to `newTechOrder.php`
3. Page displays equipment in the selected room (from `equip` table) for optional asset tag selection
4. User selects a request type from `ttype` dropdown and enters a free-text description
5. On submit: inserts into `torder{YEAR}` (status = `"open"`) and `twork{YEAR}` (initial description)
6. Confirmation displays the assigned ticket number

**Permission Levels (session-based):**
| `techLevel` | Access |
|-------------|--------|
| 1 | County-wide summary view + county all-tickets view |
| 2 | School-level view; can select any user's rooms to create tickets |
| 3 | Own rooms only; can create and view own tickets |

**View Pages Hierarchy:**
```
viewTechSummary.php  (Level ≤ 1) — County summary: total orders, open count, per-school breakdown
  └── viewTechSchool.php  (Level ≤ 2) — School view: open tickets for one school
        └── updateTechOrder.php  (Level ≤ 3) — Ticket detail: work log + add update + close
viewTechCounty.php  (Level ≤ 1) — County view: all open tickets across all schools with Days Old column
```

**Update Workflow:**
- Technician adds a work log entry (free-text)
- Can change asset tag to a different piece of equipment in the room
- Can change status from `"open"` to `"closed"` (only transition)
- No assignment mechanism — tickets are visible to all technicians at the appropriate level

---

### 1.2 Legacy Maintenance Ticket Workflow

**Files:** `newMaintOrder.php`, `updateMaintOrder.php`, `viewMaintOrder.php`, `viewMaintSchool.php`, `viewMaintSummary.php`, `viewMaintCounty.php`, `roomSearchSchoolMaint.php`

**Database Tables (year-scoped):**
- `morder{YEAR}` — ticket header
- `mwork{YEAR}` — work log entries
- `mtype` — lookup table for maintenance categories

**`morder` Schema:**
| Column | Type | Purpose |
|--------|------|---------|
| `morder_id` | INT AUTO_INCREMENT | Ticket number |
| `morder_status` | VARCHAR | `"open"` or `"closed"` |
| `morder_school` | VARCHAR | School name |
| `morder_room` | VARCHAR | Room name |
| `morder_user` | VARCHAR | Username of creator |
| `morder_mfg` | VARCHAR | Manufacturer of affected item (nullable) |
| `morder_model` | VARCHAR | Model of affected item (nullable) |
| `morder_serial` | VARCHAR | Serial number of affected item (nullable) |
| `morder_type` | VARCHAR | Category from `mtype` table |

**`mwork` Schema:**
| Column | Type | Purpose |
|--------|------|---------|
| `mwork_order` | INT | FK to `morder.morder_id` |
| `mwork_date` | DATETIME | Timestamp of work entry |
| `mwork_user` | VARCHAR | Username of staff adding the entry |
| `mwork_info` | TEXT | Description of work performed |

**Ticket Creation Flow:**
1. User navigates through `roomSearchSchoolMaint.php` to select school → room
2. School and room are passed as GET parameters to `newMaintOrder.php`
3. Level 2+ users see additional fields: Manufacturer, Model, Serial Number
4. User selects request type from `mtype` dropdown and enters a description
5. On submit: inserts into `morder{YEAR}` (status = `"open"`) and `mwork{YEAR}` (initial description)

**Permission Levels (session-based):**
| `maintLevel` | Access |
|--------------|--------|
| 1 | County-wide summary + county all-tickets view |
| 2 | School-level view; can select user, can enter mfg/model/serial |
| 3 | Own rooms only; simplified form (no mfg/model/serial fields) |

**Update Workflow:**
- Staff adds a work log entry
- Can change manufacturer, model, serial number
- Can change status from `"open"` to `"closed"`
- Same view hierarchy as tech tickets (Summary → School → Detail)

---

### 1.3 Comparison — Technology vs. Maintenance

| Aspect | Technology Tickets | Maintenance Tickets |
|--------|-------------------|---------------------|
| **DB tables** | `torder`, `twork`, `ttype` | `morder`, `mwork`, `mtype` |
| **Statuses** | `open`, `closed` | `open`, `closed` |
| **Equipment link** | Asset tag from equipment table | Manual mfg/model/serial |
| **Room selection** | Same pattern | Same pattern |
| **Category table** | `ttype` (dynamic) | `mtype` (dynamic) |
| **Work log** | Identical structure | Identical structure |
| **Permission var** | `techLevel` (1-3) | `maintLevel` (1-3) |
| **View hierarchy** | Summary → School → Detail | Summary → School → Detail |
| **Year scoping** | Tables suffixed with year | Tables suffixed with year |

**Key Commonalities:**
- Identical two-status lifecycle (`open` → `closed`)
- Same work-log pattern (timestamped entries by any authorized user)
- Same room-based creation flow (select school → room → create ticket)
- Same three-tier viewing hierarchy (county → school → individual)
- Same permission level structure (3 levels)
- No formal assignment, priority, or SLA tracking
- No notification system
- Tables are year-scoped (e.g., `torder2025`, `morder2025`)

**Key Differences:**
- Tech tickets link to equipment via asset tag; maintenance tickets use free-text mfg/model/serial
- Maintenance has three extra nullable fields (mfg, model, serial)
- Separate permission session variables (`techLevel` vs `maintLevel`)
- Separate category tables (`ttype` vs `mtype`)

### 1.4 What Must Be Preserved

1. **All data concepts**: ticket number, status, school/room, creator, type/category, work log with timestamps and user attribution
2. **Room-based creation flow**: users pick a location + room, then fill in ticket details
3. **Three-tier viewing**: county/district summary → location detail → individual ticket
4. **Work log pattern**: append-only timestamped entries visible as history
5. **Equipment linking**: tech tickets should reference equipment items from inventory
6. **Separate categories**: tech and maintenance categories remain distinct
7. **Permission separation**: TECHNOLOGY and MAINTENANCE permission modules already exist

---

## 2. Proposed Data Model

### 2.1 Design Decision: Unified Ticket Model

The legacy system uses completely separate tables for tech and maintenance orders. The new system will use a **single unified `Ticket` model** with a `department` discriminator, following the pattern established by `purchase_orders` where one model handles the full lifecycle.

**Rationale:**
- The two ticket types share 90%+ identical structure
- A unified model enables a single dashboard, unified search, and consistent API surface
- Department-specific fields are handled via nullable columns (same pattern as `purchase_orders.accountCode`)
- The existing `maintenance_orders` model in the schema will be replaced

### 2.2 New Prisma Schema Models

#### `Ticket` — Primary ticket record (replaces `maintenance_orders`)

```prisma
model Ticket {
  id                String          @id @default(uuid())
  ticketNumber      String          @unique          // Auto-generated: "TK-00001"
  department        String                           // "TECHNOLOGY" | "MAINTENANCE"
  category          String                           // FK-like: category name from TicketCategory
  status            String          @default("open") // open, in_progress, closed
  priority          String          @default("medium") // low, medium, high, urgent
  title             String                           // Short summary
  description       String                           // Detailed description (initial work log)
  
  // Location context
  officeLocationId  String
  roomId            String?
  
  // Equipment link (tech tickets)
  equipmentId       String?                          // FK to equipment (for TECHNOLOGY tickets)
  
  // Maintenance-specific fields
  manufacturer      String?                          // mfg for MAINTENANCE tickets
  modelName         String?                          // model for MAINTENANCE tickets
  serialNumber      String?                          // serial for MAINTENANCE tickets
  
  // Users
  createdById       String                           // User who created the ticket
  assignedToId      String?                          // User assigned to work the ticket
  
  // Timestamps
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  closedAt          DateTime?                        // When status changed to "closed"
  
  // Relations
  officeLocation    OfficeLocation  @relation(fields: [officeLocationId], references: [id])
  room              Room?           @relation("TicketRoom", fields: [roomId], references: [id])
  equipment         equipment?      @relation("TicketEquipment", fields: [equipmentId], references: [id])
  createdBy         User            @relation("TicketCreatedBy", fields: [createdById], references: [id])
  assignedTo        User?           @relation("TicketAssignedTo", fields: [assignedToId], references: [id])
  comments          TicketComment[]
  
  @@index([department])
  @@index([status])
  @@index([priority])
  @@index([officeLocationId])
  @@index([createdById])
  @@index([assignedToId])
  @@index([department, status])
  @@index([officeLocationId, status])
  @@map("tickets")
}
```

#### `TicketComment` — Work log entries (replaces `twork`/`mwork`)

```prisma
model TicketComment {
  id           String   @id @default(uuid())
  ticketId     String
  userId       String
  content      String                             // Work log text
  isInternal   Boolean  @default(false)           // Visible only to staff, not ticket creator
  isStatusChange Boolean @default(false)          // System-generated entry for status transitions
  createdAt    DateTime @default(now())
  
  ticket       Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  user         User     @relation("TicketCommentUser", fields: [userId], references: [id])
  
  @@index([ticketId])
  @@index([userId])
  @@index([createdAt])
  @@map("ticket_comments")
}
```

#### `TicketCategory` — Replaces `ttype`/`mtype` lookup tables

```prisma
model TicketCategory {
  id          String   @id @default(uuid())
  department  String                              // "TECHNOLOGY" | "MAINTENANCE"
  name        String                              // Category display name
  description String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([department, name])
  @@index([department, isActive])
  @@map("ticket_categories")
}
```

### 2.3 Enums (TypeScript Union Types)

```typescript
// Department discriminator
export type TicketDepartment = 'TECHNOLOGY' | 'MAINTENANCE';

// Ticket statuses (expanded from legacy open/closed)
export type TicketStatus = 'open' | 'in_progress' | 'closed';

// Priority levels (new — legacy had none)
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
```

### 2.4 Updates to Existing Models

#### `User` model — Add new back-relations
```prisma
// Add to User model
ticketsCreated         Ticket[]         @relation("TicketCreatedBy")
ticketsAssigned        Ticket[]         @relation("TicketAssignedTo")
ticketComments         TicketComment[]  @relation("TicketCommentUser")
```

#### `Room` model — Add ticket relation
```prisma
// Add to Room model
tickets    Ticket[]  @relation("TicketRoom")
```

#### `equipment` model — Add ticket relation
```prisma
// Add to equipment model
tickets    Ticket[]  @relation("TicketEquipment")
```

#### `SystemSettings` model — Add ticket numbering
```prisma
// Add to SystemSettings
nextTicketNumber    Int     @default(1)
ticketNumberPrefix  String  @default("TK")
```

### 2.5 Migration Strategy

1. Create new `tickets`, `ticket_comments`, and `ticket_categories` tables via Prisma migration
2. Add new relation fields and `SystemSettings` fields
3. The existing `maintenance_orders` model will be **retained but deprecated** — no new data will be written to it
4. Seed `ticket_categories` with initial categories (see Section 5)
5. Migration name: `add_helpdesk_ticketing_system`

**Important:** The legacy `maintenance_orders` model uses the old `locations` FK (not `OfficeLocation`). The new `Ticket` model uses `OfficeLocation` and `Room` properly, which aligns with the modern schema.

---

## 3. Backend Architecture

### 3.1 API Endpoints

All endpoints are prefixed with `/api/tickets`.

| Method | Path | Description | Auth | Permission |
|--------|------|-------------|------|------------|
| `POST` | `/api/tickets` | Create a new ticket | JWT + CSRF | TECHNOLOGY:1 or MAINTENANCE:1 |
| `GET` | `/api/tickets` | List tickets (filtered, paginated) | JWT | TECHNOLOGY:1 or MAINTENANCE:1 |
| `GET` | `/api/tickets/:id` | Get ticket detail with comments | JWT | TECHNOLOGY:1 or MAINTENANCE:1 |
| `PUT` | `/api/tickets/:id` | Update ticket fields | JWT + CSRF | TECHNOLOGY:2+ or MAINTENANCE:2+ |
| `POST` | `/api/tickets/:id/comments` | Add work log comment | JWT + CSRF | TECHNOLOGY:1 or MAINTENANCE:1 |
| `PATCH` | `/api/tickets/:id/status` | Change ticket status | JWT + CSRF | TECHNOLOGY:2+ or MAINTENANCE:2+ |
| `PATCH` | `/api/tickets/:id/assign` | Assign/reassign ticket | JWT + CSRF | TECHNOLOGY:2+ or MAINTENANCE:2+ |
| `GET` | `/api/tickets/summary` | District-wide summary stats | JWT | TECHNOLOGY:1 or MAINTENANCE:1 |
| `GET` | `/api/tickets/summary/:locationId` | Per-location ticket summary | JWT | TECHNOLOGY:1 or MAINTENANCE:1 |
| `GET` | `/api/ticket-categories` | List categories by department | JWT | Any authenticated |
| `POST` | `/api/ticket-categories` | Create category | JWT + CSRF | TECHNOLOGY:3 or MAINTENANCE:3 |
| `PUT` | `/api/ticket-categories/:id` | Update category | JWT + CSRF | TECHNOLOGY:3 or MAINTENANCE:3 |
| `DELETE` | `/api/ticket-categories/:id` | Soft-delete (deactivate) category | JWT + CSRF | TECHNOLOGY:3 or MAINTENANCE:3 |

#### Query Parameters for `GET /api/tickets`

| Parameter | Type | Description |
|-----------|------|-------------|
| `department` | `string` | Filter by `TECHNOLOGY` or `MAINTENANCE` |
| `status` | `string` | Filter by status (`open`, `in_progress`, `closed`) |
| `priority` | `string` | Filter by priority |
| `officeLocationId` | `string` | Filter by location |
| `assignedToId` | `string` | Filter by assigned user |
| `createdById` | `string` | Filter by creator |
| `search` | `string` | Search in title, description, ticketNumber |
| `dateFrom` | `string` | Created after (ISO date) |
| `dateTo` | `string` | Created before (ISO date) |
| `page` | `number` | Page number (default: 1) |
| `limit` | `number` | Items per page (default: 25, max: 100) |
| `sortBy` | `string` | Sort field (default: `createdAt`) |
| `sortOrder` | `string` | `asc` or `desc` (default: `desc`) |

### 3.2 Controller Structure

**File:** `src/controllers/ticket.controller.ts`

```typescript
export class TicketController {
  // POST /api/tickets
  static async createTicket(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
  
  // GET /api/tickets
  static async listTickets(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
  
  // GET /api/tickets/summary
  static async getTicketSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
  
  // GET /api/tickets/summary/:locationId
  static async getLocationTicketSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
  
  // GET /api/tickets/:id
  static async getTicketDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
  
  // PUT /api/tickets/:id
  static async updateTicket(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
  
  // PATCH /api/tickets/:id/status
  static async updateTicketStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
  
  // PATCH /api/tickets/:id/assign
  static async assignTicket(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
  
  // POST /api/tickets/:id/comments
  static async addComment(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
}
```

**Row-level scoping logic (in controller):**
- `permLevel === 1` (General User): see only own tickets
- `permLevel === 2` (School-level): see tickets for own assigned location(s)
- `permLevel >= 3` (Department): see all tickets in the department

### 3.3 Service Layer Design

**File:** `src/services/ticket.service.ts`

```typescript
export class TicketService {
  // Ticket CRUD
  static async createTicket(data: CreateTicketInput, userId: string): Promise<Ticket>;
  static async listTickets(filters: TicketFilters, userId: string, permLevel: number): Promise<PaginatedResult<Ticket>>;
  static async getTicketById(id: string): Promise<TicketWithComments | null>;
  static async updateTicket(id: string, data: UpdateTicketInput): Promise<Ticket>;
  
  // Status management
  static async updateStatus(id: string, status: TicketStatus, userId: string, notes?: string): Promise<Ticket>;
  
  // Assignment
  static async assignTicket(id: string, assignedToId: string | null, userId: string): Promise<Ticket>;
  
  // Comments / work log
  static async addComment(ticketId: string, userId: string, content: string, isInternal?: boolean): Promise<TicketComment>;
  
  // Summary/stats
  static async getDistrictSummary(department?: TicketDepartment): Promise<TicketSummary>;
  static async getLocationSummary(locationId: string, department?: TicketDepartment): Promise<LocationTicketSummary>;
  
  // Ticket number generation
  static async generateTicketNumber(): Promise<string>;
  
  // Category CRUD
  static async listCategories(department?: TicketDepartment): Promise<TicketCategory[]>;
  static async createCategory(data: CreateCategoryInput): Promise<TicketCategory>;
  static async updateCategory(id: string, data: UpdateCategoryInput): Promise<TicketCategory>;
  static async deactivateCategory(id: string): Promise<TicketCategory>;
}
```

**Ticket number generation** follows the same pattern as `purchase_orders`:
```typescript
// Inside a transaction with SystemSettings
const settings = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
const ticketNumber = `${settings.ticketNumberPrefix}-${String(settings.nextTicketNumber).padStart(5, '0')}`;
await prisma.systemSettings.update({
  where: { id: 'singleton' },
  data: { nextTicketNumber: { increment: 1 } },
});
```

### 3.4 Middleware Requirements

Each route in `ticket.routes.ts` uses the standard middleware chain:

```typescript
// Read routes
router.get('/tickets', authenticate, checkTicketPermission(1), TicketController.listTickets);

// Write routes
router.post('/tickets', authenticate, validateCsrfToken, validateRequest(createTicketSchema), checkTicketPermission(1), TicketController.createTicket);

router.patch('/tickets/:id/status', authenticate, validateCsrfToken, validateRequest(updateStatusSchema, 'body'), checkTicketPermission(2), TicketController.updateTicketStatus);
```

**Department-aware permission check:**

Since a ticket can be either TECHNOLOGY or MAINTENANCE, the middleware must check the appropriate module:

```typescript
/**
 * Custom middleware: checks TECHNOLOGY OR MAINTENANCE permission.
 * For creation requests, reads `department` from the request body.
 * For existing ticket operations, reads `department` from the ticket record.
 */
function checkTicketPermission(requiredLevel: PermissionLevel) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user!.id;
    const userRole = req.user!.roles?.[0] || 'USER';
    
    // ADMIN bypass
    if (userRole === 'ADMIN') {
      req.user!.permLevel = 6;
      return next();
    }
    
    // Determine department from body (create) or ticket record (read/update)
    let department: string | undefined;
    if (req.body?.department) {
      department = req.body.department;
    } else if (req.params?.id) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: req.params.id },
        select: { department: true },
      });
      department = ticket?.department;
    } else if (req.query?.department) {
      department = req.query.department as string;
    }
    
    // Map department to permission module
    const module: PermissionModule = department === 'MAINTENANCE' ? 'MAINTENANCE' : 'TECHNOLOGY';
    
    // Delegate to standard checkPermission logic
    return checkPermission(module, requiredLevel)(req, res, next);
  };
}
```

### 3.5 Zod Validation Schemas

**File:** `src/validators/ticket.validators.ts`

```typescript
import { z } from 'zod';

export const ticketDepartmentSchema = z.enum(['TECHNOLOGY', 'MAINTENANCE']);
export const ticketStatusSchema = z.enum(['open', 'in_progress', 'closed']);
export const ticketPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const createTicketSchema = z.object({
  department: ticketDepartmentSchema,
  category: z.string().min(1).max(100),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  priority: ticketPrioritySchema.optional().default('medium'),
  officeLocationId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  equipmentId: z.string().uuid().optional(),       // TECHNOLOGY only
  manufacturer: z.string().max(200).optional(),     // MAINTENANCE only
  modelName: z.string().max(200).optional(),        // MAINTENANCE only
  serialNumber: z.string().max(200).optional(),     // MAINTENANCE only
});

export const updateTicketSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  title: z.string().min(3).max(200).optional(),
  priority: ticketPrioritySchema.optional(),
  roomId: z.string().uuid().nullable().optional(),
  equipmentId: z.string().uuid().nullable().optional(),
  manufacturer: z.string().max(200).nullable().optional(),
  modelName: z.string().max(200).nullable().optional(),
  serialNumber: z.string().max(200).nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

export const updateStatusSchema = z.object({
  status: ticketStatusSchema,
  notes: z.string().max(2000).optional(),
});

export const assignTicketSchema = z.object({
  assignedToId: z.string().uuid().nullable(),
  notes: z.string().max(2000).optional(),
});

export const addCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional().default(false),
});

export const ticketListQuerySchema = z.object({
  department: ticketDepartmentSchema.optional(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  officeLocationId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  createdById: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status', 'ticketNumber']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const createCategorySchema = z.object({
  department: ticketDepartmentSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
```

### 3.6 Error Handling

Follow the existing error pattern used in `purchaseOrder.service.ts`:

```typescript
import { NotFoundError, ValidationError, AuthorizationError } from '../utils/errors';

// Examples:
throw new NotFoundError('Ticket not found');
throw new ValidationError('Equipment can only be linked to TECHNOLOGY tickets');
throw new AuthorizationError('Insufficient permission to close tickets');
```

The global error handler in `server.ts` already catches these and returns appropriate HTTP status codes.

---

## 4. Frontend Architecture

### 4.1 Page Structure and Routing

New routes to add in `App.tsx`:

```
/help-desk                         → HelpDeskDashboard (ticket list/dashboard)
/help-desk/new                     → TicketWizard (step-by-step creation)
/help-desk/:id                     → TicketDetail (detail + work log + actions)
/help-desk/summary                 → TicketSummary (district-wide summary view)
```

All routes use `<ProtectedRoute>` + `<AppLayout>`. No `requireAdmin` — all authenticated users can access at minimum their own tickets.

### 4.2 Navigation Updates

Update `NAV_SECTIONS` in `AppLayout.tsx`:

```typescript
{
  title: 'Operations',
  items: [
    { label: 'Purchase Orders', icon: '📋', path: '/purchase-orders' },
    { label: 'Help Desk', icon: '🎫', path: '/help-desk' },           // Replaces disabled "Maintenance"
  ],
},
```

### 4.3 Component Hierarchy

```
pages/HelpDesk/
  index.ts                          ← Re-exports
  HelpDeskDashboard.tsx             ← Main list page with filters + summary stats
  TicketWizard.tsx                  ← Multi-step creation form
  TicketDetail.tsx                  ← Full ticket view with work log
  TicketSummary.tsx                 ← District summary (like viewTechSummary.php)

components/helpdesk/
  DepartmentSelector.tsx            ← Step 1: TECHNOLOGY or MAINTENANCE cards
  CategorySelector.tsx              ← Step 2: Department-specific category chips
  TicketForm.tsx                    ← Step 3: Detail form (adapts to department)
  TicketReviewStep.tsx              ← Step 4: Review and confirm
  TicketListTable.tsx               ← Shared data table with sorting/filtering
  TicketStatusChip.tsx              ← MUI Chip with status color coding
  TicketPriorityChip.tsx            ← MUI Chip with priority color coding
  TicketCommentList.tsx             ← Work log display (timeline format)
  TicketCommentForm.tsx             ← Add new work log entry
  TicketFilters.tsx                 ← Filter bar (department, status, priority, location)
  TicketSummaryCards.tsx            ← Summary stat cards (open, in_progress, closed counts)
  TicketAssignDialog.tsx            ← Dialog to assign/reassign ticket
  LocationSummaryTable.tsx          ← Per-location open ticket counts (like viewTechSummary)
```

### 4.4 Ticket Creation Wizard

#### Step 1: Select Department

Two large MUI Cards displayed side by side:
- **Technology** — Computer icon — "IT equipment, software, network, and account issues"
- **Maintenance** — Wrench icon — "Plumbing, electrical, HVAC, and building issues"

Clicking a card advances to Step 2 and sets `department`.

#### Step 2: Category Selection

Display active `TicketCategory` records for the selected department as MUI Chips or a grid of small cards. User selects one to proceed.

#### Step 3: Detail Form

**Common fields (both departments):**
- Office Location (autocomplete, pre-filled from user's assigned location)
- Room (dropdown, filtered by selected location)
- Priority (select: Low, Medium, High, Urgent — default Medium)
- Title (short summary, text field)
- Description (multiline textarea)

**Technology-specific fields:**
- Equipment (autocomplete, filtered by selected room — shows asset tag + name from `equipment` table)

**Maintenance-specific fields:**
- Manufacturer (text field, optional)
- Model (text field, optional)
- Serial Number (text field, optional)

#### Step 4: Review and Submit

Display all selected values in read-only format. User confirms and clicks Submit. On success, show the assigned ticket number and link to the ticket detail page.

### 4.5 Ticket List / Dashboard Page (HelpDeskDashboard)

**Layout:**
1. **Summary cards** at top: Total Open (TECHNOLOGY), Total Open (MAINTENANCE), In Progress, Closed Today
2. **Filter bar**: Department toggle, Status chips, Priority filter, Location dropdown, Search field, Date range
3. **Data table** (MUI DataGrid or custom table with `PaginationControls`):
   - Columns: Ticket #, Department, Category, Title, Location, Room, Status, Priority, Days Open, Assigned To, Created By, Created Date
   - Row click navigates to `/help-desk/:id`
   - "New Ticket" button in top-right

**Permission-based views:**
- Level 1 users: see only their own tickets; no assignment column
- Level 2 users: see tickets for their location(s)
- Level 3+ users: see all tickets; Summary link visible

### 4.6 Ticket Detail Page (TicketDetail)

**Layout:**
1. **Header**: Ticket number, department badge, status chip, priority chip
2. **Info section**: Location, Room, Category, Equipment (if tech), Mfg/Model/Serial (if maint)
3. **People section**: Created By, Assigned To (with reassign button for level 2+)
4. **Actions bar**: Change Status button (dropdown: open → in_progress → closed), Edit button (level 2+)
5. **Work log / Comments section**: Timeline list of `TicketComment` records, newest first
6. **Add comment form**: Textarea + Submit button, with optional "Internal note" checkbox (level 2+)

### 4.7 Ticket Summary Page (TicketSummary)

Replaces `viewTechSummary.php` and `viewMaintSummary.php`.

**Layout:**
1. **Department toggle**: Technology | Maintenance | All
2. **Stats**: Total created this year, Total open, Total closed
3. **Location table**: One row per `OfficeLocation`, columns: Location Name, Open Tickets, clickable to filter HelpDeskDashboard

### 4.8 Material-UI Component Patterns

Follow existing patterns established in the codebase:
- Use `@mui/material` for all UI components
- Use `@mui/icons-material` for icons
- Color coding for status: `open` = info/blue, `in_progress` = warning/orange, `closed` = success/green
- Color coding for priority: `low` = default, `medium` = info, `high` = warning, `urgent` = error
- Use existing `PaginationControls.tsx` component for table pagination
- Use existing `UserSearchAutocomplete.tsx` for user assignment

---

## 5. Ticket Categories

### 5.1 Technology Categories (Seed Data)

Derived from legacy `ttype` table patterns and common IT help desk categories:

| Name | Description |
|------|-------------|
| Hardware Issue | Computer, printer, projector, or device malfunction |
| Software Issue | Application error, installation, or update needed |
| Network / Connectivity | Internet, Wi-Fi, or network access problems |
| Account / Access | Password reset, account locked, permission request |
| Equipment Request | New equipment or replacement needed |
| Printer Issue | Printing problems, toner, paper jams |
| Audio / Visual | Smartboard, projector, speaker, or A/V equipment |
| Phone / Communication | Phone system, intercom, or communication issues |
| Other | Issue not covered by above categories |

### 5.2 Maintenance Categories (Seed Data)

Derived from legacy `mtype` table patterns and common facility maintenance categories:

| Name | Description |
|------|-------------|
| Plumbing | Leaks, clogs, faucets, toilets, water issues |
| Electrical | Outlets, switches, lighting, wiring |
| HVAC | Heating, cooling, ventilation, thermostat |
| Furniture / Fixtures | Desks, chairs, cabinets, shelving, blinds |
| Cleaning | Spills, stains, general cleaning requests |
| Doors / Locks / Keys | Door repair, lock issues, key requests |
| Painting / Walls | Wall damage, paint touch-up, bulletin boards |
| Flooring | Carpet, tile, floor damage or tripping hazard |
| Pest Control | Insect or rodent issues |
| Grounds / Exterior | Parking lot, sidewalk, landscaping, signage |
| Other | Issue not covered by above categories |

### 5.3 Category Management

Categories are managed via the ticket categories API. Admins (TECHNOLOGY:3 or MAINTENANCE:3) can add, rename, reorder, and deactivate categories. Deactivated categories are hidden from the creation wizard but preserved on existing tickets.

---

## 6. Workflow & Lifecycle

### 6.1 Ticket Status Flow

```
                ┌──────────┐
 Created  ───►  │   open   │
                └────┬─────┘
                     │
                     │ Technician starts work
                     ▼
              ┌──────────────┐
              │  in_progress  │
              └──────┬───────┘
                     │
                     │ Work completed
                     ▼
               ┌──────────┐
               │  closed   │  ← Terminal
               └──────┬───┘
                      │
                      │ Reopened (status back to open)
                      ▼
                ┌──────────┐
                │   open   │  (re-entering the cycle)
                └──────────┘
```

**Valid Transitions:**
| From | To | Who Can Transition |
|------|----|--------------------|
| `open` | `in_progress` | Level 2+ (department staff) |
| `open` | `closed` | Level 2+ (department staff) |
| `in_progress` | `closed` | Level 2+ (department staff) |
| `in_progress` | `open` | Level 2+ (revert if needed) |
| `closed` | `open` | Level 3+ (reopen) |

**On status change:**
- A system-generated `TicketComment` is created with `isStatusChange = true` recording the transition and optional notes
- When changing to `closed`, set `closedAt = now()`
- When reopening from `closed`, clear `closedAt`

### 6.2 Ticket Creation Flow

1. User clicks "New Ticket" from Help Desk dashboard or nav
2. **Step 1**: Select department (Technology or Maintenance)
3. **Step 2**: Select category from department-specific list
4. **Step 3**: Fill in detail form (location, room, priority, title, description, dept-specific fields)
5. **Step 4**: Review all selections, click Submit
6. Backend creates `Ticket` + initial `TicketComment` (with the description) in a single transaction
7. Auto-generates ticket number (`TK-00001`)
8. Returns ticket ID + ticket number
9. Frontend shows confirmation with link to new ticket

### 6.3 Assignment / Routing Logic

**Initial assignment:**
- Tickets are created **unassigned** (no auto-assignment in Phase 1)
- Level 2+ users can self-assign or assign to another user

**Assignment rules:**
- Any Level 2+ user in the ticket's department can assign/reassign
- Level 3 users can assign to any user
- Assignment creates a `TicketComment` with `isStatusChange = true`: "Assigned to [Name]"
- Unassigning is allowed (set `assignedToId = null`)

**Future enhancement (Phase 6+):** Auto-route TECHNOLOGY tickets to the tech department queue and MAINTENANCE tickets to the maintenance department queue based on Entra group membership.

### 6.4 Resolution and Closure Process

1. Assignee (or any Level 2+ user) adds final work log comment describing resolution
2. Changes status to `closed` (with optional notes)
3. `closedAt` timestamp is set
4. Ticket remains visible in lists with `closed` status filter

### 6.5 Reopening Policy

- Level 3+ users can reopen a closed ticket
- Creates a `TicketComment`: "Ticket reopened: [reason]"
- Clears `closedAt`
- Status reverts to `open`

---

## 7. Permissions & Roles

### 7.1 Permission Module Mapping

The Help Desk system uses the **existing** `TECHNOLOGY` and `MAINTENANCE` permission modules. No new modules are needed.

| Department | Permission Module | Existing in DB |
|------------|-------------------|:--------------:|
| TECHNOLOGY | `TECHNOLOGY` | ✅ Yes (3 levels seeded) |
| MAINTENANCE | `MAINTENANCE` | ✅ Yes (3 levels seeded) |

### 7.2 Permission Matrix

| Action | TECHNOLOGY:1 | TECHNOLOGY:2 | TECHNOLOGY:3 | MAINTENANCE:1 | MAINTENANCE:2 | MAINTENANCE:3 | ADMIN |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create tech ticket | ✅ | ✅ | ✅ | — | — | — | ✅ |
| Create maint ticket | — | — | — | ✅ | ✅ | ✅ | ✅ |
| View own tickets | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View location tickets | — | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| View all dept tickets | — | — | ✅ | — | — | ✅ | ✅ |
| Add comment (own ticket) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add comment (any ticket) | — | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Change status | — | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Assign / reassign | — | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Reopen closed ticket | — | — | ✅ | — | — | ✅ | ✅ |
| Manage categories | — | — | ✅ | — | — | ✅ | ✅ |
| View summary/stats | — | — | ✅ | — | — | ✅ | ✅ |

### 7.3 Cross-Department Visibility

Users with permissions in **both** modules can see tickets from both departments. The filter defaults to "All" for such users and to their specific department for single-module users.

The ADMIN role sees all tickets across both departments.

### 7.4 Alignment with Entra Group Mapping

From the existing Entra group → permission mapping (per PERMISSIONS_AND_ROLES.md):

| Entra Group | TECH Level | MAINT Level | Help Desk Access |
|-------------|:---:|:---:|---|
| ADMIN | 3 | 3 | Full access to both departments |
| Technology Director | 3 | — | Full tech access |
| Director of Schools | 2 | 3 | Location tech + full maint |
| Maintenance Director | — | 3 | Full maint access |
| Principals / VPs | 2 | 2 | Location-level both depts |
| Tech Admin | 3 | 2 | Full tech + location maint |
| Maintenance Admin | 2 | 3 | Location tech + full maint |
| All Staff | 1 | 1 | Create & view own tickets only |

---

## 8. Security Considerations

### 8.1 Authentication

- All ticket endpoints require JWT authentication via `authenticate` middleware
- JWT is verified from `access_token` HttpOnly cookie or `Authorization: Bearer` header
- Tokens issued by Microsoft Entra ID and verified with the project's `jwt.verify` implementation

### 8.2 Authorization

- `checkTicketPermission(level)` middleware resolves the correct module (TECHNOLOGY or MAINTENANCE) from the ticket's department
- Row-level scoping in the controller: Level 1 users filtered to `createdById = currentUser`, Level 2 users filtered to their assigned location(s)
- ADMIN role bypasses all checks (effective `permLevel = 6`)

### 8.3 Input Validation

- All request bodies validated via Zod schemas through `validateRequest` middleware
- Text fields have max-length constraints to prevent abuse
- UUID fields validated with `z.string().uuid()`
- Enum fields validated with `z.enum()` for type safety
- SQL injection prevention: Prisma uses parameterized queries by default

### 8.4 CSRF Protection

- All mutation endpoints (POST, PUT, PATCH, DELETE) use `validateCsrfToken` middleware
- CSRF token exchange via `X-CSRF-Token` header (existing pattern)

### 8.5 Logging Strategy

- Follow existing structured logging via `logger` and `loggers` (from `lib/logger.ts`)
- Log ticket creation, status changes, and assignment changes at `info` level
- Log authorization failures at `warn` level
- Do **not** log ticket description or comment content (may contain sensitive information)
- Log ticket IDs, user IDs, and action types for audit trail

### 8.6 Error Handling

- Use the existing `NotFoundError`, `ValidationError`, `AuthorizationError` classes
- Global error handler in `server.ts` already sanitizes error messages in production
- 404 for invalid ticket IDs, 403 for insufficient permissions, 400 for validation failures

### 8.7 Rate Limiting

- General API rate limit (500 req/15 min per IP) already covers ticket endpoints
- No additional rate limiting needed — ticket creation is low-volume compared to API reads

---

## 9. Implementation Phases

### Phase 1: Database Models and Migrations

**Scope:** Create the database tables and seed data.

**Tasks:**
1. Add `Ticket`, `TicketComment`, `TicketCategory` models to `schema.prisma`
2. Add new relation fields to `User`, `Room`, `equipment` models
3. Add `nextTicketNumber` and `ticketNumberPrefix` to `SystemSettings`
4. Run `npx prisma migrate dev --name add_helpdesk_ticketing_system`
5. Add category seed data to `seed.ts` (both Technology and Maintenance categories)
6. Verify migration applies cleanly

**Deliverables:** Migration file, updated schema, seed data.

### Phase 2: Backend API — CRUD + Workflow Endpoints

**Scope:** Full backend implementation.

**Tasks:**
1. Create `ticket.validators.ts` — all Zod schemas
2. Create `ticket.service.ts` — business logic layer
3. Create `ticket.controller.ts` — request/response handling with permission scoping
4. Create `ticket.routes.ts` — route definitions with middleware chain
5. Create `checkTicketPermission` middleware helper
6. Mount routes in `server.ts`: `app.use('/api', ticketRoutes)`
7. Add shared types to `shared/src/types.ts`

**Deliverables:** All backend files, routes mounted, types exported.

### Phase 3: Frontend — Ticket Creation Wizard

**Scope:** Multi-step ticket creation form.

**Tasks:**
1. Create `TicketWizard.tsx` with MUI Stepper
2. Create `DepartmentSelector.tsx` — step 1
3. Create `CategorySelector.tsx` — step 2
4. Create `TicketForm.tsx` — step 3 (adapts to department)
5. Create `TicketReviewStep.tsx` — step 4
6. Create frontend API service `ticketService.ts`
7. Create TanStack Query hooks: `useCreateTicket`, `useTicketCategories`
8. Add route for `/help-desk/new` in `App.tsx`

**Deliverables:** Working ticket creation flow, new route.

### Phase 4: Frontend — Ticket List / Dashboard

**Scope:** Main ticket list page with filtering and pagination.

**Tasks:**
1. Create `HelpDeskDashboard.tsx` — main list page
2. Create `TicketListTable.tsx` — data table component
3. Create `TicketFilters.tsx` — filter bar
4. Create `TicketSummaryCards.tsx` — stat cards
5. Create `TicketStatusChip.tsx`, `TicketPriorityChip.tsx`
6. Create TanStack Query hooks: `useTicketList`, `useTicketSummary`
7. Add route for `/help-desk` in `App.tsx`
8. Update `AppLayout.tsx` navigation — replace disabled "Maintenance" with "Help Desk"

**Deliverables:** Working ticket list page, navigation updated.

### Phase 5: Frontend — Ticket Detail View

**Scope:** Individual ticket view with work log and actions.

**Tasks:**
1. Create `TicketDetail.tsx` — full detail page
2. Create `TicketCommentList.tsx` — work log timeline
3. Create `TicketCommentForm.tsx` — add comment form
4. Create `TicketAssignDialog.tsx` — assign/reassign
5. Create TanStack Query hooks: `useTicketDetail`, `useAddComment`, `useUpdateTicketStatus`, `useAssignTicket`
6. Add route for `/help-desk/:id` in `App.tsx`
7. Status change UI (dropdown + confirm)

**Deliverables:** Working ticket detail page with full work log.

### Phase 6: Assignment, Routing & Summary

**Scope:** Assignment workflow and district summary view.

**Tasks:**
1. Create `TicketSummary.tsx` — district-wide summary (replaces `viewTechSummary.php` / `viewMaintSummary.php`)
2. Create `LocationSummaryTable.tsx` — per-location open counts
3. Add route for `/help-desk/summary` in `App.tsx`
4. Wire "View by Location" links in summary to filtered list
5. Enhance assignment with auto-suggest based on department

**Deliverables:** Summary view, location drill-down.

### Phase 7: Notifications and Updates (Future)

**Scope:** Email notifications for ticket events.

**Tasks:**
1. Send email on ticket creation (to department queue email from SystemSettings)
2. Send email on ticket assignment (to assigned user)
3. Send email on status change to `closed` (to ticket creator)
4. Add notification email fields to `SystemSettings`: `techTicketEmail`, `maintTicketEmail`
5. Use existing `email.service.ts` (Nodemailer)

**Deliverables:** Email notifications for key ticket events.

### Phase 8: Admin Features and Reporting (Future)

**Scope:** Admin-level features and reporting.

**Tasks:**
1. Category management UI (within Admin or Reference Data page)
2. Ticket reports: tickets by department, by location, by month, avg resolution time
3. Export ticket data to Excel
4. Dashboard enrichment: add open ticket counts to Dashboard widgets

**Deliverables:** Category admin, reports, dashboard integration.

---

## 10. File Structure

### 10.1 Backend Files

```
backend/src/
  validators/
    ticket.validators.ts              ← Zod schemas for all ticket endpoints
  services/
    ticket.service.ts                 ← Business logic: CRUD, status, assignment, comments, summary
  controllers/
    ticket.controller.ts              ← Request handlers with permission-scoped data access
  routes/
    ticket.routes.ts                  ← Express router with middleware chain
  middleware/
    permissions.ts                    ← Updated: add HELPDESK to PermissionModule if needed (likely not — uses existing TECHNOLOGY/MAINTENANCE)
```

**Modified backend files:**
- `server.ts` — mount `ticketRoutes` at `/api`
- `middleware/permissions.ts` — no module changes needed (uses existing TECHNOLOGY/MAINTENANCE)

### 10.2 Frontend Files

```
frontend/src/
  pages/HelpDesk/
    index.ts                          ← Re-exports
    HelpDeskDashboard.tsx             ← Main list/dashboard page
    TicketWizard.tsx                  ← Multi-step creation form
    TicketDetail.tsx                  ← Individual ticket detail
    TicketSummary.tsx                 ← District-wide summary
  components/helpdesk/
    DepartmentSelector.tsx            ← Step 1 wizard component
    CategorySelector.tsx              ← Step 2 wizard component
    TicketForm.tsx                    ← Step 3 wizard component
    TicketReviewStep.tsx              ← Step 4 wizard component
    TicketListTable.tsx               ← Data table
    TicketStatusChip.tsx              ← Status badge
    TicketPriorityChip.tsx            ← Priority badge
    TicketCommentList.tsx             ← Work log timeline
    TicketCommentForm.tsx             ← Add comment
    TicketFilters.tsx                 ← Filter controls
    TicketSummaryCards.tsx            ← Summary stat cards
    TicketAssignDialog.tsx            ← Assignment dialog
    LocationSummaryTable.tsx          ← Per-location breakdown
  services/
    ticketService.ts                  ← API client for ticket endpoints
  hooks/
    queries/
      useTickets.ts                   ← TanStack Query hooks
    mutations/
      useTicketMutations.ts           ← TanStack mutation hooks
```

**Modified frontend files:**
- `App.tsx` — add Help Desk routes
- `components/layout/AppLayout.tsx` — update navigation (replace disabled Maintenance item with Help Desk)

### 10.3 Shared Types

```
shared/src/
  types.ts                            ← Add TicketDepartment, TicketStatus, TicketPriority types
```

### 10.4 Database Migration

```
backend/prisma/
  schema.prisma                       ← Add Ticket, TicketComment, TicketCategory models + relations
  seed.ts                             ← Add ticket category seed data + SystemSettings fields
  migrations/
    YYYYMMDDHHMMSS_add_helpdesk_ticketing_system/
      migration.sql                   ← Auto-generated by Prisma
```

### 10.5 Complete New File List

**Backend (6 new files):**
1. `backend/src/validators/ticket.validators.ts`
2. `backend/src/services/ticket.service.ts`
3. `backend/src/controllers/ticket.controller.ts`
4. `backend/src/routes/ticket.routes.ts`

**Frontend (18 new files):**
5. `frontend/src/pages/HelpDesk/index.ts`
6. `frontend/src/pages/HelpDesk/HelpDeskDashboard.tsx`
7. `frontend/src/pages/HelpDesk/TicketWizard.tsx`
8. `frontend/src/pages/HelpDesk/TicketDetail.tsx`
9. `frontend/src/pages/HelpDesk/TicketSummary.tsx`
10. `frontend/src/components/helpdesk/DepartmentSelector.tsx`
11. `frontend/src/components/helpdesk/CategorySelector.tsx`
12. `frontend/src/components/helpdesk/TicketForm.tsx`
13. `frontend/src/components/helpdesk/TicketReviewStep.tsx`
14. `frontend/src/components/helpdesk/TicketListTable.tsx`
15. `frontend/src/components/helpdesk/TicketStatusChip.tsx`
16. `frontend/src/components/helpdesk/TicketPriorityChip.tsx`
17. `frontend/src/components/helpdesk/TicketCommentList.tsx`
18. `frontend/src/components/helpdesk/TicketCommentForm.tsx`
19. `frontend/src/components/helpdesk/TicketFilters.tsx`
20. `frontend/src/components/helpdesk/TicketSummaryCards.tsx`
21. `frontend/src/components/helpdesk/TicketAssignDialog.tsx`
22. `frontend/src/components/helpdesk/LocationSummaryTable.tsx`
23. `frontend/src/services/ticketService.ts`
24. `frontend/src/hooks/queries/useTickets.ts`
25. `frontend/src/hooks/mutations/useTicketMutations.ts`

**Modified files (5):**
26. `backend/prisma/schema.prisma` — add models + relations
27. `backend/prisma/seed.ts` — add category seed data and SystemSettings fields
28. `backend/src/server.ts` — mount ticket routes
29. `frontend/src/App.tsx` — add routes
30. `frontend/src/components/layout/AppLayout.tsx` — update navigation
31. `shared/src/types.ts` — add ticket type definitions

---

## Appendix A: Legacy File Reference Map

| Legacy File | Tech-V2 Replacement |
|-------------|---------------------|
| `newTechOrder.php` | `TicketWizard.tsx` (department = TECHNOLOGY) |
| `newMaintOrder.php` | `TicketWizard.tsx` (department = MAINTENANCE) |
| `updateTechOrder.php` | `TicketDetail.tsx` (department = TECHNOLOGY) |
| `updateMaintOrder.php` | `TicketDetail.tsx` (department = MAINTENANCE) |
| `viewTechOrder.php` | `TicketDetail.tsx` (read-only view) |
| `viewMaintOrder.php` | `TicketDetail.tsx` (read-only view) |
| `viewTechSchool.php` | `HelpDeskDashboard.tsx` (filtered by location) |
| `viewMaintSchool.php` | `HelpDeskDashboard.tsx` (filtered by location) |
| `viewTechSummary.php` | `TicketSummary.tsx` (department = TECHNOLOGY) |
| `viewMaintSummary.php` | `TicketSummary.tsx` (department = MAINTENANCE) |
| `viewTechCounty.php` | `HelpDeskDashboard.tsx` (no location filter) |
| `viewMaintCounty.php` | `HelpDeskDashboard.tsx` (no location filter) |
| `roomSearchSchoolTech.php` | Built into `TicketWizard.tsx` Step 3 (location + room selectors) |
| `roomSearchSchoolMaint.php` | Built into `TicketWizard.tsx` Step 3 (location + room selectors) |

## Appendix B: Legacy Permission Level Mapping

| Legacy Level | Legacy Access | New Module:Level | New Access |
|:---:|---|---|---|
| `techLevel = 1` | County summary + county view | `TECHNOLOGY:3` | All tickets + summary |
| `techLevel = 2` | School view + can select user | `TECHNOLOGY:2` | Location tickets + assign |
| `techLevel = 3` | Own rooms only | `TECHNOLOGY:1` | Create + view own tickets |
| `maintLevel = 1` | County summary + county view | `MAINTENANCE:3` | All tickets + summary |
| `maintLevel = 2` | School view + can select user | `MAINTENANCE:2` | Location tickets + assign |
| `maintLevel = 3` | Own rooms only | `MAINTENANCE:1` | Create + view own tickets |

> **Note:** The legacy system uses level 1 for highest access and 3 for lowest. The new system inverts this: level 1 is lowest (view own) and level 3 is highest (full admin). This aligns with the pattern already established for the TECHNOLOGY and MAINTENANCE permission modules in the seed data.

## Appendix C: Improvements Over Legacy System

| Improvement | Description |
|-------------|-------------|
| **Unified interface** | Single Help Desk page instead of separate tech/maint navigation trees |
| **Priority system** | Low/Medium/High/Urgent priorities (legacy had none) |
| **In-progress status** | Three-status lifecycle vs legacy two-status (open/closed) |
| **Ticket assignment** | Explicit assignee tracking (legacy had no assignment mechanism) |
| **Internal notes** | Staff-only comments hidden from ticket creator |
| **Real-time search** | Full-text search across title, description, ticket number |
| **Modern pagination** | Server-side pagination with sort/filter instead of loading all records |
| **Proper FK relations** | Tickets link to `OfficeLocation` and `Room` models instead of string names |
| **Equipment integration** | Tech tickets link to actual equipment records (not just asset tag strings) |
| **Central categories** | Dynamic admin-managed categories instead of hardcoded type tables |
| **Auto-numbering** | Consistent `TK-NNNNN` numbering from SystemSettings (no year-scoped tables) |
| **Audit trail** | Every status change and assignment creates a permanent `TicketComment` record |
| **Cross-department view** | Users with both TECH and MAINT permissions see unified dashboard |
| **Days open calculation** | Computed from `createdAt` instead of querying separate work log table |
