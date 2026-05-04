# Field Trip PDF Export — Specification

**Document status:** Phase 1 Research & Specification  
**Author:** GitHub Copilot (Sub-Agent)  
**Date:** 2026-05-04  
**Codebase root:** `c:\Tech-V2`

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [PDF Document Design](#2-pdf-document-design)
3. [Recommended PDF Library Choice](#3-recommended-pdf-library-choice)
4. [Backend Implementation Plan](#4-backend-implementation-plan)
5. [Frontend Implementation Plan](#5-frontend-implementation-plan)
6. [New npm Dependencies](#6-new-npm-dependencies)
7. [Authentication & Authorization Requirements](#7-authentication--authorization-requirements)
8. [Security Considerations](#8-security-considerations)
9. [Ordered Implementation Steps](#9-ordered-implementation-steps)
10. [File Paths to Create / Modify](#10-file-paths-to-createmodify)

---

## 1. Current State Analysis

### 1.1 Field Trip Module Overview

The field trip approval workflow is a fully-implemented multi-stage approval system with the following layers:

| Layer | Files |
|-------|-------|
| Controller | `backend/src/controllers/fieldTrip.controller.ts` |
| Controller (Transport) | `backend/src/controllers/fieldTripTransportation.controller.ts` |
| Routes | `backend/src/routes/fieldTrip.routes.ts` |
| Service | `backend/src/services/fieldTrip.service.ts` |
| Service (Transport) | `backend/src/services/fieldTripTransportation.service.ts` |
| Frontend Pages | `frontend/src/pages/FieldTrip/` (7 files) |
| Frontend Components | `frontend/src/components/fieldtrip/` (2 files) |
| Frontend Service | `frontend/src/services/fieldTrip.service.ts` |
| Types | `frontend/src/types/fieldTrip.types.ts` |
| DB Models | `backend/prisma/schema.prisma` — `FieldTripRequest`, `FieldTripApproval`, `FieldTripStatusHistory`, `FieldTripTransportationRequest` |

### 1.2 Approval Workflow

```
DRAFT
  └─► PENDING_SUPERVISOR       (Level 3 — Supervisor)
        └─► PENDING_ASST_DIRECTOR  (Level 4 — Asst. Director of Schools)
              └─► PENDING_DIRECTOR        (Level 5 — Director of Schools)
                    └─► PENDING_FINANCE_DIRECTOR  (Level 6 — Finance Director)
                              └─► APPROVED
  Any pending state ──────────────────────────────────► DENIED
```

If the submitter has no supervisor, the first pending state is `PENDING_ASST_DIRECTOR`.

### 1.3 Existing PDF Infrastructure

PDFKit is **already installed** in the backend:

```json
// backend/package.json
"pdfkit": "^0.17.2"
"@types/pdfkit": "^0.17.5"
```

An established server-side PDF pattern exists for Purchase Orders:

| Component | Path |
|-----------|------|
| PDF rendering service | `backend/src/services/pdf.service.ts` |
| PO service PDF method | `purchaseOrder.service.ts` → `generatePOPdf(id)` |
| Controller handler | `purchaseOrder.controller.ts` → `getPurchaseOrderPdf` |
| Route | `GET /api/purchase-orders/:id/pdf` |
| Frontend service | `purchaseOrder.service.ts` → `downloadPdf(id)` |

The frontend PDF download pattern uses `axios` with `responseType: 'blob'` and a synthesized `<a>` element to trigger the browser download. **No frontend PDF library is needed.**

### 1.4 Existing Font Asset

The FreestyleScript cursive font used for PO signature blocks is already present at:

```
backend/src/assets/fonts/FreestyleScript.ttf
```

This will be reused for field trip approval signature blocks.

### 1.5 Authentication Pattern

All routes use:
- `authenticate` middleware (validates JWT from Microsoft Entra ID)
- `requireModule('FIELD_TRIPS', <level>)` for permission gates
- `validateCsrfToken` on all state-changing routes (GET does not require CSRF)

The PDF route is a read-only GET, so it requires `authenticate` and `requireModule('FIELD_TRIPS', 2)` only — no CSRF token needed.

### 1.6 Permission Levels (Field Trips Module)

| Level | Role | Access |
|-------|------|--------|
| 2 | All Staff | View own requests |
| 3 | Supervisor | View all requests, approve at PENDING_SUPERVISOR |
| 4 | Asst. Director of Schools | Approve at PENDING_ASST_DIRECTOR |
| 5 | Director of Schools | Approve at PENDING_DIRECTOR |
| 6 | Finance Director / Admin | Approve at PENDING_FINANCE_DIRECTOR |

Same access rule as `getById`: the submitter (Level 2) can access their own trip; Level 3+ can see all. The PDF endpoint uses the same gate.

### 1.7 What Does NOT Currently Exist

- No `GET /api/field-trips/:id/pdf` route
- No field trip PDF generation function in any service
- No "Download PDF" button on `FieldTripDetailPage.tsx`
- No `downloadPdf` method in `frontend/src/services/fieldTrip.service.ts`

---

## 2. PDF Document Design

### 2.1 Page Layout

- **Size:** US Letter (8.5" × 11"), portrait
- **Margin:** 50 pt on all sides
- **Font family:** Helvetica (regular + bold, built into PDFKit — no embed needed)
- **Signature font:** FreestyleScript.ttf (already embedded for PO PDFs)
- **Primary color:** `#1565C0` (same as PO PDFs — brand consistency)
- **Multi-page support:** PDFKit auto-pages; no manual pagination logic needed

### 2.2 Document Sections (top to bottom)

#### Section 0 — Document Header
```
┌────────────────────────────────────────────────┐
│  FIELD TRIP REQUEST                   [STATUS] │
│  Technology Department                          │
├────────────────────────────────────────────────┤
│  Request ID: <uuid-short>     Fiscal Year: FY26 │
│  Generated: May 4, 2026                        │
└────────────────────────────────────────────────┘
```

Fields:
- Document title: **"FIELD TRIP REQUEST"** (bold, 18pt, primary color)
- Status chip: rendered as a filled rectangle with white text (colors mirror MUI Chip colors)
- Request short ID: last 8 chars of UUID for brevity
- Fiscal Year: `fiscalYear` field (if set)
- Generated timestamp: `new Date().toLocaleString('en-US')`

---

#### Section 1 — Trip Information

Two-column grid layout (left/right halves), matching how PO vendor/requester blocks are laid out.

| Field | DB column |
|-------|-----------|
| Teacher / Sponsor | `teacherName` |
| School / Building | `schoolBuilding` |
| Grade / Class | `gradeClass` |
| Subject Area | `subjectArea` (optional) |
| Number of Students | `studentCount` |
| Trip Date | `tripDate` (formatted long: "Monday, June 2, 2026") |
| Overnight Trip | `isOvernightTrip` (Yes/No) |
| Return Date | `returnDate` (if overnight) |
| Destination | `destination` |
| Destination Address | `destinationAddress` (optional) |
| Departure Time | `departureTime` |
| Return Time | `returnTime` |

Full-width text fields (below the grid):
- **Educational Purpose / Course Connection:** `purpose`
- **Preliminary Activities:** `preliminaryActivities` (if present)
- **Follow-up Activities:** `followUpActivities` (if present)

---

#### Section 2 — Logistics & Costs

| Field | DB column |
|-------|-----------|
| Transportation Needed | `transportationNeeded` (Yes/No) |
| Student Transportation | `alternateTransportation` (if not using buses) |
| Transportation Details | `transportationDetails` (if using buses) |
| Cost Per Student | `costPerStudent` (formatted as `$0.00`) |
| Total Cost | `totalCost` (formatted as `$0.00`) |
| Funding Source | `fundingSource` (optional) |

---

#### Section 3 — Additional Details

| Field | DB column |
|-------|-----------|
| Rain / Alternate Date | `rainAlternateDate` (optional) |
| Substitutes Needed | `substituteCount` (optional) |
| Parental Permission Received | `parentalPermissionReceived` (Yes/No) |
| Plans for Non-Participants | `plansForNonParticipants` (optional) |
| Chaperones | `chaperones` JSON array — each row: `Name  [✓ Background check complete]` or `Name  [— Pending]` |
| Legacy Chaperone Info | `chaperoneInfo` — only if `chaperones` array is empty/null |
| Emergency Contact | `emergencyContact` |
| Instructional Time Missed | `instructionalTimeMissed` |
| Reimbursement Expenses | `reimbursementExpenses[]` — comma-separated chips |
| Overnight Safety Precautions | `overnightSafetyPrecautions` (if overnight) |
| Additional Notes | `additionalNotes` |

---

#### Section 4 — Submission Information

| Field | DB column |
|-------|-----------|
| Submitted By | `submittedBy.displayName` or `firstName + lastName` |
| Submitter Email | `submitterEmail` |
| Created | `createdAt` |
| Submitted | `submittedAt` |
| Approved | `approvedAt` (if APPROVED) |
| Denial Reason | `denialReason` (if DENIED) — displayed in a shaded alert box |

---

#### Section 5 — Transportation Request Summary (conditional)

Only rendered when a `transportationRequest` relation exists and its status is not DRAFT.

| Field | DB column (`FieldTripTransportationRequest`) |
|-------|----------------------------------------------|
| Status | `status` (displayable label) |
| Number of Buses | `busCount` |
| Chaperones on Bus | `chaperoneCount` |
| Driver | `needsDriver` → "District Driver" / `driverName` |
| Loading Location | `loadingLocation` |
| Loading Time | `loadingTime` |
| Arrive First Destination | `arriveFirstDestTime` |
| Depart Last Destination | `leaveLastDestTime` |
| Transportation Type | `transportationType` (Part C, if set) |
| Transportation Cost | `transportationCost` (Part C, if set) |

---

#### Section 6 — Approval History

A timeline/table of all `FieldTripApproval` records, ordered by `actedAt` asc.

Each row:
```
Stage: SUPERVISOR          Action: APPROVED
Approved by: Jane Smith    Date: May 1, 2026 at 10:30 AM
Notes: Looks good.
```

For DENIED records, show `denialReason` below the row in a light-red shaded box.

---

#### Section 7 — Signature Blocks

Four signature blocks in a row (or 2+2 if page is narrow), one per approval stage:

```
  [FreestyleScript name if approved]
  ________________________________   ________________________________
  Supervisor                         Asst. Director of Schools
  May 1, 2026                        May 2, 2026

  ________________________________   ________________________________
  Director of Schools                Finance Director
```

Rules:
- If a stage has been APPROVED, render the `actedByName` in FreestyleScript above the line and `actedAt` date below the role label
- If a stage was DENIED at this stage, show "DENIED" in red above the line
- If a stage is still pending, leave the line blank

---

### 2.3 Visual Conventions

| Element | Rule |
|---------|------|
| Section headers | Bold, 10pt, primary color `#1565C0` |
| Field labels | Caption style, 8pt, `#616161` (grey) |
| Field values | Regular, 9pt, `#212121` (near-black) |
| Horizontal rules | 0.5pt, `#BDBDBD` |
| Label+value grid | Two-column using absolute `x` positioning (same technique as PO PDF) |
| Conditional fields | Omitted entirely when null/empty (no blank rows) |
| Boolean yes/no | Rendered as "Yes" / "No" |
| Status |Rendered in colored rectangle: APPROVED=green `#2E7D32`, DENIED=red `#C62828`, PENDING_*=blue `#1565C0`, DRAFT=grey `#616161` |

---

## 3. Recommended PDF Library Choice

### Decision: **PDFKit (server-side) — already installed**

PDFKit (`pdfkit@0.17.2`) is already a production dependency in `backend/package.json`. The codebase already has a battle-tested pattern for server-side PDF rendering in `backend/src/services/pdf.service.ts` that generates PO PDFs.

**Why server-side over client-side:**

| Criterion | Server-side (PDFKit) | Client-side (jsPDF/react-pdf) |
|-----------|---------------------|-------------------------------|
| Library already installed | ✅ Yes | ❌ No — new dep required |
| Consistent, auditable output | ✅ Server controls format | ❌ Browser environment differences |
| No sensitive data in browser | ✅ Data stays server-side | ❌ All approval data sent to frontend first |
| Works for admins printing on behalf | ✅ | ✅ |
| No CORS/CSP complications | ✅ | ❌ |
| FreestyleScript font already embedded | ✅ | ❌ Would need re-bundling |
| Existing codebase pattern | ✅ Direct: copy PO pattern | ❌ New pattern to establish |

**Why not Puppeteer:**
Puppeteer (headless Chrome) is powerful for pixel-perfect HTML→PDF conversion but introduces a heavy (~300 MB) binary dependency, requires a writable filesystem in Docker, and is overkill when PDFKit already produces a correctly-structured output for this text-heavy document.

**Why not react-pdf:**
`@react-pdf/renderer` requires a separate React render tree and adds ~2 MB to the frontend bundle. Since the codebase pattern is already server-side PDF with blob download, adding a client-side library would create two divergent patterns with no benefit.

**Conclusion:** Use PDFKit following the exact existing pattern from `pdf.service.ts`. Zero new npm dependencies.

---

## 4. Backend Implementation Plan

### 4.1 New function: `generateFieldTripPdf`

**File to create:** `backend/src/services/fieldTripPdf.service.ts`

This file mirrors `pdf.service.ts` exactly in structure — a standalone module exporting a pure function that takes a fully-hydrated trip object and returns `Promise<Buffer>`.

```typescript
// Sketch — see full implementation in Section 10

import PDFDocument from 'pdfkit';
import path from 'path';

export interface FieldTripForPdf {
  // ... (flattened type matching the Prisma include used by the service method)
}

export async function generateFieldTripPdf(trip: FieldTripForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Render sections 0–7 in sequence
    renderHeader(doc, trip);
    renderTripInfo(doc, trip);
    renderLogistics(doc, trip);
    renderAdditionalDetails(doc, trip);
    renderSubmissionInfo(doc, trip);
    renderTransportationSummary(doc, trip);
    renderApprovalHistory(doc, trip);
    renderSignatureBlocks(doc, trip);

    doc.end();
  });
}
```

**Prisma include shape** needed (to be fetched in the service method):
```typescript
const TRIP_PDF_INCLUDE = {
  submittedBy: {
    select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
  },
  approvals: {
    orderBy: { actedAt: 'asc' as const },
  },
  statusHistory: {
    orderBy: { changedAt: 'asc' as const },
  },
  transportationRequest: true,   // full record; null if not created
} as const;
```

### 4.2 New method: `FieldTripService.generatePdf`

**File to modify:** `backend/src/services/fieldTrip.service.ts`

Add a new method to the `FieldTripService` class following the PO pattern:

```typescript
async generatePdf(userId: string, id: string, permLevel: number): Promise<Buffer> {
  // Re-use getById access control to enforce same permission rules as the detail view
  const trip = await this.getById(userId, id, permLevel);   // already throws NotFoundError / AuthorizationError
  
  // Hydrate transportation request if exists
  const fullTrip = await prisma.fieldTripRequest.findUniqueOrThrow({
    where: { id },
    include: TRIP_PDF_INCLUDE,
  });

  return generateFieldTripPdf(fullTrip);
}
```

> Note: `getById` already enforces the access control (own trip for Level 2, all for Level 3+). Calling it first ensures the authorization check is centralized and not duplicated.

### 4.3 New controller handler: `getFieldTripPdf`

**File to modify:** `backend/src/controllers/fieldTrip.controller.ts`

Add at the bottom, following the `getPurchaseOrderPdf` pattern exactly:

```typescript
// ---------------------------------------------------------------------------
// GET /api/field-trips/:id/pdf
// ---------------------------------------------------------------------------

export const getFieldTripPdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id        = req.params.id as string;
    const userId    = req.user!.id;
    const permLevel = req.user!.permLevel ?? 1;
    const buffer    = await fieldTripService.generatePdf(userId, id, permLevel);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="FieldTrip-${id.slice(-8)}.pdf"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

### 4.4 New route: `GET /api/field-trips/:id/pdf`

**File to modify:** `backend/src/routes/fieldTrip.routes.ts`

Add after the existing `GET /:id` route (before the workflow action routes):

```typescript
/**
 * GET /api/field-trips/:id/pdf
 * Generate and download a PDF of the field trip request.
 * Access: same as getById — own trip for Level 2+; all trips for Level 3+.
 * No CSRF required (read-only GET).
 */
router.get(
  '/:id/pdf',
  validateRequest(FieldTripIdParamSchema, 'params'),
  requireModule('FIELD_TRIPS', 2),
  fieldTripController.getFieldTripPdf,
);
```

> **Position matters:** Register before `/:id/submit`, `/:id/approve`, `/:id/deny` but after `GET /:id`. The express router will match `/pdf` literally before any dynamic `:action` segments because it follows registration order.

---

## 5. Frontend Implementation Plan

### 5.1 New service method: `fieldTripService.downloadPdf`

**File to modify:** `frontend/src/services/fieldTrip.service.ts`

Add after the `delete` method, copying the PO pattern exactly:

```typescript
// ---------------------------------------------------------------------------
// PDF download
// ---------------------------------------------------------------------------

downloadPdf: async (id: string): Promise<void> => {
  const res = await api.get(`${BASE}/${id}/pdf`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(
    new Blob([res.data as BlobPart], { type: 'application/pdf' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `FieldTrip-${id.slice(-8)}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
},
```

### 5.2 New Download PDF button in `FieldTripDetailPage`

**File to modify:** `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx`

#### 5.2.1 State addition

Add a loading state for the PDF download:
```tsx
const [pdfLoading, setPdfLoading] = useState(false);
```

#### 5.2.2 Handler addition

```tsx
const handleDownloadPdf = async () => {
  if (!trip) return;
  setPdfLoading(true);
  try {
    await fieldTripService.downloadPdf(trip.id);
  } catch {
    setActionError('Failed to generate PDF. Please try again.');
  } finally {
    setPdfLoading(false);
  }
};
```

#### 5.2.3 Button placement

The download button belongs in the header action area, alongside the existing Edit button. It should be available for **all statuses except DRAFT** (DRAFT trips are incomplete and not yet formally submitted — PDFs are most useful for submitted/approved trips). However, to match the PO pattern and to allow submitters to save a copy, show it for all statuses once a trip exists.

Placement: Inside the `<Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>` header box, below the status Chip and alongside/below the Edit button:

```tsx
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

{/* PDF download — available for all trips the user can view */}
<Button
  variant="outlined"
  size="small"
  startIcon={pdfLoading ? <CircularProgress size={16} /> : <PictureAsPdfIcon />}
  onClick={handleDownloadPdf}
  disabled={pdfLoading}
>
  {pdfLoading ? 'Generating…' : 'Download PDF'}
</Button>
```

`PictureAsPdfIcon` is part of `@mui/icons-material` which is already installed.

#### 5.2.4 Import additions

Add to the MUI imports block:
- `PictureAsPdfIcon` from `@mui/icons-material/PictureAsPdf`

---

## 6. New npm Dependencies

**None.** All required libraries are already present:

| Package | Location | Purpose |
|---------|----------|---------|
| `pdfkit@0.17.2` | `backend/package.json` → `dependencies` | PDF generation |
| `@types/pdfkit@0.17.5` | `backend/package.json` → `devDependencies` | TypeScript types |
| `@mui/icons-material` | `frontend/package.json` → `dependencies` | `PictureAsPdfIcon` |

No `npm install` commands needed.

---

## 7. Authentication & Authorization Requirements

### 7.1 Route-level

```
GET /api/field-trips/:id/pdf
  ├── authenticate        — verifies JWT; populates req.user
  ├── validateRequest     — validates :id is a valid UUID (via FieldTripIdParamSchema)
  └── requireModule('FIELD_TRIPS', 2)  — minimum Level 2
```

No CSRF token is required because this is a GET (idempotent, read-only).

### 7.2 Service-level access control

The `generatePdf` service method calls `getById(userId, id, permLevel)` first. The existing `getById` enforces:

- **Level 2:** Can only access trips where `submittedById === userId`
- **Level 3+:** Can access any trip

This means:
- A teacher can only download a PDF of their own field trip
- Supervisors and above can download PDFs of any trip

This is identical to how the PO PDF endpoint is gated (the PO controller passes `userId` and `permLevel` to the service, which enforces the same rules as `getPurchaseOrderById`).

### 7.3 No additional roles needed

The existing `permLevel` system maps directly to the required access tiers. No new Entra groups or roles are introduced.

---

## 8. Security Considerations

### 8.1 OWASP Top 10 Alignment

| Risk | Mitigation |
|------|------------|
| **A01 Broken Access Control** | Service re-uses `getById` authorization check before generating PDF; Level 2 users cannot access other users' trips |
| **A03 Injection** | No user-controlled content is evaluated as code; all trip data is rendered as plain text strings in PDFKit's text API |
| **A05 Security Misconfiguration** | Route requires `authenticate` middleware (JWT validation) and `requireModule`; blank/unauthenticated requests return 401 |
| **A02 Cryptographic Failures** | JWT validated via `authenticate` (Microsoft Entra ID); no secrets sent to client |
| **A04 Insecure Direct Object Reference** | The `:id` parameter is validated as UUID by `FieldTripIdParamSchema`; authorization is enforced in the service layer |

### 8.2 PDF-Specific Risks

| Risk | Mitigation |
|------|------------|
| **XSS via PDF** | PDFKit renders text strings via `.text()` — it does not execute JavaScript in the PDF viewer and does not render HTML. There is no XSS vector. |
| **Content injection** | All data is sourced from the database (already validated by Prisma schema types) and rendered as literal strings, not as PDF markup. No user-supplied strings can alter the PDF structure. |
| **Large PDF / DoS** | Field trip PDFs are bounded in size: a single record with at most 4 approvals, ~30 text fields, and 1 optional transportation record. No pagination of large datasets. Peak estimated PDF size < 300 KB. |
| **Filename injection (Content-Disposition)** | The filename uses only `id.slice(-8)` (hexadecimal characters from UUID) — no user-controlled filename string. |
| **Excessive data exposure** | The `approverEmailsSnapshot` JSON column (contains internal email addresses) is **not rendered** in the PDF. Only `actedByName` (display name) and `actedAt` are shown for each approval. |

### 8.3 Rate Limiting

The existing `express-rate-limit` middleware on the API covers all routes, including the new PDF endpoint. No additional rate limiting is needed.

---

## 9. Ordered Implementation Steps

Execute in this sequence to avoid broken states:

1. **Create `backend/src/services/fieldTripPdf.service.ts`**  
   Standalone module with `generateFieldTripPdf(trip: FieldTripForPdf): Promise<Buffer>`.  
   Implement all 8 rendering sections. No external state.

2. **Add `generatePdf` method to `FieldTripService`**  
   File: `backend/src/services/fieldTrip.service.ts`  
   Hydrates full trip with `TRIP_PDF_INCLUDE`, calls `generateFieldTripPdf`.  
   Import the new service at the top of the file.

3. **Add `getFieldTripPdf` handler to fieldTrip controller**  
   File: `backend/src/controllers/fieldTrip.controller.ts`  
   Reads `userId`, `id`, `permLevel` from request; calls `fieldTripService.generatePdf`; sends buffer with correct headers.

4. **Register `GET /:id/pdf` route**  
   File: `backend/src/routes/fieldTrip.routes.ts`  
   Add after the `GET /:id` route, before the submit/approve/deny workflow routes.  
   No CSRF token required on this route.

5. **Add `downloadPdf` to the frontend field trip service**  
   File: `frontend/src/services/fieldTrip.service.ts`  
   Copy the exact pattern from `purchaseOrder.service.ts → downloadPdf`.

6. **Add Download PDF button to `FieldTripDetailPage`**  
   File: `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx`  
   - Add `pdfLoading` state
   - Add `handleDownloadPdf` async handler
   - Add `PictureAsPdfIcon` import
   - Add `<Button>` in header action box

7. **Build and smoke-test**  
   - `cd backend && npm run build` — verify no TypeScript errors
   - `cd frontend && npm run build` — verify no TypeScript errors
   - Test: navigate to a field trip detail page, click Download PDF, verify browser downloads `FieldTrip-<id>.pdf`
   - Test: try accessing `/api/field-trips/<other-user-id>/pdf` as a Level 2 user — expect 403
   - Test: Level 3+ user accessing any trip PDF — expect 200

---

## 10. File Paths to Create / Modify

### Files to CREATE

| Path | Description |
|------|-------------|
| `backend/src/services/fieldTripPdf.service.ts` | New: PDFKit rendering function for field trip documents |

### Files to MODIFY

| Path | Change |
|------|--------|
| `backend/src/services/fieldTrip.service.ts` | Add `generatePdf(userId, id, permLevel)` method to `FieldTripService`; add `TRIP_PDF_INCLUDE` include shape; import `generateFieldTripPdf` |
| `backend/src/controllers/fieldTrip.controller.ts` | Add `getFieldTripPdf` controller handler at bottom |
| `backend/src/routes/fieldTrip.routes.ts` | Register `GET /:id/pdf` route after existing `GET /:id` |
| `frontend/src/services/fieldTrip.service.ts` | Add `downloadPdf(id: string): Promise<void>` method |
| `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx` | Add `pdfLoading` state, `handleDownloadPdf` handler, `PictureAsPdfIcon` import, Download PDF button in header |

### Files NOT modified

| Path | Reason |
|------|--------|
| `backend/package.json` | PDFKit already installed |
| `frontend/package.json` | `@mui/icons-material` already installed |
| `backend/prisma/schema.prisma` | No schema changes needed |
| `frontend/src/types/fieldTrip.types.ts` | No new types needed — existing `FieldTripRequest` covers all rendered fields |
| `frontend/src/components/fieldtrip/*.tsx` | No changes to shared components needed |

---

## Appendix: FieldTripForPdf Interface (backend/src/services/fieldTripPdf.service.ts)

The `FieldTripForPdf` type should capture the Prisma query result shape for the PDF include. Below is the recommended inline interface (keeping the PDF service self-contained and avoiding cross-service coupling, matching how `POForPdf` is defined in `pdf.service.ts`):

```typescript
interface ChaperoneEntry {
  name: string;
  backgroundCheckComplete: boolean;
}

interface FieldTripApprovalForPdf {
  id:          string;
  stage:       string;
  action:      string;
  actedByName: string;
  actedAt:     Date;
  notes:       string | null;
  denialReason: string | null;
}

interface TransportationForPdf {
  status:               string;
  busCount:             number;
  chaperoneCount:       number;
  needsDriver:          boolean;
  driverName:           string | null;
  loadingLocation:      string;
  loadingTime:          string;
  arriveFirstDestTime:  string | null;
  leaveLastDestTime:    string | null;
  transportationType:   string | null;
  transportationCost:   any | null;
  submittedAt:          Date | null;
}

export interface FieldTripForPdf {
  id:                         string;
  status:                     string;
  fiscalYear:                 string | null;

  // Submitter
  submittedBy: {
    firstName:   string;
    lastName:    string;
    displayName: string | null;
    email:       string;
  } | null;
  submitterEmail:             string;

  // Form fields
  teacherName:                string;
  schoolBuilding:             string;
  gradeClass:                 string;
  studentCount:               number;
  tripDate:                   Date;
  destination:                string;
  destinationAddress:         string | null;
  purpose:                    string;
  departureTime:              string;
  returnTime:                 string;
  transportationNeeded:       boolean;
  transportationDetails:      string | null;
  costPerStudent:             any | null;
  totalCost:                  any | null;
  fundingSource:              string | null;
  chaperoneInfo:              string | null;
  emergencyContact:           string | null;
  additionalNotes:            string | null;
  subjectArea:                string | null;
  preliminaryActivities:      string | null;
  followUpActivities:         string | null;
  isOvernightTrip:            boolean;
  returnDate:                 Date | null;
  alternateTransportation:    string | null;

  // Step 3
  rainAlternateDate:          Date | null;
  substituteCount:            number | null;
  parentalPermissionReceived: boolean;
  plansForNonParticipants:    string | null;
  chaperones:                 unknown;  // Json — cast to ChaperoneEntry[]
  instructionalTimeMissed:    string | null;
  reimbursementExpenses:      string[];
  overnightSafetyPrecautions: string | null;

  // Workflow
  denialReason:               string | null;
  submittedAt:                Date | null;
  approvedAt:                 Date | null;
  createdAt:                  Date;

  // Relations
  approvals:                  FieldTripApprovalForPdf[];
  transportationRequest:      TransportationForPdf | null;
}
```

---

*Spec complete. Proceed to Phase 2 (Implementation) using this document as the sole source of truth.*
