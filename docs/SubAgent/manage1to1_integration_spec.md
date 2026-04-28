# Manage1to1 Integration — Comprehensive Implementation Spec

*Replaces: manage1to1.com SaaS*
*Date: 2026-03-03*
*Status: Approved for Implementation*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Feature Requirements](#2-feature-requirements)
3. [Database Schema (Prisma)](#3-database-schema-prisma)
4. [API Endpoints](#4-api-endpoints)
5. [New File Structure](#5-new-file-structure)
6. [New Dependencies](#6-new-dependencies)
7. [Frontend Page Map](#7-frontend-page-map)
8. [Permission Matrix](#8-permission-matrix)
9. [SIS Import Specification](#9-sis-import-specification)
10. [Barcode/QR Scanning Spec](#10-barcodeqr-scanning-spec)
11. [Email Invoice Specification](#11-email-invoice-specification)
12. [Implementation Sprints](#12-implementation-sprints)
13. [Security Considerations](#13-security-considerations)
14. [Risks & Mitigations](#14-risks--mitigations)
15. [Open Questions / Assumptions](#15-open-questions--assumptions)

---

## 1. Executive Summary

### Problem Being Solved

The district currently relies on **manage1to1.com**, a third-party SaaS, for 1:1 device management — tracking which students have which Chromebooks/tablets, logging damage incidents, sending invoices to parents, and managing repair workflows. This introduces:

- A recurring subscription cost
- Data residing outside district-controlled infrastructure
- No native integration with the existing Tech-V2 asset management system
- Duplicate data entry (devices already tracked in Tech-V2's `equipment` table)
- No unified reporting across inventory + checkout + damage + repair

### Scope of Replacement

This module natively embeds all manage1to1.com functionality into **Tech-V2**, using the existing PostgreSQL database, Express API, React frontend, and permission system. The scope covers:

- Student records with SIS import/sync
- Guardian contact management per student
- Device checkout / check-in for both **students** and **staff** (existing `User` records)
- Barcode/QR scan-based device lookup using existing `equipment.barcode` / `equipment.qrCode` fields
- Damage incident tracking with photo uploads
- Repair ticket workflow with vendor integration
- Invoice generation (PDF), email delivery to guardians, and payment tracking
- Dashboard widgets and reporting

### High-Level Feature List

| # | Feature | Status |
|---|---------|--------|
| 1 | Student CRUD + SIS CSV/Excel import | New |
| 2 | Guardian management (multiple per student) | New |
| 3 | Device checkout / check-in with barcode scan | New |
| 4 | Staff checkout (uses existing `User` records) | New |
| 5 | Damage incident logging with photos | New |
| 6 | Repair ticket workflow | New |
| 7 | PDF invoice generation + email delivery | New |
| 8 | Payment recording | New |
| 9 | Dashboard widgets | New |
| 10 | Reporting endpoints + UI | New |

### Integration with Existing Tech-V2 Modules

| Existing Module | Integration Point |
|----------------|-------------------|
| `equipment` table | `DeviceAssignment` references `equipmentId`; checkout auto-updates `equipment.status` and `equipment.assignedToUserId` (staff only) |
| `vendors` table | `RepairTicket.vendorId` reuses existing vendor records |
| `OfficeLocation` table | `Student.campusId` links student to campus |
| `User` table | Staff checkouts reference `DeviceAssignment.staffUserId`; `DamageInvoice.createdBy` references `User` |
| Auth / Permission system | New `CHECKOUT` and `INVOICING` permission modules; all routes use `authenticate` + `checkPermission` |
| `InventoryImportJob` pattern | SIS student import follows same job-based async import pattern |
| `multer` upload pattern | Damage photo uploads follow same multer config as inventory file uploads |

---

## 2. Feature Requirements

### 2.1 Student Management

#### SIS Import
- Supported formats: CSV, Excel (`.xlsx`, `.xls`)
- Async import job following the `InventoryImportJob` / `InventoryImportItem` pattern exactly
- Backend creates a `StudentImportJob` record, processes rows, creates `StudentImportItem` records per row
- Frontend UI mirrors the existing inventory import page at `c:\Tech-V2\frontend\src\pages\InventoryManagement.tsx`
- Column header aliases supported — see [Section 9](#9-sis-import-specification) for full column spec

#### Manual CRUD
- Create, read, update, deactivate (soft delete: `isActive = false`)
- Hard delete: ADMIN only
- Search by: `studentId`, `firstName`, `lastName`, `grade`, `campus`
- Paginated list view

#### Student Fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `studentId` | String | School-assigned ID (SIS key); unique per campus |
| `firstName` | String | Required |
| `lastName` | String | Required |
| `grade` | String | e.g., `"K"`, `"1"` … `"12"` |
| `campusId` | String | FK → `OfficeLocation.id` |
| `email` | String? | Optional student email |
| `isActive` | Boolean | Default true; set false on unenrollment |
| `notes` | String? | Free text |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

### 2.2 Guardian Management

- Multiple guardians per student
- One guardian per student may be marked `isPrimary = true`
- Guardians with `receivesInvoices = true` receive PDF invoice emails
- All `email` fields validated via Zod `z.string().email()`

#### Guardian Fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `studentId` | String | FK → `Student.id` |
| `firstName` | String | Required |
| `lastName` | String | Required |
| `relationship` | String | e.g., `"parent"`, `"guardian"`, `"grandparent"` |
| `email` | String? | Validated if provided |
| `phone` | String? | |
| `isPrimary` | Boolean | Default false; enforced: max one primary per student |
| `receivesInvoices` | Boolean | Default false |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto |

### 2.3 Device Checkout System

#### Checkout Flow
1. Technician opens Checkout page or Scan modal
2. Scans barcode/QR or types asset tag — calls `GET /api/device-assignments/scan?barcode=XXX`
3. Backend returns device details + current assignment status
4. If device is already checked out → error shown; prevent double checkout
5. Technician selects assignee type: **Student** or **Staff**
6. For Student: search/select from `Student` records
7. For Staff: search/select from `User` records
8. Set condition (checkout condition): `perfect` | `good` | `fair` | `damaged`
9. Optional notes
10. Submit → creates `DeviceAssignment` record
11. If assignee is **Staff**: also update `equipment.assignedToUserId` and `equipment.status = "checked_out"`
12. If assignee is **Student**: update `equipment.status = "checked_out"` only (student FK on `DeviceAssignment`)

#### Check-In Flow
1. Look up device by scan or asset tag
2. System shows current assignment
3. Technician sets return condition and notes
4. If condition is `damaged` → prompt to create `DamageIncident` (optional, can do later)
5. Submit → sets `DeviceAssignment.returnedAt`, `returnCondition`, closes assignment
6. Updates `equipment.status` back to `"active"` (or `"in_repair"` if damage incident triggers repair)
7. Clears `equipment.assignedToUserId` if staff checkout

#### Business Rules
- A device may only have one **active** (non-returned) `DeviceAssignment` at a time
- Multiple historical assignments allowed per device
- A student may have multiple concurrent active assignments (main device + loaner while main is in repair)
- `equipment.status` values used: `"active"`, `"checked_out"`, `"in_repair"`, `"disposed"`

### 2.4 Damage Incident Tracking

#### Incident Creation Points
- From check-in flow (device returned damaged)
- Standalone walk-in (student brings in damaged device without current checkout)
- From repair ticket creation

#### Damage Types (enum string field)
`cracked_screen` | `liquid_damage` | `physical_damage` | `missing_keys` | `missing_charger` | `missing_device` | `other`

#### Severity Levels
`minor` | `moderate` | `severe` | `total_loss`

#### Status Progression
```
reported → invoiced → in_repair → resolved
                      ↘ waived
```

#### Photo Uploads
- Up to **5 photos** per incident
- Allowed types: `image/jpeg`, `image/png`, `image/webp`
- Max size: **5 MB per file**
- Storage: local filesystem (same as `EquipmentAttachment` pattern) or configurable upload path
- Stored as `DamageIncidentPhoto` records linked to the incident

#### Auto-Actions
- **Auto-create repair ticket**: checkbox on incident form → creates `RepairTicket` linked to incident
- **Auto-create invoice**: checkbox → creates `DamageInvoice` in `draft` status linked to incident + primary guardian

### 2.5 Repair Ticket Workflow

#### Status Transitions
```
pending → sent_to_vendor → in_repair → returned
                                     ↘ unrepairable
          ↓
       cancelled
```

#### When status → `sent_to_vendor`:
- `equipment.status` updated to `"in_repair"`
- `sentForRepairAt` timestamp recorded

#### When status → `returned`:
- `returnedAt` timestamp recorded
- `equipment.status` updated to `"active"`
- Linked `DeviceAssignment` (if any) can optionally be resumed or a new checkout initiated

#### Repair Ticket Fields (see full schema in Section 3)
- `vendorId` — FK → existing `vendors` table
- `sentForRepairAt`, `expectedReturnDate`, `returnedAt`
- `repairCost` — `Decimal(10,2)`
- `trackingNumber`, `repairNotes`
- `damageIncidentId` — optional FK (routine repairs have no incident)
- `equipmentId` — FK → `equipment`
- `createdBy` — FK → `User`

### 2.6 Invoice Management

#### Invoice Lifecycle
```
draft → sent → paid
             ↘ waived
             ↘ collections
```

#### Invoice Fields
- `invoiceNumber` — auto-generated: `INV-{YEAR}-{SEQUENCE}` (e.g., `INV-2026-00142`)
- `damageIncidentId` — FK → `DamageIncident`
- `guardianId` — FK → `StudentGuardian` (the recipient)
- `studentId` — FK → `Student`
- `amount` — `Decimal(10,2)`
- `dueDate` — default 30 days from sent date
- `status` — `draft` | `sent` | `paid` | `waived` | `collections`
- `sentAt`, `paidAt`
- `notes`

#### PDF Generation
- Library: **`pdfkit`** (see [Section 6](#6-new-dependencies) for justification)
- Template sections: school logo + name, invoice number + date, student info, device info, damage description, photo references (filenames listed), amount due, due date, payment instructions
- Generated on demand (not pre-stored); served via authenticated endpoint
- Async generation for email attachment

#### Email Delivery
- Library: **`nodemailer`**
- HTML email with PDF attached
- To: all guardians where `receivesInvoices = true`
- Retry: if `sentAt` is null and status is `sent`, a cron job retries failed sends every 15 minutes (up to 5 attempts)
- Delivery tracking: `sentAt` timestamp, `sendAttempts` counter, `lastSendError` string field

#### Re-Send
- `POST /api/invoices/:id/resend` — regenerates PDF, re-sends email, updates `sentAt`
- Rate limited: 10 per hour per authenticated user

#### Payment Recording
- `POST /api/invoices/:id/payments` — creates `InvoicePayment` record
- Fields: `amount`, `paidAt`, `paymentMethod`, `notes`
- When full amount collected → auto-set invoice `status = "paid"` and `paidAt`

### 2.7 Reporting & Analytics

#### Dashboard Widgets
| Widget | Data Source | Update Frequency |
|--------|------------|-----------------|
| Devices currently checked out (count + list) | `DeviceAssignment` where `returnedAt IS NULL` | Real-time |
| Devices in repair (count + avg days out) | `RepairTicket` where status `in sent_to_vendor, in_repair` | Real-time |
| Damage incidents this academic year (bar chart by month) | `DamageIncident.reportedAt` | Real-time |
| Outstanding invoice total ($) | `DamageInvoice` where status `in draft, sent, collections` | Real-time |
| Top 5 damaged device models | `DamageIncident JOIN equipment JOIN models` | Real-time |

#### Report Endpoints (see Section 4)
- Student device history
- Active checkouts by campus
- Damage incidents by type and severity
- Repair cost summary by vendor
- Invoice aging (30/60/90 days)

---

## 3. Database Schema (Prisma)

Add all models below to `c:\Tech-V2\backend\prisma\schema.prisma` in a new section:

```prisma
// ============================================
// DEVICE MANAGEMENT (MANAGE1TO1 REPLACEMENT)
// ============================================

model Student {
  id          String             @id @default(uuid())
  studentId   String             // School-assigned ID (SIS)
  firstName   String
  lastName    String
  grade       String?            // "K", "1"–"12"
  email       String?
  campusId    String
  isActive    Boolean            @default(true)
  notes       String?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  campus          OfficeLocation       @relation(fields: [campusId], references: [id])
  guardians       StudentGuardian[]
  assignments     DeviceAssignment[]
  damageIncidents DamageIncident[]
  invoices        DamageInvoice[]
  importItems     StudentImportItem[]

  @@unique([studentId, campusId])
  @@index([isActive])
  @@index([campusId])
  @@index([lastName])
  @@index([grade])
  @@map("students")
}

model StudentGuardian {
  id               String   @id @default(uuid())
  studentId        String
  firstName        String
  lastName         String
  relationship     String   // "parent" | "guardian" | "grandparent" | "other"
  email            String?
  phone            String?
  isPrimary        Boolean  @default(false)
  receivesInvoices Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  student  Student         @relation(fields: [studentId], references: [id], onDelete: Cascade)
  invoices DamageInvoice[]

  @@index([studentId])
  @@index([isPrimary])
  @@map("student_guardians")
}

/// Checkout / check-in record for a device assigned to a student OR staff member.
/// Only one active (returnedAt IS NULL) assignment per equipment item is allowed.
model DeviceAssignment {
  id               String    @id @default(uuid())
  equipmentId      String
  // Assignee — exactly one of studentId or staffUserId must be non-null
  studentId        String?
  staffUserId      String?   // FK → User.id (staff checkouts)
  assigneeType     String    // "student" | "staff"
  checkoutBy       String    // User.id — who performed checkout
  checkoutAt       DateTime  @default(now())
  checkoutCondition String   // "perfect" | "good" | "fair" | "damaged"
  returnedAt       DateTime?
  returnCondition  String?   // "perfect" | "good" | "fair" | "damaged"
  returnedBy       String?   // User.id — who processed return
  notes            String?
  returnNotes      String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  equipment       equipment         @relation(fields: [equipmentId], references: [id])
  student         Student?          @relation(fields: [studentId], references: [id])
  staffUser       User?             @relation("DeviceAssignmentStaff", fields: [staffUserId], references: [id])
  checkedOutBy    User              @relation("DeviceAssignmentCheckedOutBy", fields: [checkoutBy], references: [id])
  returnedByUser  User?             @relation("DeviceAssignmentReturnedBy", fields: [returnedBy], references: [id])
  damageIncidents DamageIncident[]

  @@index([equipmentId])
  @@index([studentId])
  @@index([staffUserId])
  @@index([checkoutAt])
  @@index([returnedAt])
  @@index([equipmentId, returnedAt]) // composite for "active assignment" lookup
  @@map("device_assignments")
}

model DamageIncident {
  id                 String    @id @default(uuid())
  equipmentId        String
  assignmentId       String?   // FK → DeviceAssignment (null for walk-in)
  studentId          String?   // FK → Student (denormalised for fast queries)
  reportedBy         String    // User.id
  reportedAt         DateTime  @default(now())
  damageType         String    // "cracked_screen" | "liquid_damage" | "physical_damage" | "missing_keys" | "missing_charger" | "missing_device" | "other"
  severity           String    // "minor" | "moderate" | "severe" | "total_loss"
  description        String?
  estimatedCost      Decimal?  @db.Decimal(10, 2)
  status             String    @default("reported") // "reported" | "invoiced" | "in_repair" | "resolved" | "waived"
  resolvedAt         DateTime?
  resolvedBy         String?   // User.id
  resolutionNotes    String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  equipment    equipment             @relation(fields: [equipmentId], references: [id])
  assignment   DeviceAssignment?     @relation(fields: [assignmentId], references: [id])
  student      Student?              @relation(fields: [studentId], references: [id])
  reporter     User                  @relation("DamageIncidentReporter", fields: [reportedBy], references: [id])
  resolvedUser User?                 @relation("DamageIncidentResolver", fields: [resolvedBy], references: [id])
  photos       DamageIncidentPhoto[]
  repairTickets RepairTicket[]
  invoices     DamageInvoice[]

  @@index([equipmentId])
  @@index([assignmentId])
  @@index([studentId])
  @@index([status])
  @@index([reportedAt])
  @@map("damage_incidents")
}

model DamageIncidentPhoto {
  id         String   @id @default(uuid())
  incidentId String
  fileName   String
  fileUrl    String
  fileType   String   // "image/jpeg" | "image/png" | "image/webp"
  fileSize   Int      // bytes
  uploadedBy String   // User.id
  uploadedAt DateTime @default(now())

  incident DamageIncident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  uploader User           @relation(fields: [uploadedBy], references: [id])

  @@index([incidentId])
  @@map("damage_incident_photos")
}

model RepairTicket {
  id                 String    @id @default(uuid())
  ticketNumber       String    @unique  // RT-{YEAR}-{SEQUENCE}
  equipmentId        String
  damageIncidentId   String?   // Optional — routine repairs have no incident
  vendorId           String?   // FK → vendors
  createdBy          String    // User.id
  status             String    @default("pending") // "pending" | "sent_to_vendor" | "in_repair" | "returned" | "unrepairable" | "cancelled"
  sentForRepairAt    DateTime?
  expectedReturnDate DateTime?
  returnedAt         DateTime?
  repairCost         Decimal?  @db.Decimal(10, 2)
  trackingNumber     String?
  repairNotes        String?
  internalNotes      String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  equipment      equipment       @relation(fields: [equipmentId], references: [id])
  damageIncident DamageIncident? @relation(fields: [damageIncidentId], references: [id])
  vendor         vendors?        @relation(fields: [vendorId], references: [id])
  creator        User            @relation("RepairTicketCreator", fields: [createdBy], references: [id])

  @@index([equipmentId])
  @@index([damageIncidentId])
  @@index([vendorId])
  @@index([status])
  @@index([sentForRepairAt])
  @@map("repair_tickets")
}

model DamageInvoice {
  id              String    @id @default(uuid())
  invoiceNumber   String    @unique  // INV-{YEAR}-{SEQUENCE}
  damageIncidentId String
  studentId       String
  guardianId      String    // FK → StudentGuardian (recipient)
  amount          Decimal   @db.Decimal(10, 2)
  dueDate         DateTime
  status          String    @default("draft") // "draft" | "sent" | "paid" | "waived" | "collections"
  sentAt          DateTime?
  paidAt          DateTime?
  sendAttempts    Int       @default(0)
  lastSendError   String?
  notes           String?
  createdBy       String    // User.id
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  damageIncident DamageIncident   @relation(fields: [damageIncidentId], references: [id])
  student        Student          @relation(fields: [studentId], references: [id])
  guardian       StudentGuardian  @relation(fields: [guardianId], references: [id])
  creator        User             @relation("DamageInvoiceCreator", fields: [createdBy], references: [id])
  payments       InvoicePayment[]

  @@index([damageIncidentId])
  @@index([studentId])
  @@index([guardianId])
  @@index([status])
  @@index([dueDate])
  @@map("damage_invoices")
}

model InvoicePayment {
  id            String   @id @default(uuid())
  invoiceId     String
  amount        Decimal  @db.Decimal(10, 2)
  paidAt        DateTime
  paymentMethod String?  // "cash" | "check" | "online" | "other"
  checkNumber   String?
  notes         String?
  recordedBy    String   // User.id
  createdAt     DateTime @default(now())

  invoice    DamageInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  recorder   User          @relation(fields: [recordedBy], references: [id])

  @@index([invoiceId])
  @@index([paidAt])
  @@map("invoice_payments")
}

// ============================================
// STUDENT SIS IMPORT JOB MODELS
// (mirrors InventoryImportJob / InventoryImportItem pattern)
// ============================================

model StudentImportJob {
  id             String              @id @default(uuid())
  fileName       String
  fileUrl        String?
  status         String              @default("pending") // "pending" | "processing" | "completed" | "failed"
  totalRows      Int
  processedRows  Int                 @default(0)
  successCount   Int                 @default(0)
  errorCount     Int                 @default(0)
  errors         Json?
  importedBy     String              // User.id
  importedByName String
  campusId       String?             // If import is campus-scoped
  startedAt      DateTime            @default(now())
  completedAt    DateTime?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt

  user  User                @relation(fields: [importedBy], references: [id])
  items StudentImportItem[]

  @@index([status])
  @@index([importedBy])
  @@index([startedAt])
  @@map("student_import_jobs")
}

model StudentImportItem {
  id           String           @id @default(uuid())
  jobId        String
  studentId    String?          // FK → Student (if created/updated)
  rowNumber    Int
  status       String           // "success" | "error" | "skipped"
  errorMessage String?
  data         Json             // Original row data
  createdAt    DateTime         @default(now())

  job     StudentImportJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  student Student?         @relation(fields: [studentId], references: [id])

  @@index([jobId])
  @@index([status])
  @@map("student_import_items")
}
```

### Changes to Existing Models

Add the following relations to the `equipment` model in `schema.prisma`:

```prisma
// Inside model equipment { ... } — add to relations section:
  deviceAssignments DeviceAssignment[]
  damageIncidents   DamageIncident[]
  repairTickets     RepairTicket[]
```

Add the following relations to the `User` model:

```prisma
// Inside model User { ... } — add to relations section:
  deviceAssignmentsStaff        DeviceAssignment[]  @relation("DeviceAssignmentStaff")
  deviceAssignmentsCheckedOutBy DeviceAssignment[]  @relation("DeviceAssignmentCheckedOutBy")
  deviceAssignmentsReturnedBy   DeviceAssignment[]  @relation("DeviceAssignmentReturnedBy")
  damageIncidentsReported       DamageIncident[]    @relation("DamageIncidentReporter")
  damageIncidentsResolved       DamageIncident[]    @relation("DamageIncidentResolver")
  damageIncidentPhotos          DamageIncidentPhoto[]
  repairTicketsCreated          RepairTicket[]      @relation("RepairTicketCreator")
  damageInvoicesCreated         DamageInvoice[]     @relation("DamageInvoiceCreator")
  invoicePaymentsRecorded       InvoicePayment[]
  studentImportJobs             StudentImportJob[]
```

Add the following relation to the `OfficeLocation` model:

```prisma
// Inside model OfficeLocation { ... }:
  students Student[]
```

Add the following relation to the `vendors` model:

```prisma
// Inside model vendors { ... }:
  repairTickets RepairTicket[]
```

### Migration Strategy

1. Run `npx prisma migrate dev --name add_device_management_module` from `c:\Tech-V2\backend\`
2. The migration will create all new tables and add relation columns to `equipment`, `User`, `OfficeLocation`, `vendors`
3. No data migration required — all new tables start empty
4. Seed new `Permission` records for `CHECKOUT` and `INVOICING` modules in `c:\Tech-V2\backend\prisma\seed.ts`

---

## 4. API Endpoints

### Authentication Conventions (all new routes)
- All routes: `authenticate` middleware first
- All mutation routes: `validateCsrfToken` middleware
- Read: `checkPermission('CHECKOUT', 1)` or `checkPermission('INVOICING', 1)`
- Write: `checkPermission('CHECKOUT', 2)` or `checkPermission('INVOICING', 2)`
- Delete/Admin: `checkPermission('CHECKOUT', 3)` or `requireAdmin`

---

### `/api/students`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/students` | CHECKOUT 1 | List students (paginated, filterable by campusId, grade, isActive, search) |
| `GET` | `/api/students/:id` | CHECKOUT 1 | Get single student with guardians |
| `POST` | `/api/students` | CHECKOUT 2 | Create student manually |
| `PUT` | `/api/students/:id` | CHECKOUT 2 | Update student |
| `DELETE` | `/api/students/:id` | CHECKOUT 3 | Soft delete (set `isActive = false`) |
| `DELETE` | `/api/students/:id/hard` | ADMIN | Hard delete |
| `POST` | `/api/students/import` | CHECKOUT 2 | Upload CSV/Excel → creates `StudentImportJob` |
| `GET` | `/api/students/import/jobs` | CHECKOUT 1 | List import jobs |
| `GET` | `/api/students/import/jobs/:jobId` | CHECKOUT 1 | Get import job status + items |

**GET `/api/students` Query Parameters:**
```
page?: number (default 1)
limit?: number (default 25, max 100)
search?: string (searches firstName, lastName, studentId)
campusId?: string
grade?: string
isActive?: boolean (default true)
sortBy?: "lastName" | "firstName" | "grade" | "studentId" | "createdAt"
sortOrder?: "asc" | "desc"
```

**GET `/api/students` Response Shape:**
```json
{
  "items": [
    {
      "id": "uuid",
      "studentId": "12345",
      "firstName": "Jane",
      "lastName": "Doe",
      "grade": "9",
      "email": "jdoe@students.district.org",
      "campusId": "uuid",
      "campus": { "id": "uuid", "name": "Lincoln High", "code": "LHS" },
      "isActive": true,
      "notes": null,
      "guardians": [],
      "activeAssignments": [],
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-01-15T10:00:00Z"
    }
  ],
  "total": 1850,
  "page": 1,
  "limit": 25,
  "totalPages": 74
}
```

---

### `/api/students/:id/guardians`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/students/:id/guardians` | CHECKOUT 1 | List guardians for student |
| `POST` | `/api/students/:id/guardians` | CHECKOUT 2 | Add guardian |
| `PUT` | `/api/students/:id/guardians/:gid` | CHECKOUT 2 | Update guardian |
| `DELETE` | `/api/students/:id/guardians/:gid` | CHECKOUT 3 | Delete guardian (hard delete — no soft for guardians) |

**POST body schema (Zod v4):**
```typescript
const CreateGuardianSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  relationship: z.enum(['parent', 'guardian', 'grandparent', 'foster_parent', 'other']),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isPrimary: z.boolean().default(false),
  receivesInvoices: z.boolean().default(false),
});
```

---

### `/api/device-assignments`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/device-assignments` | CHECKOUT 1 | List assignments (filterable; active, by student, by equipment) |
| `GET` | `/api/device-assignments/active` | CHECKOUT 1 | List only active (unreturned) assignments |
| `GET` | `/api/device-assignments/:id` | CHECKOUT 1 | Get single assignment |
| `POST` | `/api/device-assignments/checkout` | CHECKOUT 2 | Create checkout (assign device) |
| `POST` | `/api/device-assignments/:id/checkin` | CHECKOUT 2 | Process check-in |
| `GET` | `/api/device-assignments/student/:studentId` | CHECKOUT 1 | All assignments for a student |
| `GET` | `/api/device-assignments/equipment/:equipmentId` | CHECKOUT 1 | Assignment history for a device |
| `GET` | `/api/device-assignments/scan` | CHECKOUT 1 | Barcode/QR lookup (see Section 10) |

**POST `/api/device-assignments/checkout` Body Schema:**
```typescript
const CheckoutSchema = z.object({
  equipmentId: z.string().uuid(),
  assigneeType: z.enum(['student', 'staff']),
  studentId: z.string().uuid().optional(),
  staffUserId: z.string().uuid().optional(),
  checkoutCondition: z.enum(['perfect', 'good', 'fair', 'damaged']),
  notes: z.string().optional(),
}).refine(
  (d) => (d.assigneeType === 'student' ? !!d.studentId : !!d.staffUserId),
  { message: 'Must provide studentId or staffUserId matching assigneeType' }
);
```

**POST `/api/device-assignments/:id/checkin` Body Schema:**
```typescript
const CheckinSchema = z.object({
  returnCondition: z.enum(['perfect', 'good', 'fair', 'damaged']),
  returnNotes: z.string().optional(),
  createDamageIncident: z.boolean().default(false),
});
```

**GET `/api/device-assignments/scan` Query:**
```
barcode?: string
qrCode?: string
assetTag?: string
// At least one required
```

**Scan Response Shape:**
```json
{
  "equipment": {
    "id": "uuid",
    "assetTag": "TECH-1234",
    "name": "Chromebook HP 11 G9",
    "serialNumber": "5CD...",
    "barcode": "123456",
    "qrCode": "qr-abc123",
    "status": "active",
    "condition": "good",
    "brand": "HP",
    "model": "Chromebook 11 G9"
  },
  "activeAssignment": null,
  "lastAssignment": { ... },
  "lastDamageIncident": { ... }
}
```

---

### `/api/damage-incidents`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/damage-incidents` | CHECKOUT 1 | List incidents (filterable by status, severity, equipmentId, studentId, dateRange) |
| `GET` | `/api/damage-incidents/:id` | CHECKOUT 1 | Get incident + photos + linked repair + invoice |
| `POST` | `/api/damage-incidents` | CHECKOUT 2 | Create incident |
| `PUT` | `/api/damage-incidents/:id` | CHECKOUT 2 | Update incident |
| `PATCH` | `/api/damage-incidents/:id/status` | CHECKOUT 2 | Update status only |
| `DELETE` | `/api/damage-incidents/:id` | CHECKOUT 3 | Soft delete (set status to `waived` + resolvedAt) |
| `POST` | `/api/damage-incidents/:id/photos` | CHECKOUT 2 | Upload photos (multipart; max 5) |
| `DELETE` | `/api/damage-incidents/:incidentId/photos/:photoId` | CHECKOUT 3 | Delete photo |

**POST `/api/damage-incidents` Body Schema:**
```typescript
const CreateDamageIncidentSchema = z.object({
  equipmentId: z.string().uuid(),
  assignmentId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  damageType: z.enum([
    'cracked_screen', 'liquid_damage', 'physical_damage',
    'missing_keys', 'missing_charger', 'missing_device', 'other'
  ]),
  severity: z.enum(['minor', 'moderate', 'severe', 'total_loss']),
  description: z.string().optional(),
  estimatedCost: z.number().min(0).optional(),
  autoCreateRepairTicket: z.boolean().default(false),
  autoCreateInvoice: z.boolean().default(false),
  guardianId: z.string().uuid().optional(), // required if autoCreateInvoice = true
});
```

---

### `/api/repair-tickets`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/repair-tickets` | CHECKOUT 1 | List tickets (filterable by status, vendorId, equipmentId) |
| `GET` | `/api/repair-tickets/:id` | CHECKOUT 1 | Get single ticket |
| `POST` | `/api/repair-tickets` | CHECKOUT 2 | Create repair ticket |
| `PUT` | `/api/repair-tickets/:id` | CHECKOUT 2 | Update ticket |
| `PATCH` | `/api/repair-tickets/:id/status` | CHECKOUT 2 | Transition status |
| `DELETE` | `/api/repair-tickets/:id` | CHECKOUT 3 | Cancel ticket (sets status = `cancelled`) |

**PATCH `/api/repair-tickets/:id/status` Body Schema:**
```typescript
const UpdateRepairStatusSchema = z.object({
  status: z.enum(['pending', 'sent_to_vendor', 'in_repair', 'returned', 'unrepairable', 'cancelled']),
  sentForRepairAt: z.string().datetime().optional(),
  expectedReturnDate: z.string().datetime().optional(),
  returnedAt: z.string().datetime().optional(),
  repairCost: z.number().min(0).optional(),
  trackingNumber: z.string().optional(),
  repairNotes: z.string().optional(),
});
```

---

### `/api/invoices`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/invoices` | INVOICING 1 | List invoices (filterable by status, studentId, dueDate range) |
| `GET` | `/api/invoices/:id` | INVOICING 1 | Get invoice + payments |
| `POST` | `/api/invoices` | INVOICING 2 | Create invoice (draft) |
| `PUT` | `/api/invoices/:id` | INVOICING 2 | Update invoice (draft only) |
| `PATCH` | `/api/invoices/:id/status` | INVOICING 2 | Update status |
| `POST` | `/api/invoices/:id/send` | INVOICING 2 | Generate PDF + send email |
| `POST` | `/api/invoices/:id/resend` | INVOICING 2 | Re-send email (rate limited: 10/hour per user) |
| `GET` | `/api/invoices/:id/pdf` | INVOICING 1 | Download invoice PDF (authenticated) |
| `POST` | `/api/invoices/:id/payments` | INVOICING 2 | Record payment |
| `DELETE` | `/api/invoices/:id` | INVOICING 3 | Waive invoice (soft — sets status = `waived`) |

**POST `/api/invoices` Body Schema:**
```typescript
const CreateInvoiceSchema = z.object({
  damageIncidentId: z.string().uuid(),
  studentId: z.string().uuid(),
  guardianId: z.string().uuid(),
  amount: z.number().min(0.01),
  dueDate: z.string().datetime(),
  notes: z.string().optional(),
});
```

**POST `/api/invoices/:id/payments` Body Schema:**
```typescript
const RecordPaymentSchema = z.object({
  amount: z.number().min(0.01),
  paidAt: z.string().datetime(),
  paymentMethod: z.enum(['cash', 'check', 'online', 'other']).optional(),
  checkNumber: z.string().optional(),
  notes: z.string().optional(),
});
```

---

### `/api/checkout-reports`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/checkout-reports/dashboard` | CHECKOUT 1 | All dashboard widget data in one call |
| `GET` | `/api/checkout-reports/student/:id/history` | CHECKOUT 1 | Full student device history |
| `GET` | `/api/checkout-reports/active-checkouts` | CHECKOUT 1 | Active checkouts by campus |
| `GET` | `/api/checkout-reports/damage-summary` | CHECKOUT 1 | Damage by type + severity (date range) |
| `GET` | `/api/checkout-reports/repair-costs` | CHECKOUT 1 | Repair cost by vendor (date range) |
| `GET` | `/api/checkout-reports/invoice-aging` | INVOICING 1 | Invoice aging (30/60/90 day buckets) |

**GET `/api/checkout-reports/dashboard` Response Shape:**
```json
{
  "activeCheckoutsCount": 312,
  "devicesInRepairCount": 18,
  "devicesInRepairAvgDays": 14.2,
  "damageIncidentsThisYear": [
    { "month": "2025-08", "count": 12 },
    { "month": "2025-09", "count": 34 },
    ...
  ],
  "outstandingInvoiceTotal": "4825.00",
  "topDamagedModels": [
    { "modelName": "Chromebook HP 11 G9", "brandName": "HP", "incidentCount": 23 },
    ...
  ]
}
```

---

## 5. New File Structure

### Backend `c:\Tech-V2\backend\src\`

```
validators/
  student.validators.ts
  studentGuardian.validators.ts
  deviceAssignment.validators.ts
  damageIncident.validators.ts
  repairTicket.validators.ts
  invoice.validators.ts
  checkoutReport.validators.ts

services/
  student.service.ts
  studentGuardian.service.ts
  deviceAssignment.service.ts
  damageIncident.service.ts
  repairTicket.service.ts
  invoice.service.ts
  checkoutReport.service.ts
  invoicePdf.service.ts        ← PDF generation (pdfkit)
  invoiceEmail.service.ts      ← Email delivery (nodemailer)

controllers/
  student.controller.ts
  studentGuardian.controller.ts
  deviceAssignment.controller.ts
  damageIncident.controller.ts
  repairTicket.controller.ts
  invoice.controller.ts
  checkoutReport.controller.ts

routes/
  student.routes.ts
  deviceAssignment.routes.ts
  damageIncident.routes.ts
  repairTicket.routes.ts
  invoice.routes.ts
  checkoutReport.routes.ts
```

#### `backend/src/server.ts` — Route Mounts to Add

```typescript
import studentRoutes from './routes/student.routes';
import deviceAssignmentRoutes from './routes/deviceAssignment.routes';
import damageIncidentRoutes from './routes/damageIncident.routes';
import repairTicketRoutes from './routes/repairTicket.routes';
import invoiceRoutes from './routes/invoice.routes';
import checkoutReportRoutes from './routes/checkoutReport.routes';

// Mount after existing routes:
app.use('/api/students', studentRoutes);
app.use('/api/device-assignments', deviceAssignmentRoutes);
app.use('/api/damage-incidents', damageIncidentRoutes);
app.use('/api/repair-tickets', repairTicketRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/checkout-reports', checkoutReportRoutes);
```

### Frontend `c:\Tech-V2\frontend\src\`

```
types/
  student.types.ts
  guardian.types.ts
  deviceAssignment.types.ts
  damageIncident.types.ts
  repairTicket.types.ts
  invoice.types.ts
  checkoutReport.types.ts

services/
  student.service.ts
  guardian.service.ts
  deviceAssignment.service.ts
  damageIncident.service.ts
  repairTicket.service.ts
  invoice.service.ts
  checkoutReport.service.ts

pages/
  DeviceManagement/
    index.tsx                    ← Dashboard / module landing
    StudentsPage.tsx             ← Student list + search
    StudentDetailPage.tsx        ← Student profile + tabs
    StudentImportPage.tsx        ← SIS import UI
    CheckoutPage.tsx             ← Active checkouts list
    CheckoutScanPage.tsx         ← Barcode/QR scan + checkout form
    DamageIncidentsPage.tsx      ← Damage incident list
    DamageIncidentDetailPage.tsx ← Incident detail + photos
    RepairTicketsPage.tsx        ← Repair ticket list
    RepairTicketDetailPage.tsx   ← Ticket detail
    InvoicesPage.tsx             ← Invoice list
    InvoiceDetailPage.tsx        ← Invoice detail + payments
    ReportsPage.tsx              ← Report selection + rendering

  components/DeviceManagement/
    StudentSearchAutocomplete.tsx
    StaffSearchAutocomplete.tsx
    ScannerModal.tsx             ← Camera + manual barcode input
    DeviceStatusChip.tsx
    ConditionChip.tsx
    DamageTypeBadge.tsx
    InvoiceStatusChip.tsx
    RepairStatusStepper.tsx
    GuardianForm.tsx
    PhotoUploadGrid.tsx
    CheckoutForm.tsx
    CheckinForm.tsx
    DashboardWidgets.tsx
```

### Shared `c:\Tech-V2\shared\src\`

Add new shared enums/constants to `c:\Tech-V2\shared\src\types.ts`:

```typescript
// Device management shared types
export type AssigneeType = 'student' | 'staff';
export type CheckoutCondition = 'perfect' | 'good' | 'fair' | 'damaged';
export type DamageType =
  | 'cracked_screen' | 'liquid_damage' | 'physical_damage'
  | 'missing_keys' | 'missing_charger' | 'missing_device' | 'other';
export type DamageSeverity = 'minor' | 'moderate' | 'severe' | 'total_loss';
export type DamageIncidentStatus = 'reported' | 'invoiced' | 'in_repair' | 'resolved' | 'waived';
export type RepairTicketStatus = 'pending' | 'sent_to_vendor' | 'in_repair' | 'returned' | 'unrepairable' | 'cancelled';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'waived' | 'collections';
```

### React Router Routes to Add

Add to frontend router (follow existing routes in `c:\Tech-V2\frontend\src\App.tsx` or equivalent router file):

```tsx
// Under a protected route wrapper:
<Route path="/device-management" element={<DeviceManagementIndex />} />
<Route path="/device-management/students" element={<StudentsPage />} />
<Route path="/device-management/students/import" element={<StudentImportPage />} />
<Route path="/device-management/students/:id" element={<StudentDetailPage />} />
<Route path="/device-management/checkouts" element={<CheckoutPage />} />
<Route path="/device-management/checkouts/scan" element={<CheckoutScanPage />} />
<Route path="/device-management/damage" element={<DamageIncidentsPage />} />
<Route path="/device-management/damage/:id" element={<DamageIncidentDetailPage />} />
<Route path="/device-management/repairs" element={<RepairTicketsPage />} />
<Route path="/device-management/repairs/:id" element={<RepairTicketDetailPage />} />
<Route path="/device-management/invoices" element={<InvoicesPage />} />
<Route path="/device-management/invoices/:id" element={<InvoiceDetailPage />} />
<Route path="/device-management/reports" element={<ReportsPage />} />
```

---

## 6. New Dependencies

### Backend Dependencies

| Package | Version | Purpose | Install Command |
|---------|---------|---------|-----------------|
| `nodemailer` | `^6.9.x` | SMTP email delivery for invoices | `npm install nodemailer` |
| `@types/nodemailer` | `^6.4.x` | TypeScript types for nodemailer | `npm install -D @types/nodemailer` |
| `pdfkit` | `^0.15.x` | PDF invoice generation | `npm install pdfkit` |
| `@types/pdfkit` | `^0.13.x` | TypeScript types for pdfkit | `npm install -D @types/pdfkit` |
| `html-to-text` | `^9.x` | Plain-text email fallback from HTML | `npm install html-to-text` |
| `@types/html-to-text` | `^9.x` | TypeScript types | `npm install -D @types/html-to-text` |
| `express-rate-limit` | `^7.x` | Rate limiting for invoice email endpoints | `npm install express-rate-limit` |

**One-liner install (backend):**
```bash
cd c:\Tech-V2\backend
npm install nodemailer pdfkit html-to-text express-rate-limit
npm install -D @types/nodemailer @types/pdfkit @types/html-to-text
```

### Frontend Dependencies

| Package | Version | Purpose | Install Command |
|---------|---------|---------|-----------------|
| `html5-qrcode` | `^2.3.x` | Browser camera barcode/QR scanning | `npm install html5-qrcode` |

**One-liner install (frontend):**
```bash
cd c:\Tech-V2\frontend
npm install html5-qrcode
```

### PDF Library Justification: `pdfkit` over `puppeteer`

| Criterion | `pdfkit` | `puppeteer` |
|-----------|---------|------------|
| Install size | ~2 MB | ~300 MB (ships Chromium) |
| Windows Server/IIS compatibility | ✅ Native Node.js | ⚠️ Chromium sandbox issues on Windows Server |
| Async performance | Streamed — fast | Launches browser — slow (~1–2s per PDF) |
| HTML template support | Programmatic (code draws PDF) | Full HTML → PDF via headless Chrome |
| Maintenance burden | Low | High (Chromium version pinning) |
| Recommended for | Simple invoice templates | Complex pixel-perfect HTML layouts |

**Decision: Use `pdfkit`.** Invoice templates are structured but simple (table layout). The programmatic API is maintainable. Puppeteer's Chromium binary (~300 MB) and Windows Server sandbox incompatibilities make it unsuitable for this deployment target.

If the HTML-first template approach is required in the future, consider **`@playwright/test`'s PDF export** or **`react-pdf` (`@react-pdf/renderer`)** as alternatives that are lighter than puppeteer.

---

## 7. Frontend Page Map

| File Path | Route | Purpose | Key MUI Components | Key API Calls |
|-----------|-------|---------|-------------------|---------------|
| `pages/DeviceManagement/index.tsx` | `/device-management` | Module dashboard with 5 widgets | `Grid2`, `Card`, `BarChart` (MUI X Charts) | `GET /api/checkout-reports/dashboard` |
| `pages/DeviceManagement/StudentsPage.tsx` | `/device-management/students` | Paginated student list, search, filter by campus/grade | `DataGrid`, `TextField`, `Select`, `Button` | `GET /api/students` |
| `pages/DeviceManagement/StudentDetailPage.tsx` | `/device-management/students/:id` | Student profile: info + guardians tab + device history tab | `Tabs`, `Card`, `DataGrid` | `GET /api/students/:id`, `GET /api/device-assignments/student/:id` |
| `pages/DeviceManagement/StudentImportPage.tsx` | `/device-management/students/import` | SIS CSV/Excel upload, job progress, error table | `Stepper`, `LinearProgress`, `DataGrid` | `POST /api/students/import`, `GET /api/students/import/jobs/:id` |
| `pages/DeviceManagement/CheckoutPage.tsx` | `/device-management/checkouts` | Active checkout list, filter by campus; initiate checkout/checkin | `DataGrid`, `Chip`, `IconButton` | `GET /api/device-assignments/active` |
| `pages/DeviceManagement/CheckoutScanPage.tsx` | `/device-management/checkouts/scan` | Camera scan or manual entry; shows device info; checkout/checkin form | `ScannerModal`, `CheckoutForm` / `CheckinForm`, `Alert` | `GET /api/device-assignments/scan`, `POST /api/device-assignments/checkout`, `POST /api/device-assignments/:id/checkin` |
| `pages/DeviceManagement/DamageIncidentsPage.tsx` | `/device-management/damage` | Damage incident list, filter by status/severity/type | `DataGrid`, `Select`, `DatePicker` | `GET /api/damage-incidents` |
| `pages/DeviceManagement/DamageIncidentDetailPage.tsx` | `/device-management/damage/:id` | Incident detail + photo gallery + linked repair + invoice | `ImageList`, `Stepper`, `Card`, `Button` | `GET /api/damage-incidents/:id`, `POST /api/damage-incidents/:id/photos` |
| `pages/DeviceManagement/RepairTicketsPage.tsx` | `/device-management/repairs` | Repair ticket list, filter by status/vendor | `DataGrid`, `Select` | `GET /api/repair-tickets` |
| `pages/DeviceManagement/RepairTicketDetailPage.tsx` | `/device-management/repairs/:id` | Ticket detail + status stepper + cost fields | `Stepper`, `Card`, `TextField` | `GET /api/repair-tickets/:id`, `PATCH /api/repair-tickets/:id/status` |
| `pages/DeviceManagement/InvoicesPage.tsx` | `/device-management/invoices` | Invoice list, filter by status/due date; aging summary | `DataGrid`, `Chip`, `DatePicker` | `GET /api/invoices` |
| `pages/DeviceManagement/InvoiceDetailPage.tsx` | `/device-management/invoices/:id` | Invoice detail + payment history + PDF download + send/resend | `Card`, `Table`, `Button`, `Dialog` | `GET /api/invoices/:id`, `POST /api/invoices/:id/send`, `GET /api/invoices/:id/pdf`, `POST /api/invoices/:id/payments` |
| `pages/DeviceManagement/ReportsPage.tsx` | `/device-management/reports` | Report selector + rendered data table or chart | `Select`, `DataGrid`, `BarChart`, `DateRangePicker` | `GET /api/checkout-reports/*` |

---

## 8. Permission Matrix

### New Permission Records to Seed

Seed in `c:\Tech-V2\backend\prisma\seed.ts` alongside existing `TECHNOLOGY` permissions:

```typescript
// CHECKOUT module
{ module: 'CHECKOUT', level: 1, name: 'View Checkouts', description: 'View device assignments, student records, repair tickets' },
{ module: 'CHECKOUT', level: 2, name: 'Manage Checkouts', description: 'Create/update checkouts, damage incidents, repair tickets' },
{ module: 'CHECKOUT', level: 3, name: 'Admin Checkouts', description: 'Delete/waive incidents, override statuses, import students' },

// INVOICING module
{ module: 'INVOICING', level: 1, name: 'View Invoices', description: 'View invoices and payments' },
{ module: 'INVOICING', level: 2, name: 'Manage Invoices', description: 'Create invoices, record payments, send emails' },
{ module: 'INVOICING', level: 3, name: 'Admin Invoices', description: 'Waive invoices, hard delete, collections actions' },
```

### Permission Matrix Table

| Action | Module | Level | Default Roles |
|--------|--------|-------|--------------|
| View student list | CHECKOUT | 1 | VIEWER, TECHNICIAN, MANAGER, ADMIN |
| View student detail + guardians | CHECKOUT | 1 | VIEWER, TECHNICIAN, MANAGER, ADMIN |
| Create student manually | CHECKOUT | 2 | TECHNICIAN, MANAGER, ADMIN |
| Update student | CHECKOUT | 2 | TECHNICIAN, MANAGER, ADMIN |
| Deactivate student (soft delete) | CHECKOUT | 3 | MANAGER, ADMIN |
| Hard delete student | ADMIN only | — | ADMIN |
| Import students (SIS) | CHECKOUT | 3 | MANAGER, ADMIN |
| Manage guardians (add/edit/delete) | CHECKOUT | 2 | TECHNICIAN, MANAGER, ADMIN |
| View checkouts (active + history) | CHECKOUT | 1 | VIEWER, TECHNICIAN, MANAGER, ADMIN |
| Create checkout (scan + assign) | CHECKOUT | 2 | TECHNICIAN, MANAGER, ADMIN |
| Process check-in | CHECKOUT | 2 | TECHNICIAN, MANAGER, ADMIN |
| View damage incidents | CHECKOUT | 1 | VIEWER, TECHNICIAN, MANAGER, ADMIN |
| Create damage incident | CHECKOUT | 2 | TECHNICIAN, MANAGER, ADMIN |
| Upload damage photos | CHECKOUT | 2 | TECHNICIAN, MANAGER, ADMIN |
| Waive damage incident | CHECKOUT | 3 | MANAGER, ADMIN |
| View repair tickets | CHECKOUT | 1 | VIEWER, TECHNICIAN, MANAGER, ADMIN |
| Create repair ticket | CHECKOUT | 2 | TECHNICIAN, MANAGER, ADMIN |
| Update repair ticket status | CHECKOUT | 2 | TECHNICIAN, MANAGER, ADMIN |
| Cancel repair ticket | CHECKOUT | 3 | MANAGER, ADMIN |
| View invoices | INVOICING | 1 | VIEWER, TECHNICIAN, MANAGER, ADMIN |
| Create invoice | INVOICING | 2 | TECHNICIAN, MANAGER, ADMIN |
| Send invoice email | INVOICING | 2 | TECHNICIAN, MANAGER, ADMIN |
| Record payment | INVOICING | 2 | TECHNICIAN, MANAGER, ADMIN |
| Waive invoice | INVOICING | 3 | MANAGER, ADMIN |
| View checkout reports / dashboard | CHECKOUT | 1 | VIEWER, TECHNICIAN, MANAGER, ADMIN |
| View invoice aging report | INVOICING | 1 | VIEWER, TECHNICIAN, MANAGER, ADMIN |

> **Note:** `ADMIN` role bypasses all `checkPermission` checks as implemented in the existing `permissions` middleware (`c:\Tech-V2\backend\src\middleware\permissions.ts`).

---

## 9. SIS Import Specification

### Supported Formats
- `.csv` (UTF-8 encoded)
- `.xlsx` / `.xls` (Excel)

### Expected Column Headers

The import processor uses a **flexible column alias map** to accommodate different SIS exports (PowerSchool, Skyward, Infinite Campus, etc.):

| Canonical Field | Accepted Header Aliases (case-insensitive) |
|----------------|-------------------------------------------|
| `studentId` | `student_id`, `sis_id`, `local_id`, `student number`, `ID` |
| `firstName` | `first_name`, `firstname`, `first`, `given_name` |
| `lastName` | `last_name`, `lastname`, `last`, `surname`, `family_name` |
| `grade` | `grade`, `grade_level`, `grade level`, `current grade` |
| `email` | `email`, `student_email`, `email_address` |
| `campusCode` | `campus`, `school`, `campus_code`, `school_code`, `site` |

> **`campusCode`** is mapped to `OfficeLocation.code` or `OfficeLocation.name` to resolve `campusId`. If `campusId` is provided as a query parameter on the import endpoint, it overrides the column for all rows.

### Validation Rules (per row)

| Rule | Field | Error Message |
|------|-------|--------------|
| Required | `studentId` | "Row {n}: studentId is required" |
| Required | `firstName` | "Row {n}: firstName is required" |
| Required | `lastName` | "Row {n}: lastName is required" |
| Max length 20 | `studentId` | "Row {n}: studentId exceeds 20 characters" |
| Valid grade | `grade` | "Row {n}: grade must be K, 1–12, or Pre-K" |
| Valid email | `email` | "Row {n}: email format invalid" |
| Campus resolved | `campusCode` | "Row {n}: campus '{value}' not found" |

### Duplicate Handling

Match on `studentId + campusId` (the unique constraint):
- **Found** → **upsert**: update `firstName`, `lastName`, `grade`, `email`, re-activate if `isActive = false`; do NOT overwrite `notes`
- **Not found** → **insert** as new student

### Error Reporting

Follow the `InventoryImportJob` / `InventoryImportItem` pattern **exactly**:
1. File uploaded to `POST /api/students/import`
2. Backend creates `StudentImportJob` with `status = "pending"`, returns `{ jobId }`
3. Processing runs synchronously in the request (for files < 500 rows) or via `setImmediate` for large files
4. Each row creates a `StudentImportItem` with `status = "success" | "error" | "skipped"` and `errorMessage`
5. `StudentImportJob.errors` JSON field stores summary: `[{ row: 12, message: "..." }, ...]`
6. Frontend polls `GET /api/students/import/jobs/:jobId` every 2 seconds until `status = "completed" | "failed"`
7. Completed job shows: success count, error count, downloadable error list

### Import UI

Reference: `c:\Tech-V2\frontend\src\pages\InventoryManagement.tsx` (import section) for UI patterns to clone:
- `Stepper` with steps: Upload → Processing → Results
- `LinearProgress` during processing
- `DataGrid` showing per-row errors after completion
- Download error report button

---

## 10. Barcode/QR Scanning Spec

### Frontend Camera Scanning

**Library:** `html5-qrcode` (`^2.3.x`)

**Recommended over ZXing because:**
- Zero native dependencies; pure browser JS
- Active maintenance (2024)
- Simple React wrapper pattern
- Works on Chrome/Edge/Firefox on Windows/macOS/iOS/Android

**Integration Pattern:**
```tsx
// components/DeviceManagement/ScannerModal.tsx
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useEffect, useRef } from 'react';

const ScannerModal = ({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );
    scannerRef.current.render(onScan, (err) => { /* suppress scan errors */ });
    return () => { scannerRef.current?.clear(); };
  }, [onScan]);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Scan Device</DialogTitle>
      <DialogContent>
        <div id="qr-reader" style={{ width: '100%' }} />
        <TextField label="Or enter barcode / asset tag manually" fullWidth sx={{ mt: 2 }} />
      </DialogContent>
    </Dialog>
  );
};
```

### Fallback: Manual Entry

- Always show a `TextField` below the camera preview
- User can type barcode number, QR code value, or asset tag
- Submit on Enter key or button press

### Scan Lookup Flow

1. Scan fires → value passed to `GET /api/device-assignments/scan?barcode={value}`
2. Backend searches `equipment` table: `WHERE barcode = ? OR qrCode = ? OR assetTag = ?`
3. Returns device details + active assignment status
4. If **no device found** → show `Alert severity="error"` — "Device not found. Check the asset tag."
5. If **device found + active assignment** → UI shows current assignee + **Check In** button
6. If **device found + no active assignment** → UI shows device info + **Check Out** button

### Backend Scan Endpoint

```typescript
// GET /api/device-assignments/scan
// Query: { barcode?, qrCode?, assetTag? }
// At least one must be provided (Zod refine)

const ScanQuerySchema = z.object({
  barcode: z.string().optional(),
  qrCode: z.string().optional(),
  assetTag: z.string().optional(),
}).refine(
  (d) => d.barcode || d.qrCode || d.assetTag,
  { message: 'Provide at least one of: barcode, qrCode, assetTag' }
);

// Service lookup:
const equipment = await prisma.equipment.findFirst({
  where: {
    OR: [
      barcode ? { barcode } : undefined,
      qrCode ? { qrCode } : undefined,
      assetTag ? { assetTag } : undefined,
    ].filter(Boolean),
    isDisposed: false,
  },
  include: {
    brands: true,
    models: true,
    deviceAssignments: {
      where: { returnedAt: null },
      include: { student: true, staffUser: true },
      take: 1,
    },
    damageIncidents: {
      orderBy: { reportedAt: 'desc' },
      take: 1,
    },
  },
});
```

---

## 11. Email Invoice Specification

### SMTP Environment Variables

Add to `.env` (and document in `c:\Tech-V2\docs\SETUP_COMPLETE.md`):

```env
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false           # true for port 465 (SSL)
SMTP_USER=techsupport@district.org
SMTP_PASS=your_smtp_password
SMTP_FROM="Tech Department <techsupport@district.org>"
SCHOOL_NAME="Your School District"
SCHOOL_LOGO_URL=https://district.org/logo.png   # or local file path
INVOICE_PAYMENT_INSTRUCTIONS="Please make checks payable to: Your School District. Submit to the main office."
INVOICE_DEFAULT_DUE_DAYS=30  # days from sent date
```

### Email Template

HTML email structure:
```
┌─────────────────────────────────────────────┐
│  [SCHOOL_LOGO]   SCHOOL_NAME                │
│  Technology Department                      │
├─────────────────────────────────────────────┤
│  Dear [Guardian First Last],                │
│                                             │
│  A device damage invoice has been issued    │
│  for [Student First Last] (Grade [X]).      │
│                                             │
│  INVOICE DETAILS                            │
│  Invoice #: INV-2026-00142                  │
│  Date: March 3, 2026                        │
│  Due Date: April 2, 2026                    │
│  Amount Due: $125.00                        │
│                                             │
│  DEVICE INFORMATION                         │
│  Asset Tag: TECH-1234                       │
│  Model: HP Chromebook 11 G9                 │
│  Serial: 5CD123456                          │
│                                             │
│  DAMAGE DESCRIPTION                         │
│  [description field]                        │
│                                             │
│  PAYMENT INSTRUCTIONS                       │
│  [INVOICE_PAYMENT_INSTRUCTIONS env var]     │
│                                             │
│  See attached PDF for full invoice details. │
└─────────────────────────────────────────────┘
```

Plain-text fallback generated via `html-to-text` from the HTML string.

### PDF Invoice Sections (pdfkit)

1. **Header**: school name, logo, "INVOICE" title, invoice number, date issued
2. **Bill To**: guardian name, relationship, student name + grade
3. **Device Info**: asset tag, brand, model, serial number
4. **Damage Details**: type, severity, description, reported date
5. **Photo Reference**: list of photo filenames (not embedded — note "See attached photos on file")
6. **Amount Table**: description | quantity | unit price | total
7. **Total Due**: bold, prominent
8. **Due Date**
9. **Payment Instructions**: from env var
10. **Footer**: district address, phone, "Questions? Contact: {SMTP_FROM}"

### Retry Logic

```typescript
// invoice.service.ts — cron job (node-cron, existing dependency)
// Runs every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  const failedInvoices = await prisma.damageInvoice.findMany({
    where: {
      status: 'sent',
      sentAt: null,
      sendAttempts: { lt: 5 },
    },
  });
  for (const invoice of failedInvoices) {
    await invoiceEmailService.send(invoice.id);
  }
});
```

### Delivery Status Tracking

- `sentAt`: set to `new Date()` only after `nodemailer.sendMail()` resolves without error
- `sendAttempts`: incremented on every attempt (success or failure)
- `lastSendError`: set to `error.message` on failure; cleared on success

---

## 12. Implementation Sprints

### Sprint 1 — Foundation: Database + Student Management
**Duration: ~1 week**

**Deliverables:**
1. Prisma schema additions (all 10 new models + existing model relation additions)
2. Migration: `npx prisma migrate dev --name add_device_management_module`
3. Seed: new `Permission` records for CHECKOUT (levels 1–3) and INVOICING (levels 1–3)
4. Backend — Student module:
   - `c:\Tech-V2\backend\src\validators\student.validators.ts`
   - `c:\Tech-V2\backend\src\services\student.service.ts`
   - `c:\Tech-V2\backend\src\controllers\student.controller.ts`
   - `c:\Tech-V2\backend\src\routes\student.routes.ts`
   - Mount in `server.ts`
5. Backend — Guardian sub-resource (nested under `/api/students/:id/guardians`):
   - `studentGuardian.validators.ts`, `.service.ts`, `.controller.ts` (routes nested in `student.routes.ts`)
6. Backend — Student SIS import:
   - `StudentImportJob` service methods in `student.service.ts`
   - `POST /api/students/import` endpoint
7. Frontend — Student module:
   - `frontend/src/types/student.types.ts`, `guardian.types.ts`
   - `frontend/src/services/student.service.ts`, `guardian.service.ts`
   - `StudentsPage.tsx`, `StudentDetailPage.tsx`, `StudentImportPage.tsx`
   - Add routes to router

**Reference Pattern:** Follow `c:\Tech-V2\backend\src\routes\fundingSource.routes.ts` for route structure. Follow `c:\Tech-V2\backend\src\services\` existing service classes.

---

### Sprint 2 — Device Checkout
**Duration: ~1 week**

**Deliverables:**
1. Backend — DeviceAssignment module:
   - `deviceAssignment.validators.ts`, `.service.ts`, `.controller.ts`, `.routes.ts`
   - Checkout business logic: active assignment check, equipment status update
   - Scan endpoint: `GET /api/device-assignments/scan`
   - Mount in `server.ts`
2. Frontend:
   - `frontend/src/types/deviceAssignment.types.ts`
   - `frontend/src/services/deviceAssignment.service.ts`
   - `components/DeviceManagement/ScannerModal.tsx` — `html5-qrcode` integration
   - `components/DeviceManagement/CheckoutForm.tsx`
   - `components/DeviceManagement/CheckinForm.tsx`
   - `CheckoutPage.tsx`, `CheckoutScanPage.tsx`
   - Install `html5-qrcode` frontend dependency
3. Integration: checkout updates `equipment.status` and `equipment.assignedToUserId` (staff) via Prisma transaction

---

### Sprint 3 — Damage Tracking & Repair
**Duration: ~1 week**

**Deliverables:**
1. Backend — DamageIncident module:
   - `damageIncident.validators.ts`, `.service.ts`, `.controller.ts`, `.routes.ts`
   - Photo upload endpoint using `multer` (images only, 5MB limit, max 5 files)
   - Auto-create repair ticket / invoice options
2. Backend — RepairTicket module:
   - `repairTicket.validators.ts`, `.service.ts`, `.controller.ts`, `.routes.ts`
   - Status transition logic with `equipment.status` side-effects
3. Frontend:
   - `damageIncident.types.ts`, `repairTicket.types.ts`
   - `damageIncident.service.ts`, `repairTicket.service.ts`
   - `components/DeviceManagement/PhotoUploadGrid.tsx`
   - `components/DeviceManagement/RepairStatusStepper.tsx`
   - `DamageIncidentsPage.tsx`, `DamageIncidentDetailPage.tsx`
   - `RepairTicketsPage.tsx`, `RepairTicketDetailPage.tsx`
4. Install no new dependencies (multer already exists)

---

### Sprint 4 — Invoicing
**Duration: ~1 week**

**Deliverables:**
1. Install backend dependencies: `nodemailer`, `pdfkit`, `html-to-text`, `express-rate-limit`
2. Backend — PDF service:
   - `c:\Tech-V2\backend\src\services\invoicePdf.service.ts`
   - pdfkit-based invoice template matching spec in Section 11
3. Backend — Email service:
   - `c:\Tech-V2\backend\src\services\invoiceEmail.service.ts`
   - nodemailer transporter with env var config
   - HTML template + plain-text fallback
   - Retry cron job (uses existing `node-cron` dependency)
4. Backend — Invoice module:
   - `invoice.validators.ts`, `.service.ts`, `.controller.ts`, `.routes.ts`
   - Invoice number auto-generation: `INV-{YEAR}-{SEQUENCE}`
   - Payment recording with auto-status update
   - Rate limit on send/resend endpoints
5. Frontend:
   - `invoice.types.ts`, `invoice.service.ts`
   - `InvoicesPage.tsx`, `InvoiceDetailPage.tsx`
   - Add `.env` vars to `.env.example`

---

### Sprint 5 — Dashboard & Reporting
**Duration: ~1 week**

**Deliverables:**
1. Backend — Reports module:
   - `checkoutReport.validators.ts`, `.service.ts`, `.controller.ts`, `.routes.ts`
   - Dashboard aggregate query (single endpoint, returns all 5 widget data)
   - Student device history report
   - Active checkouts by campus
   - Damage by type/severity
   - Repair cost by vendor
   - Invoice aging (30/60/90)
2. Frontend:
   - `checkoutReport.types.ts`, `checkoutReport.service.ts`
   - `components/DeviceManagement/DashboardWidgets.tsx`
   - `pages/DeviceManagement/index.tsx` — module landing with 5 widgets
   - `ReportsPage.tsx` — report selector + rendering
   - Add navigation entry in sidebar for "Device Management" section
3. End-to-end testing of all sprint flows together

---

## 13. Security Considerations

### Authentication & Authorization
- **All** new routes must have `router.use(authenticate)` before any route handler — follow `fundingSource.routes.ts` pattern exactly
- **All** mutation routes (`POST`, `PUT`, `PATCH`, `DELETE`) must have `validateCsrfToken` in the middleware chain
- Use the new `CHECKOUT` and `INVOICING` modules in `checkPermission()` — do **not** reuse `TECHNOLOGY` module for these endpoints (allows fine-grained future permission changes)

### File Upload Security
- Damage photo uploads: restrict MIME type to `image/jpeg`, `image/png`, `image/webp` in multer `fileFilter`
- Max file size: **5 MB per file** (set `limits.fileSize = 5 * 1024 * 1024`)
- Max 5 photos per incident: enforce in service layer before calling multer (count existing photos + new ones ≤ 5)
- SIS import files: restrict to `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`, `text/csv`

### PDF & Invoice Delivery
- `GET /api/invoices/:id/pdf` must require `authenticate` + `INVOICING level 1` — never expose without auth
- Do **not** store PDF files on disk permanently; generate on demand and stream to response
- Invoice email resend rate limit: apply `express-rate-limit` at route level — 10 requests per hour per user IP/user ID:

```typescript
import rateLimit from 'express-rate-limit';
const invoiceSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? req.ip,
  message: { error: 'Too many invoice send attempts. Try again in 1 hour.' },
});
router.post('/:id/send', invoiceSendLimiter, ...);
router.post('/:id/resend', invoiceSendLimiter, ...);
```

### Student & Guardian PII
- Guardian `email` and `phone` are PII — **recommendation**: encrypt at rest using PostgreSQL `pgcrypto` extension or application-layer AES-256 encryption for these two columns in a future hardening sprint
- Restrict student data visibility: users with `CHECKOUT level 1` can view students in **their own `officeLocation`**; MANAGER+ can view all campuses (enforce in service layer via `where campusId IN [user's campus]` for non-admin users)
- SIS import file should be deleted from temp storage after processing

### Email Security
- Validate guardian email format before attempting SMTP send (Zod `z.string().email()` + double-check in service)
- SMTP credentials in `.env` only — never committed to version control
- Add `SMTP_*` vars to `.gitignore` check and document in `docs/SETUP_COMPLETE.md`

### Input Validation
- All route inputs validated with Zod schemas using `validateRequest` middleware (existing pattern)
- `studentId` field: sanitize against SQL injection (Prisma parameterised queries handle this, but also strip leading/trailing whitespace in service)
- Photo filenames: generate server-side UUIDs; never use client-provided filenames in storage paths

---

## 14. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SIS export format varies by school / export source | High | Medium | Flexible column alias mapping (Section 9); clear error messages per row; per-campus import scoping |
| Student data duplicates from repeated SIS imports | High | Medium | Upsert on `studentId + campusId` unique constraint; `skipped` status for unchanged rows |
| Email delivery failures (SMTP config, spam filters) | Medium | High | Retry queue cron (5 attempts, 15-min intervals); `sentAt` null until confirmed; admin can view `lastSendError` |
| Browser camera permissions denied by user or policy | Medium | Low | Manual barcode entry fallback always visible below scanner; graceful error UI if camera unavailable |
| PDF generation blocking the Node event loop | Low | Medium | `pdfkit` streams are non-blocking; for very large batches, use `setImmediate` or a background job queue |
| `html5-qrcode` not supported on older iPads/tablets used in schools | Medium | Medium | Test on district tablet fleet before Sprint 2 go-live; asset tag manual entry covers the fallback |
| Multiple concurrent checkouts attempted for same device (race condition) | Low | High | Use Prisma transaction + unique check: `findFirst({ where: { equipmentId, returnedAt: null } })` inside a `$transaction` with serializable isolation |
| Guardian PII data breach | Low | Critical | Encryption-at-rest recommendation (Section 13); restrict access by permission level; audit logging via existing `inventory_changes` pattern |
| manage1to1 data migration (existing records) | Medium | Medium | Build one-time migration script if district needs historical data; map manage1to1 export fields to new schema; treat as out-of-scope for initial implementation |
| pdfkit learning curve for complex layouts | Low | Low | Use simple table layout (no nested grids); well-documented API with many examples |

---

## 15. Open Questions / Assumptions

### Assumptions Made
1. **One district, multiple campuses**: `OfficeLocation` records represent campuses/schools. A student belongs to exactly one campus at a time. This matches the existing `OfficeLocation` data already in the system.
2. **Grades**: Stored as strings (`"K"`, `"Pre-K"`, `"1"`–`"12"`) to allow non-numeric grades.
3. **Academic year**: Reporting (e.g., dashboard bar chart) uses **August 1 – July 31** as the academic year boundary. This is hardcoded in the report service but should be made configurable.
4. **Invoice payment in full**: When `sum(InvoicePayment.amount) >= DamageInvoice.amount`, the invoice is auto-set to `paid`. Partial payments are allowed.
5. **Single device per checkout**: A student may have multiple active assignments (e.g., original + loaner). There is no hard limit enforced, but the UI will warn if a student already has 2+ active assignments.
6. **Photo storage**: Photos stored in the existing local upload directory (same as `EquipmentAttachment`). If Azure Blob Storage is configured in future, this can be swapped without changing the API.
7. **`equipment.assignedToUserId` (staff only)**: For student checkouts, `equipment.assignedToUserId` is NOT updated (it references `User`, not `Student`). The device-to-student link lives entirely in `DeviceAssignment`. This is by design to keep the existing `User` assignment system intact.
8. **No SSO for guardians**: Guardians do not have system accounts. They receive invoices via email only.
9. **manage1to1 historical data**: Migration of existing manage1to1 historical records is **out of scope** for this implementation. A separate migration script can be built if needed.

### Open Questions for Stakeholder Confirmation

| # | Question | Impact if Unresolved |
|---|----------|---------------------|
| 1 | What SIS system does the district use (PowerSchool, Skyward, Infinite Campus, other)? What is the exact export format? | Affects column alias map in Section 9 |
| 2 | Should damage invoice amounts be editable after creation (before sending)? | Affects invoice update endpoint permissions |
| 3 | Is there a secondary approver required before an invoice is sent to a guardian? | May require an `approved` invoice status and approval workflow |
| 4 | Should staff device checkouts generate damage incidents and invoices, or only student checkouts? | Affects invoice creation flow |
| 5 | What is the district billing address and payment instructions text for invoices? | Required for `INVOICE_PAYMENT_INSTRUCTIONS` env var |
| 6 | Should deactivated (unenrolled) students' assignment history remain visible indefinitely? | Affects data retention policy |
| 7 | Is integration with a payment portal (e.g., MySchoolBucks, RevTrak) required, or is manual payment recording sufficient? | Significant scope increase if portal integration needed |
| 8 | Should the system send automated reminder emails for overdue invoices (e.g., 7 days before due, on due date)? | Requires additional cron job in Sprint 4 |
| 9 | Are damage photos stored locally or should they go to Azure Blob Storage? | Affects `invoicePdf.service.ts` photo reference logic and disk capacity planning |
| 10 | What is the school's preferred way of identifying campuses in the SIS export — by name or by campus code? | Affects SIS column alias mapping for `campusCode` |

---

*Document prepared by: GitHub Copilot (Claude Sonnet 4.6)*
*For implementation by: Tech-V2 SubAgent pipeline*
*Next step: Spawn Sprint 1 implementation subagent using this document as context*
