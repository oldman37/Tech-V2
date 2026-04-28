# Tech-V2 Master Implementation Plan

**Project:** Tech Department Management System v2  
**Last Updated:** March 10, 2026  
**Source of Truth:** This document supersedes all previous planning, progress, and implementation summary docs.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Current System State](#3-current-system-state)
4. [What Is Complete](#4-what-is-complete-)
5. [What Is Partial](#5-what-is-partial-)
6. [What Is Missing — Core System](#6-what-is-missing--core-system)
7. [Manage1to1 Replacement Module](#7-manage1to1-replacement-module)
8. [Database Schema Status](#8-database-schema-status)
9. [Environment & Infrastructure](#9-environment--infrastructure)
10. [Full Implementation Roadmap](#10-full-implementation-roadmap)
11. [Sprint Plan](#11-sprint-plan)
12. [Feature Summary Table](#12-feature-summary-table)
13. [Open Questions for Stakeholders](#13-open-questions-for-stakeholders)
14. [Architecture Notes](#14-architecture-notes)
15. [Reference Specs](#15-reference-specs)

---

## 1. Project Overview

**Tech-V2** is a full-stack TypeScript rewrite of the legacy `wwwroot` PHP system used by the school district's technology department.

The primary goals are:
- Replace 138+ legacy PHP files with a modern, maintainable application
- Migrate from LDAP/MySQL to Microsoft Entra ID / PostgreSQL
- Add new capabilities the legacy system lacks (equipment assignment tracking, manage1to1 replacement, structured RBAC)
- Deploy on Windows Server / IIS

### Systems Being Replaced

| Legacy System | Replacement |
|---|---|
| `wwwroot` PHP + MySQL | Tech-V2 (Express + PostgreSQL) |
| LDAP Active Directory auth | Microsoft Entra ID (OAuth2 + JWT) |
| manage1to1.com SaaS | Native Device Management module (built into Tech-V2) |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, TypeScript, Express 5, Prisma ORM, PostgreSQL |
| **Frontend** | React 19, TypeScript, Vite, Material UI (MUI), TanStack Query, React Router v7, Zustand |
| **Auth** | Microsoft Entra ID (OAuth2) + JWT (HttpOnly cookies) + CSRF tokens |
| **Build** | Both compile to 0 TypeScript errors; Vite bundles in ~1.6s |
| **Deployment Target** | Windows Server / IIS |
| **Email** | Nodemailer (SMTP) |
| **PDF** | pdfkit |
| **Barcode Scanning** | html5-qrcode |

---

## 3. Current System State

**Overall Completion: ~45%**  
**Build Health: ✅ 100%** — 0 TypeScript errors backend and frontend; Prisma schema validates.

**Project Start:** January 12, 2026  
**Foundation phase is done.** The missing layer is entirely the transactional workflow domain.

---

## 4. What Is Complete ✅

These features have working backend routes, controllers, services, and frontend pages.

| Feature | Notes |
|---|---|
| Microsoft Entra ID Auth (OAuth2 + JWT + refresh tokens) | Replaces legacy LDAP |
| CSRF Protection, Rate Limiting, Request Logging | Security improvements over legacy |
| User Management (CRUD + roles + permissions + activate/deactivate) | Full parity with legacy |
| User Supervisor Assignments | New capability vs. legacy |
| Office Locations CRUD + supervisor assignment | Backend complete |
| Room Management (CRUD + stats + by-location) | Replaces `newRoom.php` |
| Equipment / Inventory (CRUD + history + stats) | Much richer than legacy |
| Equipment Assignment (user / room / transfer / bulk / history) | New capability vs. legacy |
| Equipment Import (Excel bulk upload with job tracking) | New capability vs. legacy |
| Equipment Disposal | Replaces `dispose.php` |
| Equipment Disposal Report (`/disposed-equipment`) | Replaces `disposed.php`; filters by date, location, reason; reactivate action |
| Advanced Equipment Search (`/equipment-search`) | Replaces `equipSearch.php`; sortable 14-col table, detail drawer, cascading room filter |
| Funding Sources CRUD | New capability vs. legacy |
| Reference Data (Brands, Models, Categories, Vendors) | Tabbed admin page at `/reference-data`; backend at `GET/POST/PUT/DELETE /api/brands`, `/api/vendors`, `/api/categories`, `/api/equipment-models` |
| My Equipment (user-scoped assigned device view) | New capability vs. legacy |
| Entra ID user sync (cron + manual trigger) | Replaces `adImport.php` |

---

## 5. What Is Partial ⚠️

| Feature | Gap | Effort to Complete |
|---|---|---|
| **Dashboard** | Has 4 inventory stat widgets (Total Items, Active, Disposed, Total Value) and module nav cards via TanStack Query. Missing: open tickets / pending PO counts, recent activity feed | 1 day |

---

## 6. What Is Missing — Core System

### 🔴 CRITICAL — Blocks go-live

#### C1 — Infrastructure Configuration ✅ DONE
- ✅ PostgreSQL configured — `DATABASE_URL` set in `.env`
- ✅ Entra ID app registered — `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`, and all group IDs set
- ✅ Database migrations applied — 13 migrations run through March 3, 2026
- ⏳ Seed script — confirm seed has been run for Permissions table

#### C2 — Reference Data APIs: Brands, Models, Categories, Vendors ✅ DONE
- ✅ Backend: `referenceData.routes.ts` + `referenceData.controller.ts` mounted at `app.use('/api', referenceDataRoutes)`
- ✅ Frontend: `ReferenceDataManagement.tsx` — tabbed CRUD page, routed at `/reference-data`

#### C3 — Purchase Order / Requisition System *(~5–7 days)*
The highest-priority missing business operation. Legacy files: `newRequisition.php`, `issuePO.php`, `approveReq.php`, `changeAccount.php`, `viewPDF.php`, etc.
- **Schema gap**: Add `RequisitionStatusHistory` model for multi-step approval chain (submitted → approved → account assigned → PO issued)
- Backend: `purchase-orders.routes.ts`, `PurchaseOrderController`, `PurchaseOrderService`
- Endpoints: create, list, get, approve/reject, assign account code, issue PO number, generate PDF
- Frontend: Requisition creation form → approval queue → account assignment → PO issuance
- Email: Nodemailer notifications for PO approval and issuance (replaces PHPMailer)

#### C4 — Tech Support Tickets System *(~3–4 days)*
Core daily workflow for tech staff. Legacy files: `newTechOrder.php`, `updateTechOrder.php`, `viewTechSchool.php`, `viewTechSummary.php`, etc.
- **Schema fix**: Add `ticketType` discriminator (`TECH_SUPPORT` | `MAINTENANCE`) to `maintenance_orders`, or create a dedicated `TechTicket` model
- Backend: `tech-orders.routes.ts`, `TechOrderController`, `TechOrderService`
- Frontend: Create ticket, ticket list (by room, by school, county summary), ticket detail + status update

#### C5 — Maintenance Orders System *(~3–4 days)*
Separate workflow for the maintenance department. Legacy files: `newMaintOrder.php`, `updateMaintOrder.php`, `viewMaintSummary.php`, etc.
- Backend: `maintenance.routes.ts`, `MaintenanceController`, `MaintenanceService`
- Frontend: Create maintenance order, order list, status update interface

---

### 🟠 HIGH — First sprint after core is running

#### H1 — Dashboard Enrichment *(~2 days)*
- Stats widgets: open tickets, pending POs, inventory totals, recent disposals
- Recent activity feed
- Quick action buttons (New Ticket, New Requisition, Search Equipment)

#### H2 — Reports & Export System *(~3–4 days)*
Legacy files: `excel.php`, `excelExpenseReport.php`, `expenseReportByProgram.php`, `viewPDF.php`
- Backend: `reports.routes.ts` with Excel expense report by program, Excel inventory export, PO/requisition PDF generation
- Frontend: Reports page with export options

#### H3 — Office Locations Routed Page ✅ DONE
~~Add route in `App.tsx` and nav link. Component already exists.~~
- ✅ `LocationsManagement.tsx` routed at `/locations` (admin-only); "Locations" nav item added to Admin section in `AppLayout.tsx`

#### H4 — Disposal Management Report ✅ DONE
~~Dedicated disposed equipment list page replacing `disposed.php`; filterable by date, reason, location.~~
- ✅ `DisposedEquipment.tsx` at `/disposed-equipment`; filters: date range, location, category, keyword; reactivate; export
- ✅ Backend: `disposedDateFrom`/`disposedDateTo` query params added with `.datetime()` Zod validation

#### H5 — Advanced Equipment Search Page ✅ DONE
~~Standalone search by tag, serial number, PO, vendor, location — replaces `equipSearch.php`.~~
- ✅ `EquipmentSearch.tsx` at `/equipment-search`; sortable 14-col table, pagination, export
- ✅ `EquipmentDetailDrawer.tsx` — right-side slide-in with full item detail + Edit/History buttons
- ✅ `frontend/src/utils/inventoryFormatters.ts` — shared `formatDate`, `formatCurrency`, `getStatusBadgeClass`
- ✅ Backend: `purchaseOrderNumber` added to search OR clause in `inventory.service.ts`

#### H6 — Admin / Settings Page *(~2 days)*
- Entra sync status + manual trigger UI
- Cron job status display
- User bulk operations
- Replaces admin-only API endpoints that have no frontend yet

#### H7 — Email Notifications *(~1–2 days)*
Wire Nodemailer service for PO approval, ticket assignment. Currently unimplemented.

---

### 🟡 MEDIUM — Second sprint, rounds out legacy parity

#### M1 — Schema & Model Cleanup *(~1–2 days)*
- Consolidate dual location models (`locations` vs `OfficeLocation`) — clarify boundary or merge
- Separate tech ticket and maintenance order models or add `ticketType` discriminator
- Add `InventoryAudit` model for year-scoped room inventory snapshots (replaces `inventory[year]`)
- **No new permission seeds here** — `PROFESSIONAL_DEV` already seeded; `CHECKOUT` and `INVOICING` handled in Sprint 1to1-1

#### M2 — Room Inventory Audit Workflow *(~3 days)*
Physical room-by-room checklist replacing `inventory.php`. Flag missing items, record who completed, timestamp. Email reminders for incomplete audits (replaces `unfinishedInventoryEmail.php`).

#### M3 — Food Requisitions *(~4 days)* — requires scope decision
- Schema: Add `FoodRequisition` Prisma model
- Backend: Full service / controller / routes
- Frontend: Creation form, approval queue, food PO issuance, PDF generation

#### M4 — TanStack Query Migration for Inventory ✅ DONE
~~Migrate `InventoryManagement.tsx` to TanStack Query hooks for consistency.~~
- ✅ `hooks/queries/useInventory.ts` — `useInventoryList()` (keepPreviousData) + `useInventoryStats()`
- ✅ `hooks/mutations/useInventoryMutations.ts` — delete, update, create, export, bulk update mutations
- ✅ `InventoryManagement.tsx` migrated — removed 6 server-state vars + 2 useEffect fetches; shared stats cache with Dashboard

---

### 🟢 LOW — Post-launch

| # | Feature | Notes |
|---|---|---|
| L2 | Professional Development module | Entire subsystem — confirm scope |
| L4 | Mobile / PWA optimization | Responsive design + PWA covers legacy Android variants |
| L5 | Swagger / OpenAPI documentation | Documents all API endpoints |
| L6 | Unit + E2E test suite | Currently 0% test coverage |

---

## 7. Manage1to1 Replacement Module

**Decision:** Replace the third-party manage1to1.com SaaS with a native module in Tech-V2.

**Rationale:** Eliminates subscription cost, keeps student data in district-controlled infrastructure, integrates natively with existing inventory/assignment system, enables unified reporting.

**Full spec:** [`docs/SubAgent/manage1to1_integration_spec.md`](SubAgent/manage1to1_integration_spec.md)

### 7.1 Scope of Replacement

| manage1to1.com Feature | Tech-V2 Equivalent |
|---|---|
| Student records | `Student` model (students already synced via existing import) |
| Guardian management | `StudentGuardian` model (multiple per student) |
| Device checkout (student) | `DeviceAssignment` — student assignee type |
| Device checkout (staff) | `DeviceAssignment` — staff assignee type (links to existing `User`) |
| Barcode / QR scan lookup | `GET /api/device-assignments/scan` + `html5-qrcode` frontend library |
| Damage incident logging | `DamageIncident` model + photo uploads |
| Repair ticket workflow | `RepairTicket` model (uses existing `vendors` table) |
| Invoice generation + email | `DamageInvoice` model + pdfkit PDF + nodemailer delivery |
| Payment tracking | `InvoicePayment` model |
| Dashboard widgets | `GET /api/checkout-reports/dashboard` |
| Reporting | `GET /api/checkout-reports/*` |

### 7.2 New Database Models (8 new)

| Model | Purpose |
|---|---|
| `Student` | Student records linked to `OfficeLocation` campus |
| `StudentGuardian` | Multiple guardians per student; `receivesInvoices` flag |
| `DeviceAssignment` | Checkout / check-in record; one active per device |
| `DamageIncident` | Damage reports with type, severity, status progression |
| `DamageIncidentPhoto` | Up to 5 photos per incident (multer, 5 MB max) |
| `RepairTicket` | Repair workflow: pending → sent_to_vendor → in_repair → returned |
| `DamageInvoice` | Invoice lifecycle: draft → sent → paid / waived / collections |
| `InvoicePayment` | Payment records; auto-set invoice to paid when fully collected |

### 7.3 New Permissions to Seed

| Module | Level | Name |
|---|---|---|
| `CHECKOUT` | 1 | View Checkouts & Students |
| `CHECKOUT` | 2 | Manage Checkouts |
| `CHECKOUT` | 3 | Admin Checkouts (delete, override statuses) |
| `INVOICING` | 1 | View Invoices |
| `INVOICING` | 2 | Manage Invoices (create, send, record payment) |
| `INVOICING` | 3 | Admin Invoices (waive, collections) |

### 7.4 New Backend Files

```
backend/src/
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
    invoicePdf.service.ts          ← pdfkit invoice PDF generation
    invoiceEmail.service.ts        ← nodemailer + retry cron
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

### 7.5 New Frontend Pages & Components

```
frontend/src/
  pages/DeviceManagement/
    index.tsx                       ← Module dashboard (5 widgets)
    StudentsPage.tsx
    StudentDetailPage.tsx
    CheckoutPage.tsx
    CheckoutScanPage.tsx            ← Camera scan + checkout/checkin form
    DamageIncidentsPage.tsx
    DamageIncidentDetailPage.tsx
    RepairTicketsPage.tsx
    RepairTicketDetailPage.tsx
    InvoicesPage.tsx
    InvoiceDetailPage.tsx
    ReportsPage.tsx
  components/DeviceManagement/
    ScannerModal.tsx                ← html5-qrcode camera + manual entry
    StudentSearchAutocomplete.tsx
    StaffSearchAutocomplete.tsx
    CheckoutForm.tsx
    CheckinForm.tsx
    GuardianForm.tsx
    PhotoUploadGrid.tsx
    RepairStatusStepper.tsx
    DashboardWidgets.tsx
    DeviceStatusChip.tsx
    ConditionChip.tsx
    DamageTypeBadge.tsx
    InvoiceStatusChip.tsx
```

### 7.6 New Routes in App.tsx

```
/device-management                          ← Dashboard
/device-management/students                 ← Student list
/device-management/students/:id            ← Student detail
/device-management/checkouts               ← Active checkouts
/device-management/checkouts/scan          ← Scan + checkout form
/device-management/damage                  ← Damage incidents
/device-management/damage/:id              ← Incident detail
/device-management/repairs                 ← Repair tickets
/device-management/repairs/:id             ← Ticket detail
/device-management/invoices                ← Invoice list
/device-management/invoices/:id            ← Invoice detail + payments
/device-management/reports                 ← Reports
```

### 7.7 New Dependencies

**Backend:**
```bash
npm install nodemailer pdfkit html-to-text
npm install -D @types/nodemailer @types/pdfkit @types/html-to-text
```

**Frontend:**
```bash
npm install html5-qrcode
```

### 7.8 New Environment Variables Required

```env
# Email (Nodemailer)
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=techsupport@district.org
SMTP_PASS=your_smtp_password
SMTP_FROM="Tech Department <techsupport@district.org>"

# Invoice customization
SCHOOL_NAME="Your School District"
SCHOOL_LOGO_URL=https://district.org/logo.png
INVOICE_PAYMENT_INSTRUCTIONS="Please make checks payable to: Your School District."
INVOICE_DEFAULT_DUE_DAYS=30
```

### 7.9 Implementation Sprints

See [Section 11.2](#112-manage1to1-module-sprints) for detailed sprint breakdown.

---

## 8. Database Schema Status

### Models Fully Implemented (routes + frontend)

`User`, `Permission`, `UserPermission`, `OfficeLocation`, `LocationSupervisor`, `UserSupervisor`, `Room`, `equipment`, `EquipmentAttachment`, `MaintenanceHistory`, `EquipmentAssignmentHistory`, `InventoryImportJob`, `InventoryImportItem`, `InventoryExportJob`, `FundingSource`, `brands`, `models`, `categories`, `vendors`, `inventory_changes`, `locations`, `user_rooms`

> **Note:** There is no separate `Role` model — role is a string field on `User`. The legacy `locations` model (building/room fields) still exists alongside `OfficeLocation`; see schema issue #1 below.

### Models in Schema — No Routes Yet

| Model | Blocker | Priority |
|---|---|---|
| `purchase_orders` + `po_items` | No routes/controller/service | 🔴 C3 |
| `maintenance_orders` | No routes/controller/service — also uses old `locations` FK, not `OfficeLocation` | 🔴 C4/C5 |

### Models Not Yet in Schema

| Model | Feature | Priority |
|---|---|---|
| `FoodRequisition` | Food requisitions subsystem | 🟡 M3 |
| `RequisitionStatusHistory` | PO approval chain tracking | 🔴 C3 |
| `InventoryAudit` | Year-scoped room audit | 🟡 M1 |
| All 8 Manage1to1 models | Device management module | Section 7 |

### Schema Issues to Resolve

1. **Dual location models**: Both `locations` (building/room) and `OfficeLocation` (campus) exist. Clarify boundary; `locations` may be redundant.
2. **Tech ticket vs maintenance order**: `maintenance_orders` currently merges both workflows. Add `ticketType` discriminator or split into two models.
3. **Requisition workflow states**: `purchase_orders.status` + `isApproved` doesn't model the full multi-step approval chain. Add `RequisitionStatusHistory`.
4. **Year-scoped inventory**: Legacy uses `inventory[year]` tables. Add a `schoolYear` field or `InventoryAudit` model.

---

## 9. Environment & Infrastructure

✅ **All infrastructure is fully configured and operational.**

| Item | Status |
|---|---|
| PostgreSQL | ✅ Configured — `DATABASE_URL` set in `.env`; database at `localhost:5432/tech_v2` |
| Entra ID app | ✅ Registered — `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` all set |
| AD group IDs | ✅ Set — `ENTRA_ADMIN_GROUP_ID`, `ENTRA_MANAGER_GROUP_ID`, `ENTRA_TECH_GROUP_ID`, `ENTRA_VIEWER_GROUP_ID` all configured |
| Prisma migrations | ✅ 13 migrations applied through `20260303_add_funding_source_model` |
| Seed data | ✅ Permissions seeded: TECHNOLOGY (3 levels), MAINTENANCE (3 levels), REQUISITIONS (9 levels), PROFESSIONAL_DEV (2 levels), SPECIAL_ED (2 levels), TRANSCRIPTS (2 levels) |
| SMTP / Email | ⏳ Not yet configured — required for C3 (PO notifications) and 1to1-S4 (invoice delivery) |

**Remaining seed items:** `CHECKOUT` (levels 1–3) and `INVOICING` (levels 1–3) — added in Sprint 1to1-1.

---

## 10. Full Implementation Roadmap

Ordered by dependency and business priority.

```
TRACK A — Core Infrastructure (must be first)
  ↓ C1: Configure PostgreSQL + Entra ID, run migrations

TRACK B — Core Business Operations (main legacy parity)
  ✅ C1: Infrastructure configured (PostgreSQL + Entra ID + migrations)
  ✅ C2: Reference Data APIs (Brands/Models/Categories/Vendors) done
  ✅ H3: Route Office Locations page in App.tsx
  ↓ C3: Purchase Order / Requisition backend + frontend
  ↓ C4: Tech Support Tickets backend + frontend
  ↓ C5: Maintenance Orders backend + frontend
  ↓ H1: Dashboard enrichment
  ↓ H2: Reports + Export (Excel/PDF)
  ✅ H4: Disposal Management report
  ✅ H5: Advanced Equipment Search
  ↓ H6: Admin / Settings page
  ↓ H7: Email notifications
  ↓ M1: Schema cleanup
  ↓ M2: Room Inventory Audit workflow
  ↓ M3: Food Requisitions (pending scope decision)

TRACK C — Manage1to1 Replacement (parallel-capable after C1)
  ↓ 1to1-S1: Schema + Student management
  ↓ 1to1-S2: Device Checkout (scan + checkout + checkin)
  ↓ 1to1-S3: Damage Tracking + Repair Tickets
  ↓ 1to1-S4: Invoicing (PDF + email delivery + payments)
  ↓ 1to1-S5: Dashboard widgets + Reporting

TRACK D — Infrastructure & Quality (ongoing / post-launch)
  ↓ L4: Mobile / PWA optimization
  ↓ L5: Swagger / OpenAPI documentation
  ↓ L6: Unit tests + E2E test suite (Playwright)
  ↓ L2: Professional Development (confirm scope)
```

---

## 11. Sprint Plan

### 11.1 Core System Sprints

#### Sprint C-1 — Infrastructure & Reference Data ✅ COMPLETE
- ✅ Configure PostgreSQL, populate `.env` — `DATABASE_URL` confirmed set
- ✅ Register Entra ID app; all auth env vars set — `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`, all group IDs configured
- ✅ Run `prisma migrate dev` — 13 migrations applied (last: `20260303_add_funding_source_model`)
- ✅ CRUD routes + controller for `brands`, `models`, `categories`, `vendors` — `referenceData.routes.ts` + `referenceData.controller.ts` built and mounted in `server.ts` at `app.use('/api', referenceDataRoutes)`
- ✅ Frontend management page — `ReferenceDataManagement.tsx` (tabbed: Brands / Vendors / Categories / Models / Funding Sources) routed at `/reference-data`
- ✅ Route `LocationsManagement.tsx` as `/locations` in `App.tsx` — routed at `/locations` (admin-only); nav link added to AppLayout sidebar

#### Sprint C-2 — Purchase Orders / Requisitions *(~1.5 weeks)*
- Add `RequisitionStatusHistory` model; migrate
- Backend: full PO service + controller + routes (create, list, approve, account assign, issue PO)
- Nodemailer service for PO approval + issuance emails
- Frontend: Requisition wizard → approval queue → PO issuance workflow
- PDF generation for requisitions (pdfkit)

#### Sprint C-3 — Tickets & Maintenance *(~1 week)*
- Schema: add `ticketType` discriminator or split model; migrate
- Backend: tech order service + controller + routes
- Backend: maintenance service + controller + routes
- Frontend: Create/list/detail pages for both ticket types; view by room + school

#### Sprint C-4 — Dashboard, Reports & Admin *(~1 week)*
- Dashboard: stats widgets (open tickets, pending POs, inventory count, recent activity)
- Reports backend: Excel export, expense by program, PO PDF
- Reports frontend: report selector + export UI
- Admin page: Entra sync controls, cron status, user bulk ops
- ✅ Disposal report page — completed early as H4
- ✅ Advanced equipment search page — completed early as H5

#### Sprint C-5 — Schema Cleanup & Audit Workflow *(~1 week)*
- Consolidate `locations` vs `OfficeLocation`
- Add `InventoryAudit` model for year-scoped room inventory
- Room inventory audit workflow frontend (checklist, flag missing)
- Email reminders for incomplete audits
- Seed remaining permissions — `CHECKOUT` and `INVOICING` are handled in Sprint 1to1-1; `PROFESSIONAL_DEV` is already seeded
- Food requisitions (if scoped in)

---

### 11.2 Manage1to1 Module Sprints

> These sprints can run in parallel with Core System sprints C-2 and beyond, after C-1 (infrastructure) is complete.

#### Sprint 1to1-1 — Foundation: Database + Student Management *(~1 week)*
- Add all 8 new Prisma models to `schema.prisma`
- Add relations to `equipment`, `User`, `OfficeLocation`, `vendors` models
- Run migration: `npx prisma migrate dev --name add_device_management_module`
- Seed `CHECKOUT` (levels 1–3) and `INVOICING` (levels 1–3) permissions
- Backend: Student module (`validators`, `service`, `controller`, `routes`)
- Backend: Guardian sub-resource (nested under `/api/students/:id/guardians`)
- Frontend: `StudentsPage.tsx`, `StudentDetailPage.tsx`
- Add device-management routes to router

**Note:** No SIS import needed — students and staff are already imported via the existing Entra ID sync.

**Reference pattern:** follow `fundingSource.routes.ts` for route structure.

#### Sprint 1to1-2 — Device Checkout *(~1 week)*
- Install `html5-qrcode` (`npm install html5-qrcode` in frontend)
- Backend: DeviceAssignment module (validators, service, controller, routes)
  - Checkout business logic (active assignment check, equipment status update in `$transaction`)
  - Scan endpoint: `GET /api/device-assignments/scan?barcode=&qrCode=&assetTag=`
- Frontend: `ScannerModal.tsx` (html5-qrcode + manual fallback text field)
- Frontend: `CheckoutForm.tsx`, `CheckinForm.tsx`, `CheckoutPage.tsx`, `CheckoutScanPage.tsx`

**Business rule:** One active (non-returned) `DeviceAssignment` per device enforced via Prisma transaction.

#### Sprint 1to1-3 — Damage Tracking & Repair Tickets *(~1 week)*
- Backend: DamageIncident module (validators, service, controller, routes)
  - Photo upload endpoint (multer, images only, 5 MB max, max 5 per incident)
  - Auto-create repair ticket / invoice options on incident creation
- Backend: RepairTicket module (validators, service, controller, routes)
  - Status transitions with `equipment.status` side-effects
- Frontend: `DamageIncidentsPage.tsx`, `DamageIncidentDetailPage.tsx`
- Frontend: `RepairTicketsPage.tsx`, `RepairTicketDetailPage.tsx`
- Frontend components: `PhotoUploadGrid.tsx`, `RepairStatusStepper.tsx`

**Status flows:**
- Damage: `reported → invoiced → in_repair → resolved` (or `waived`)
- Repair: `pending → sent_to_vendor → in_repair → returned` (or `unrepairable` / `cancelled`)

#### Sprint 1to1-4 — Invoicing *(~1 week)*
- Install backend deps: `npm install nodemailer pdfkit html-to-text` + types
- `invoicePdf.service.ts` — pdfkit invoice template (10 sections per spec)
- `invoiceEmail.service.ts` — nodemailer transporter + HTML/plain-text email + retry cron (every 15 min, up to 5 attempts)
- Backend: Invoice module (validators, service, controller, routes)
  - Invoice number auto-generation: `INV-{YEAR}-{SEQUENCE}`
  - Rate limit on send/resend: 10 per hour per user
- Frontend: `InvoicesPage.tsx`, `InvoiceDetailPage.tsx` (with payment history + PDF download + send/resend)
- Add SMTP env vars to `.env.example`

**Invoice number sequence:** `INV-{YEAR}-{padded 5-digit sequence}` scoped per calendar year.

#### Sprint 1to1-5 — Dashboard Widgets & Reporting *(~1 week)*
- Backend: CheckoutReport module (dashboard aggregate + 5 report endpoints)
- Frontend: `DashboardWidgets.tsx` (5 widgets using MUI X Charts)
- Frontend: `pages/DeviceManagement/index.tsx` — module landing page
- Frontend: `ReportsPage.tsx` — report selector + data table / chart rendering
- Add "Device Management" section to sidebar navigation
- End-to-end testing of all Sprint 1–5 flows

**Dashboard widgets:**
1. Devices currently checked out (count)
2. Devices in repair (count + avg days outstanding)
3. Damage incidents this academic year (bar chart by month)
4. Outstanding invoice total ($)
5. Top 5 damaged device models

---

## 12. Feature Summary Table

| Feature | Backend | Frontend | Status |
|---|---|---|---|
| **Authentication (Entra ID)** | ✅ | ✅ | ✅ DONE |
| **User Management** | ✅ | ✅ | ✅ DONE |
| **Supervisor Assignments** | ✅ | ✅ | ✅ DONE |
| **Room Management** | ✅ | ✅ | ✅ DONE |
| **Equipment / Inventory** | ✅ | ✅ | ✅ DONE |
| **Equipment Assignment** | ✅ | ✅ | ✅ DONE |
| **Equipment Import (Excel)** | ✅ | ✅ | ✅ DONE |
| **Equipment Disposal** | ✅ | ✅ | ✅ DONE |
| **Equipment Disposal Report** | ✅ | ✅ | ✅ DONE |
| **Advanced Equipment Search** | ✅ | ✅ | ✅ DONE |
| **Office Locations** | ✅ | ✅ | ✅ DONE |
| **Funding Sources** | ✅ | ✅ | ✅ DONE |
| **My Equipment** | ✅ | ✅ | ✅ DONE |
| **Dashboard** | ✅ Auth + stats API | ⚠️ Has inventory stats (4 widgets) + module nav cards; missing tickets/PO counts + activity feed | ⚠️ PARTIAL |
| **Reference Data (Brands/Models/Categories/Vendors)** | ✅ | ✅ | ✅ DONE |
| **Purchase Orders / Requisitions** | ❌ | ❌ | 🔴 MISSING |
| **Tech Support Tickets** | ❌ | ❌ | 🔴 MISSING |
| **Maintenance Orders** | ❌ | ❌ | 🔴 MISSING |
| **Reports / Excel Export** | ❌ | ❌ | 🔴 MISSING |
| **PDF Generation (POs)** | ❌ | ❌ | 🔴 MISSING |
| **Email Notifications** | ❌ | ❌ | 🔴 MISSING |
| **Admin / Settings Page** | Route only | ❌ | 🔴 MISSING |
| **Room Inventory Audit** | ❌ | ❌ | 🟡 MISSING |
| **Food Requisitions** | ❌ (no schema) | ❌ | 🟡 MISSING (scope TBD) |
| **Student Management (1to1)** | ❌ | ❌ | 📋 PLANNED |
| **Device Checkout (1to1)** | ❌ | ❌ | 📋 PLANNED |
| **Damage Incidents (1to1)** | ❌ | ❌ | 📋 PLANNED |
| **Repair Tickets (1to1)** | ❌ | ❌ | 📋 PLANNED |
| **Invoicing / Email (1to1)** | ❌ | ❌ | 📋 PLANNED |
| **Device Mgmt Reports (1to1)** | ❌ | ❌ | 📋 PLANNED |
| **Professional Development** | ❌ | ❌ | 🟢 OUT OF SCOPE? |
| **Test Suite (Unit + E2E)** | ❌ | ❌ | 🟢 POST-LAUNCH |

---

## 13. Open Questions for Stakeholders

| # | Question | Affects |
|---|---|---|
| 1 | ~~PostgreSQL connection details~~ | ✅ Resolved |
| 2 | ~~Azure tenant ID and Entra ID app registration~~ | ✅ Resolved |
| 3 | Is the Professional Development module in scope for Tech-V2? | L2 prioritization |
| 4 | Is food requisition in scope? (Separate from regular POs — ties to cafeteria/nutrition) | M3 prioritization |
| 5 | What SIS system is used (PowerSchool, Skyward, Infinite Campus)? What is the export format? | 1to1-S1: SIS import column mapping |
| 6 | Should damage invoices require an approver before being sent to guardians? | 1to1-S4: May need `approved` invoice status |
| 7 | Should staff device checkouts generate damage incidents and invoices, or only student checkouts? | 1to1-S3/S4 flow |
| 8 | What is the district billing address and payment instructions text for invoices? | `INVOICE_PAYMENT_INSTRUCTIONS` env var |
| 9 | Should automated reminder emails be sent for overdue invoices (e.g., 7 days before due)? | 1to1-S4: Additional cron job |
| 10 | Are damage photos stored locally (same server) or should Azure Blob Storage be used? | 1to1-S3: Storage config + disk capacity |
| 11 | Is integration with an online payment portal (MySchoolBucks, RevTrak) required, or is manual payment recording sufficient? | Significant scope increase if portal needed |
| 12 | Should manage1to1 historical records be migrated, or does the new system start fresh? | 1to1 data migration script |
| 13 | What is the academic year boundary (default assumed August 1 – July 31)? | 1to1-S5: Report date scoping |

---

## 14. Architecture Notes

### API Conventions (all routes must follow)
- `router.use(authenticate)` before all route handlers
- `validateCsrfToken` on all mutation routes (POST, PUT, PATCH, DELETE)
- `checkPermission(module, level)` for authorization — use the appropriate module (`TECHNOLOGY`, `CHECKOUT`, `INVOICING`, etc.)
- Request body validated with Zod via `validateRequest` middleware

### File Upload Pattern
Follow the existing `InventoryImportJob` / multer pattern for all file uploads (SIS import, damage photos, equipment attachments).

### Import Job Pattern
All async file imports (SIS students, inventory) follow the same pattern:
1. `POST /api/.../import` → creates job record with `status = "pending"`, returns `{ jobId }`
2. Processing runs synchronously for small files or via `setImmediate` for large files
3. Per-row `importItem` records created with `success | error | skipped` status
4. Frontend polls job status endpoint every 2 seconds until `completed | failed`

### Prisma Transaction Pattern
Use `prisma.$transaction()` for any multi-table write to prevent partial states (e.g., checkout that also updates `equipment.status`).

### TanStack Query Usage
New features should use TanStack Query hooks (`useQuery`, `useMutation`) for all API data. Existing `InventoryManagement.tsx` should be migrated to this pattern when time allows (M4).

### PDF Generation
Use `pdfkit` (not `puppeteer`). Reasons: ~2 MB install vs ~300 MB, no Chromium sandbox issues on Windows Server, streamed output (non-blocking), adequate for structured invoice layouts.

### Email
`nodemailer` for all outbound email. SMTP configuration via `.env`. Retry logic via existing `node-cron` dependency.

---

## 15. Reference Specs

These documents in `docs/SubAgent/` contain detailed specifications used by implementation subagents:

| Spec File | Feature Area |
|---|---|
| [`manage1to1_integration_spec.md`](SubAgent/manage1to1_integration_spec.md) | Full manage1to1 replacement module — DB schema, API endpoints, frontend page map, permission matrix, SIS import spec, barcode scanning, email/PDF invoice spec, sprint breakdown, security, risks |
| [`inventory_system_spec.md`](SubAgent/inventory_system_spec.md) | Inventory management system |
| [`equipment_assignment_system_spec.md`](SubAgent/equipment_assignment_system_spec.md) | Equipment assignment system |
| [`funding_source_management_spec.md`](SubAgent/funding_source_management_spec.md) | Funding source CRUD |
| [`room_management_pagination_spec.md`](SubAgent/room_management_pagination_spec.md) | Room management + pagination |
| [`token_storage_security_spec.md`](SubAgent/token_storage_security_spec.md) | JWT + token security |
| [`service_layer_implementation_spec.md`](SubAgent/service_layer_implementation_spec.md) | Service layer architecture |
| [`logging_system_spec.md`](SubAgent/logging_system_spec.md) | Structured logging system |
| [`codebase_audit_review_feb2026.md`](SubAgent/codebase_audit_review_feb2026.md) | Feb 2026 full codebase audit (87.5% health score, 0 compile errors) |

---

*This document is the single source of truth for all planning. Update it as features are completed.*
