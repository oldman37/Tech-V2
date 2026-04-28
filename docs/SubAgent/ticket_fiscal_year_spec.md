# Ticket Fiscal Year Support — Implementation Specification

**Project:** Tech-V2 (Tech Department Management System)  
**Created:** April 21, 2026  
**Status:** Research Complete — Ready for Implementation  
**Phase:** Research Subagent Output

---

## Table of Contents

1. [Research Summary & Key Findings](#1-research-summary--key-findings)
2. [What Already Exists (Do Not Re-Implement)](#2-what-already-exists-do-not-re-implement)
3. [What Needs to Be Built](#3-what-needs-to-be-built)
4. [Schema Changes](#4-schema-changes)
5. [Backend Changes](#5-backend-changes)
6. [Frontend Changes](#6-frontend-changes)
7. [Implementation Order](#7-implementation-order)
8. [Data & Behaviour Decisions](#8-data--behaviour-decisions)
9. [File Change Manifest](#9-file-change-manifest)

---

## 1. Research Summary & Key Findings

### 1.1 Existing Fiscal Year / PO System

The PO fiscal year system is **fully implemented** and battle-tested. Its pattern must be replicated for tickets.

**How it works end-to-end:**

| Layer | File | Responsibility |
|-------|------|----------------|
| Schema | `schema.prisma` | `fiscalYear String?` on `purchase_orders`; `currentFiscalYear String?` on `SystemSettings`; `FiscalYearHistory` audit model |
| Service | `settings.service.ts` | `getFiscalYearSummary()` — counts in-progress POs; `startNewFiscalYear()` — atomic transaction that denies/carries POs, updates settings, writes audit record; `getDistinctFiscalYears()` — returns all years from POs for the filter dropdown |
| Service | `purchaseOrder.service.ts` | Stamps `fiscalYear: currentFiscalYear` on create; blocks creation when FY expired |
| Controller | `settings.controller.ts` | `getFiscalYearSummary`, `startNewFiscalYear`, `getDistinctFiscalYears` handlers |
| Routes | `settings.routes.ts` | GET `/settings/fiscal-year-summary`, POST `/settings/new-fiscal-year`, GET `/settings/fiscal-years` |
| Frontend | `AdminSettings.tsx` | `FiscalYearTab` component (inline — **no separate NewFiscalYear.tsx file exists**). 4-step wizard: Confirm FY → Handle In-Progress Reqs → Number Sequences → Review & Confirm |
| Frontend | `PurchaseOrderList.tsx` | FY dropdown filter; "fiscal year expired" warning banner; "New Requisition" button disabled when FY expired |
| Frontend | `settingsService.ts` | `getFiscalYearSummary()`, `startNewFiscalYear()`, `getDistinctFiscalYears()` |

### 1.2 Existing Ticketing System

**Schema (`schema.prisma` — Ticket model):**
- `fiscalYear String` — **already present, required (non-nullable), already indexed** (`@@index([fiscalYear])`)
- `department TicketDepartment` — `TECHNOLOGY` or `MAINTENANCE`
- `status TicketStatus` — `OPEN | IN_PROGRESS | ON_HOLD | RESOLVED | CLOSED`
- `officeLocationId String?` — linked to office/school location (key for department breakdown)

**Service (`tickets.service.ts`):**
- `createTicket()` — **already stamps `fiscalYear: settings.currentFiscalYear ?? String(new Date().getFullYear())`**
- `getTickets()` — **already filters by `fiscalYear` when `query.fiscalYear` is set**
- `getTicketStats()` — already accepts `fiscalYear` param and filters by it

**Validators (`tickets.validators.ts`):**
- `TicketQuerySchema` — **already includes `fiscalYear: z.string().max(20).optional()`**

**Key implication:** The backend data layer is substantially already done. The Ticket model already has `fiscalYear`, creation stamps it, and filtering works. What is missing is the **rollover integration**, **year-end summary**, **distinct-years endpoint for the filter dropdown**, and the **frontend filter UI**.

---

## 2. What Already Exists (Do Not Re-Implement)

The following are already implemented. Do not touch them:

| Feature | Location | Status |
|---------|----------|--------|
| `fiscalYear String` field on `Ticket` model | `schema.prisma` | ✅ Done (non-nullable, indexed) |
| Stamping `fiscalYear` on ticket create | `tickets.service.ts → createTicket()` | ✅ Done |
| `fiscalYear` filter in `getTickets()` | `tickets.service.ts` | ✅ Done |
| `fiscalYear` param in `TicketQuerySchema` | `tickets.validators.ts` | ✅ Done |
| `getTicketStats()` accepts `fiscalYear` | `tickets.service.ts` | ✅ Done |
| `currentFiscalYear` field on `SystemSettings` | `schema.prisma` | ✅ Done (shared with POs) |
| PO fiscal year rollover wizard (Steps 1–4) | `AdminSettings.tsx → FiscalYearTab` | ✅ Done |

---

## 3. What Needs to Be Built

Summary of gaps:

### Backend Gaps
1. `getTicketYearSummary()` — new method on `SettingsService`
2. `getDistinctTicketFiscalYears()` — new method on `SettingsService`
3. Carry-over step in `startNewFiscalYear()` — re-stamp open/in_progress/on_hold tickets with new year
4. Record `carriedOverTicketCount` in `FiscalYearHistory`
5. New controller handlers: `getTicketYearSummary`, `getDistinctTicketFiscalYears`
6. New routes: `GET /settings/ticket-year-summary`, `GET /settings/ticket-fiscal-years`

### Frontend Gaps
1. `TicketListPage.tsx` — fiscal year filter dropdown + optional "current year" badge
2. `AdminSettings.tsx → FiscalYearTab`  — ticket summary section in the wizard (new Step 2, shifting existing steps)
3. `settingsService.ts` — add `getTicketYearSummary()` and `getDistinctTicketFiscalYears()` API calls
4. `queryKeys.ts` — add `ticketYearSummary()` key and `ticketFiscalYears` key

---

## 4. Schema Changes

### 4.1 Ticket Model

**No changes required.** The `Ticket` model already has:

```prisma
model Ticket {
  // ...
  fiscalYear       String          // Already exists, non-nullable, indexed
  // ...
  @@index([fiscalYear])            // Already exists
}
```

### 4.2 FiscalYearHistory Model

**Add one field** to track how many open tickets were carried over during rollover:

**File:** `c:\Tech-V2\backend\prisma\schema.prisma`

**Current model (relevant excerpt):**
```prisma
model FiscalYearHistory {
  id               String   @id @default(uuid())
  fiscalYear       String
  fiscalYearStart  DateTime
  fiscalYearEnd    DateTime
  action           String
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

**Change — add after `deniedCount`:**
```prisma
  carriedOverTicketCount Int @default(0)
```

**Result:**
```prisma
model FiscalYearHistory {
  id                     String   @id @default(uuid())
  fiscalYear             String
  fiscalYearStart        DateTime
  fiscalYearEnd          DateTime
  action                 String
  deniedCount            Int      @default(0)
  carriedOverTicketCount Int      @default(0)
  reqPrefix              String
  reqStartNumber         Int
  poPrefix               String
  poStartNumber          Int
  performedById          String
  performedAt            DateTime @default(now())

  performedBy      User     @relation(fields: [performedById], references: [id])

  @@map("fiscal_year_history")
  @@index([fiscalYear])
}
```

### 4.3 SystemSettings Model

**No changes required.** The existing `currentFiscalYear String?` field is shared between POs and tickets — one source of truth. This is intentional and correct.

> **Design decision:** Tickets use the same `currentFiscalYear` as POs. There is no separate ticket fiscal year. Both systems run on the same school year (July 1 → June 30).

### 4.4 Migration

After schema edit, run:
```bash
cd backend
npx prisma migrate dev --name add_carried_over_ticket_count_to_fiscal_year_history
```

---

## 5. Backend Changes

### 5.1 `settings.service.ts` — New Methods

**File:** `c:\Tech-V2\backend\src\services\settings.service.ts`

#### 5.1.1 Add `getTicketYearSummary()`

Insert after `getDistinctFiscalYears()` (after the last method in the class):

```typescript
/**
 * Returns a summary of the current fiscal year's tickets.
 * Used by the rollover wizard to show a year-end summary before rollover.
 * Groups by department × status so the admin sees a breakdown.
 */
async getTicketYearSummary() {
  const settings = await this.getSettings();
  const fiscalYear = settings.currentFiscalYear;

  if (!fiscalYear) {
    return {
      fiscalYear: null,
      totals: { OPEN: 0, IN_PROGRESS: 0, ON_HOLD: 0, RESOLVED: 0, CLOSED: 0, total: 0 },
      byDepartment: {},
    };
  }

  // Count by status for the current fiscal year
  const statusCounts = await this.prisma.ticket.groupBy({
    by: ['status'],
    where: { fiscalYear },
    _count: { id: true },
  });

  const totals: Record<string, number> = {
    OPEN: 0, IN_PROGRESS: 0, ON_HOLD: 0, RESOLVED: 0, CLOSED: 0, total: 0,
  };
  for (const row of statusCounts) {
    totals[row.status] = row._count.id;
    totals.total += row._count.id;
  }

  // Count by department × status for detailed breakdown
  const deptCounts = await this.prisma.ticket.groupBy({
    by: ['department', 'status'],
    where: { fiscalYear },
    _count: { id: true },
  });

  // Build byDepartment map: { TECHNOLOGY: { OPEN: n, ... }, MAINTENANCE: { ... } }
  const byDepartment: Record<string, Record<string, number>> = {};
  for (const row of deptCounts) {
    const dept = row.department as string;
    if (!byDepartment[dept]) {
      byDepartment[dept] = { OPEN: 0, IN_PROGRESS: 0, ON_HOLD: 0, RESOLVED: 0, CLOSED: 0, total: 0 };
    }
    byDepartment[dept][row.status] = row._count.id;
    byDepartment[dept].total = (byDepartment[dept].total ?? 0) + row._count.id;
  }

  // Count of open tickets that will be carried over
  const openToCarryCount = await this.prisma.ticket.count({
    where: {
      fiscalYear,
      status: { in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] },
    },
  });

  return {
    fiscalYear,
    totals,
    byDepartment,
    openToCarryCount,
  };
}
```

#### 5.1.2 Add `getDistinctTicketFiscalYears()`

Insert after `getTicketYearSummary()`:

```typescript
/**
 * Returns all distinct fiscal years that have at least one ticket.
 * Used to populate the fiscal year filter dropdown on TicketListPage.
 */
async getDistinctTicketFiscalYears(): Promise<string[]> {
  const result = await this.prisma.ticket.findMany({
    select: { fiscalYear: true },
    distinct: ['fiscalYear'],
    orderBy: { fiscalYear: 'desc' },
  });
  return result.map((r) => r.fiscalYear);
}
```

#### 5.1.3 Modify `startNewFiscalYear()` — Add Carry-Over Step

Inside the `prisma.$transaction` callback, after step 2 (update `SystemSettings`) and before step 3 (write `FiscalYearHistory` audit record), add:

```typescript
// 3. Carry over open tickets: re-stamp OPEN, IN_PROGRESS, ON_HOLD tickets
//    with the new fiscal year so they appear in the new year's view.
//    RESOLVED and CLOSED tickets stay in the old year (historical record).
const carriedOverTickets = await tx.ticket.findMany({
  where: {
    fiscalYear: currentSettings?.currentFiscalYear ?? undefined,
    status: { in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] },
  },
  select: { id: true },
});

let carriedOverTicketCount = 0;
if (carriedOverTickets.length > 0) {
  await tx.ticket.updateMany({
    where: {
      id: { in: carriedOverTickets.map((t) => t.id) },
    },
    data: { fiscalYear: data.fiscalYearLabel },
  });
  carriedOverTicketCount = carriedOverTickets.length;
}
```

Then in step 4 (create `FiscalYearHistory`), add the `carriedOverTicketCount` field:

```typescript
await tx.fiscalYearHistory.create({
  data: {
    fiscalYear:             data.fiscalYearLabel,
    fiscalYearStart:        new Date(data.fiscalYearStart),
    fiscalYearEnd:          new Date(data.fiscalYearEnd),
    action:                 data.inProgressAction,
    deniedCount,
    carriedOverTicketCount,      // ← NEW
    reqPrefix:              data.reqNumberPrefix,
    reqStartNumber:         data.nextReqNumber,
    poPrefix:               data.poNumberPrefix,
    poStartNumber:          data.nextPoNumber,
    performedById:          adminUserId,
    performedAt:            now,
  },
});
```

And update the return value to include ticket info:

```typescript
return {
  fiscalYear:            data.fiscalYearLabel,
  deniedCount,
  carriedOverTicketCount,   // ← NEW
  message: `Fiscal year ${data.fiscalYearLabel} started successfully.`,
};
```

Also update the `logger.info` call:
```typescript
logger.info('Fiscal year rollover completed', {
  fiscalYear:            data.fiscalYearLabel,
  action:                data.inProgressAction,
  deniedCount,
  carriedOverTicketCount, // ← NEW
  performedBy:           adminUserId,
});
```

**Important:** The carry-over step must use `currentSettings?.currentFiscalYear` (captured before the settings update) as the `where.fiscalYear` filter — not the new year label — to avoid re-stamping tickets that were already in the old year correctly.

### 5.2 `settings.controller.ts` — New Handlers

**File:** `c:\Tech-V2\backend\src\controllers\settings.controller.ts`

Add after `getDistinctFiscalYears`:

```typescript
/**
 * GET /api/settings/ticket-year-summary
 * Returns ticket count summary grouped by status and department for the current fiscal year.
 * Admin only.
 */
export const getTicketYearSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await service.getTicketYearSummary();
    res.json(summary);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/settings/ticket-fiscal-years
 * Returns distinct fiscal years from tickets.
 * All authenticated users (same as /fiscal-years for POs).
 */
export const getDistinctTicketFiscalYears = async (req: Request, res: Response): Promise<void> => {
  try {
    const years = await service.getDistinctTicketFiscalYears();
    res.json(years);
  } catch (error) {
    handleControllerError(error, res);
  }
};
```

Also update the `StartNewFiscalYearResult` type returned — the `startNewFiscalYear` handler doesn't need changes; the response object now includes `carriedOverTicketCount` from the service.

### 5.3 `settings.routes.ts` — New Routes

**File:** `c:\Tech-V2\backend\src\routes\settings.routes.ts`

Import the new handlers at the top (add to existing import):

```typescript
import * as settingsController from '../controllers/settings.controller';
// (already imported — just add the new route registrations below)
```

Add after the `router.get('/fiscal-years', ...)` line (the non-admin route):

```typescript
// Ticket fiscal years list — accessible by all authenticated users
router.get('/ticket-fiscal-years', settingsController.getDistinctTicketFiscalYears);
```

Add after the `router.get('/fiscal-year-summary', ...)` route (admin section):

```typescript
/**
 * GET /api/settings/ticket-year-summary
 * Returns ticket count by status/department for current fiscal year.
 */
router.get('/ticket-year-summary', settingsController.getTicketYearSummary);
```

**Full route file after changes (showing added routes in context):**

```
router.get('/fiscal-years', settingsController.getDistinctFiscalYears);
router.get('/ticket-fiscal-years', settingsController.getDistinctTicketFiscalYears);  // ← NEW

router.use(requireAdmin);

router.get('/', settingsController.getSettings);
router.put('/', validateCsrfToken, validateRequest(UpdateSettingsSchema, 'body'), settingsController.updateSettings);
router.get('/fiscal-year-summary', settingsController.getFiscalYearSummary);
router.get('/ticket-year-summary', settingsController.getTicketYearSummary);           // ← NEW
router.post('/new-fiscal-year', validateCsrfToken, validateRequest(StartNewFiscalYearSchema, 'body'), settingsController.startNewFiscalYear);
```

### 5.4 `settings.validators.ts` — No New Validators Needed

The `StartNewFiscalYearSchema` does not need changes. The ticket carry-over is automatic (no admin choice — always carry over open tickets). No new input is required.

---

## 6. Frontend Changes

### 6.1 `settingsService.ts` — New API Methods + Types

**File:** `c:\Tech-V2\frontend\src\services\settingsService.ts`

#### 6.1.1 Add Interface

Add after `StartNewFiscalYearResult` interface:

```typescript
export interface TicketYearSummary {
  fiscalYear: string | null;
  totals: {
    OPEN:        number;
    IN_PROGRESS: number;
    ON_HOLD:     number;
    RESOLVED:    number;
    CLOSED:      number;
    total:       number;
  };
  byDepartment: Record<string, {
    OPEN:        number;
    IN_PROGRESS: number;
    ON_HOLD:     number;
    RESOLVED:    number;
    CLOSED:      number;
    total:       number;
  }>;
  openToCarryCount: number;
}
```

Also update `StartNewFiscalYearResult` to include the new field:

```typescript
export interface StartNewFiscalYearResult {
  fiscalYear:            string;
  deniedCount:           number;
  carriedOverTicketCount: number;  // ← ADD
  message:               string;
}
```

#### 6.1.2 Add API Methods

Add to the `settingsService` object after `getDistinctFiscalYears`:

```typescript
/**
 * GET /api/settings/ticket-year-summary
 * Returns ticket counts by status + department for the current fiscal year.
 */
getTicketYearSummary: async (): Promise<TicketYearSummary> => {
  const res = await api.get<TicketYearSummary>('/settings/ticket-year-summary');
  return res.data;
},

/**
 * GET /api/settings/ticket-fiscal-years
 * Returns distinct fiscal years from tickets.
 */
getDistinctTicketFiscalYears: async (): Promise<string[]> => {
  const res = await api.get<string[]>('/settings/ticket-fiscal-years');
  return res.data;
},
```

### 6.2 `queryKeys.ts` — New Keys

**File:** `c:\Tech-V2\frontend\src\lib\queryKeys.ts`

Add to the `fiscalYear` object (after `list: () => ...`):

```typescript
fiscalYear: {
  all:              ['fiscalYear'] as const,
  summary:          () => [...queryKeys.fiscalYear.all, 'summary'] as const,
  list:             () => [...queryKeys.fiscalYear.all, 'list'] as const,
  ticketSummary:    () => [...queryKeys.fiscalYear.all, 'ticketSummary'] as const,  // ← NEW
  ticketList:       () => [...queryKeys.fiscalYear.all, 'ticketList'] as const,     // ← NEW
},
```

### 6.3 `TicketListPage.tsx` — Fiscal Year Filter

**File:** `c:\Tech-V2\frontend\src\pages\TicketListPage.tsx`

#### 6.3.1 Imports to Add

```typescript
import { useMemo } from 'react';  // update existing useState import
import { useQuery } from '@tanstack/react-query';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import settingsService from '@/services/settingsService';
import { queryKeys } from '@/lib/queryKeys';
```

#### 6.3.2 State and Data Fetching

Add in the component body after existing filter state declarations:

```typescript
// Fiscal year filter state
const [fiscalYearFilter, setFiscalYearFilter] = useState<string>('');

// Fetch system settings for current fiscal year
const { data: settings } = useQuery({
  queryKey: queryKeys.settings,
  queryFn: settingsService.get,
});

// Fetch distinct ticket fiscal years for dropdown
const { data: ticketFiscalYears = [] } = useQuery({
  queryKey: queryKeys.fiscalYear.ticketList(),
  queryFn: settingsService.getDistinctTicketFiscalYears,
});

// Determine active FY (explicit filter OR current year default)
const activeFiscalYear = fiscalYearFilter || settings?.currentFiscalYear || '';
```

#### 6.3.3 Update `filters` Object

Change the existing `filters` const to include fiscal year:

```typescript
const filters: TicketQuery = {
  page: page + 1,
  limit: rowsPerPage,
  ...(search.trim() && { search: search.trim() }),
  ...(department && { department }),
  ...(status && { status }),
  ...(priority && { priority }),
  ...(activeFiscalYear && { fiscalYear: activeFiscalYear }),  // ← ADD
};
```

#### 6.3.4 Page Header — Add Year Badge

Add after the `<Typography variant="h5" ...>Tickets</Typography>` line:

```typescript
{settings?.currentFiscalYear && (
  <Chip
    icon={<CalendarTodayIcon />}
    label={`FY ${activeFiscalYear || settings.currentFiscalYear}`}
    size="small"
    color="default"
    variant="outlined"
    sx={{ ml: 1 }}
  />
)}
```

#### 6.3.5 Filter Bar — Add Fiscal Year Dropdown

Add after the Priority `<Select>` in the filter bar section:

```typescript
{ticketFiscalYears.length > 0 && (
  <Select
    size="small"
    displayEmpty
    value={activeFiscalYear}
    onChange={(e) => { setFiscalYearFilter(e.target.value); setPage(0); }}
    sx={{ minWidth: 160 }}
  >
    <MenuItem value="">All Years</MenuItem>
    {ticketFiscalYears.map((fy) => (
      <MenuItem key={fy} value={fy}>{fy}</MenuItem>
    ))}
  </Select>
)}
```

#### 6.3.6 Table — Add Fiscal Year Column (Optional / Low Priority)

The table currently has 8 columns. Adding `fiscalYear` as a visible column is optional — the badge + filter already communicate the year context. If added, insert between "Created" and the end of headers:

```typescript
<TableCell sx={{ fontWeight: 600 }}>Year</TableCell>
// ...in each row:
<TableCell>
  <Typography variant="body2">{ticket.fiscalYear ?? '—'}</Typography>
</TableCell>
```

> **Recommendation:** Skip the column unless explicitly requested. The filter dropdown + year badge are sufficient.

### 6.4 `AdminSettings.tsx` — Update Wizard for Ticket Summary

**File:** `c:\Tech-V2\frontend\src\pages\admin\AdminSettings.tsx`

> **Note:** There is no separate `NewFiscalYear.tsx` file. The wizard lives entirely in `AdminSettings.tsx` as the `FiscalYearTab` and `FiscalYearWizard` inline components. All changes are to this file.

#### 6.4.1 Update `WIZARD_STEPS`

**Current:**
```typescript
const WIZARD_STEPS = [
  'Confirm Fiscal Year',
  'In-Progress Requisitions',
  'Number Sequences',
  'Review & Confirm',
];
```

**New (insert 'Ticket Summary' as Step 3):**
```typescript
const WIZARD_STEPS = [
  'Confirm Fiscal Year',         // Step 0
  'In-Progress Requisitions',    // Step 1
  'Number Sequences',            // Step 2
  'Ticket Summary',              // Step 3 ← NEW
  'Review & Confirm',            // Step 4 (was 3)
];
```

#### 6.4.2 Update `fieldsForStep`

**Current:**
```typescript
const fieldsForStep: Record<number, (keyof WizardValues)[]> = {
  0: ['fiscalYearLabel'],
  1: ['inProgressAction', 'denialReason'],
  2: ['reqNumberPrefix', 'nextReqNumber', 'poNumberPrefix', 'nextPoNumber'],
};
```

**New (step 3 is Ticket Summary — no form fields, just informational):**
```typescript
const fieldsForStep: Record<number, (keyof WizardValues)[]> = {
  0: ['fiscalYearLabel'],
  1: ['inProgressAction', 'denialReason'],
  2: ['reqNumberPrefix', 'nextReqNumber', 'poNumberPrefix', 'nextPoNumber'],
  3: [],  // Ticket Summary — read-only, no validation needed
};
```

#### 6.4.3 Add Ticket Year Summary Data Fetch

Add to the `FiscalYearTab` (or the inline wizard section) alongside the existing `summary` query:

```typescript
const {
  data: ticketSummary,
  isLoading: ticketSummaryLoading,
  isError: ticketSummaryError,
} = useQuery({
  queryKey: queryKeys.fiscalYear.ticketSummary(),
  queryFn: settingsService.getTicketYearSummary,
  enabled: wizardOpen,
});
```

**Required import additions:**
```typescript
import settingsService, {
  type UpdateSettingsInput,
  type StartNewFiscalYearInput,
  type StartNewFiscalYearResult,
  type TicketYearSummary,           // ← ADD
} from '../../services/settingsService';
```

#### 6.4.4 Add Step 3: Ticket Summary (New Step)

Insert between the existing Step 2 (Number Sequences) and the existing Step 3 (Review & Confirm). The existing `activeStep === 3` Review block shifts to `activeStep === 4`.

```tsx
{/* Step 3: Ticket Summary (NEW) */}
{activeStep === 3 && (
  <Card variant="outlined">
    <CardHeader
      title="Open Tickets — Year-End Summary"
      subheader={`FY ${summary?.currentFiscalYear ?? '—'}`}
    />
    <Divider />
    <CardContent>
      <Stack spacing={2}>
        {ticketSummaryLoading && <CircularProgress size={24} />}
        {ticketSummaryError && (
          <Alert severity="error">Failed to load ticket summary. You can continue anyway.</Alert>
        )}
        {ticketSummary && (
          <>
            <Alert severity="info">
              <strong>{ticketSummary.openToCarryCount}</strong> open / in-progress / on-hold
              ticket{ticketSummary.openToCarryCount !== 1 ? 's' : ''} will be
              automatically carried over to fiscal year <strong>{wizWatched.fiscalYearLabel}</strong>.
              Resolved and closed tickets remain in <strong>{ticketSummary.fiscalYear}</strong>.
            </Alert>

            {/* Status totals table */}
            <Typography variant="subtitle2">All Tickets This Year</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Count</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'] as const).map((s) => (
                    <TableRow key={s}>
                      <TableCell>{TICKET_STATUS_LABELS[s]}</TableCell>
                      <TableCell align="right">{ticketSummary.totals[s]}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell><strong>Total</strong></TableCell>
                    <TableCell align="right"><strong>{ticketSummary.totals.total}</strong></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            {/* Department breakdown */}
            {Object.keys(ticketSummary.byDepartment).length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>By Department</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Department</TableCell>
                        <TableCell align="right">Open</TableCell>
                        <TableCell align="right">In Progress</TableCell>
                        <TableCell align="right">On Hold</TableCell>
                        <TableCell align="right">Resolved</TableCell>
                        <TableCell align="right">Closed</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(ticketSummary.byDepartment).map(([dept, counts]) => (
                        <TableRow key={dept}>
                          <TableCell>{dept === 'TECHNOLOGY' ? 'Technology' : 'Maintenance'}</TableCell>
                          <TableCell align="right">{counts.OPEN}</TableCell>
                          <TableCell align="right">{counts.IN_PROGRESS}</TableCell>
                          <TableCell align="right">{counts.ON_HOLD}</TableCell>
                          <TableCell align="right">{counts.RESOLVED}</TableCell>
                          <TableCell align="right">{counts.CLOSED}</TableCell>
                          <TableCell align="right">{counts.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {ticketSummary.totals.total === 0 && (
              <Alert severity="success">No tickets exist for {ticketSummary.fiscalYear}.</Alert>
            )}
          </>
        )}
      </Stack>
    </CardContent>
  </Card>
)}
```

#### 6.4.5 Add `TICKET_STATUS_LABELS` Helper Constant

Add near the `STATUS_LABELS` constant already in `AdminSettings.tsx`:

```typescript
const TICKET_STATUS_LABELS: Record<string, string> = {
  OPEN:        'Open',
  IN_PROGRESS: 'In Progress',
  ON_HOLD:     'On Hold',
  RESOLVED:    'Resolved',
  CLOSED:      'Closed',
};
```

#### 6.4.6 Update `activeStep === 3` → `activeStep === 4` (Review & Confirm)

The existing Review & Confirm step is currently `{activeStep === 3 && ...}` — it must shift to `{activeStep === 4 && ...}`.

Also in the Review step, add a summary of carried-over tickets:

```tsx
<Divider />
<Typography variant="subtitle2">Tickets</Typography>
<Typography variant="body2">
  Open tickets to carry over: <strong>{ticketSummary?.openToCarryCount ?? 0}</strong>
</Typography>
<Typography variant="body2">
  (OPEN, IN_PROGRESS, ON_HOLD tickets will be re-stamped with {wizWatched.fiscalYearLabel})
</Typography>
```

#### 6.4.7 Update Success Screen

After a successful rollover, display the ticket carry-over count (`result.carriedOverTicketCount`):

```tsx
{result.carriedOverTicketCount > 0 && (
  <Typography sx={{ mt: 1 }}>
    {result.carriedOverTicketCount} open ticket{result.carriedOverTicketCount !== 1 ? 's' : ''} carried over to {result.fiscalYear}.
  </Typography>
)}
```

#### 6.4.8 Update `onWizardSubmit` → Still Calls Same Mutation

The `handleConfirm` function and `wizardMutation` payload do not change — ticket carry-over happens automatically on the backend as part of `startNewFiscalYear()`. No new payload fields needed.

#### 6.4.9 Invalidate Ticket Fiscal Years on Rollover Success

In `wizardMutation.onSuccess`, add:

```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.fiscalYear.ticketSummary() });
queryClient.invalidateQueries({ queryKey: queryKeys.fiscalYear.ticketList() });
// (existing invalidations remain)
queryClient.invalidateQueries({ queryKey: queryKeys.settings });
queryClient.invalidateQueries({ queryKey: queryKeys.fiscalYear.summary() });
```

---

## 7. Implementation Order

Follow this order to avoid breaking TypeScript:

| # | Step | File(s) | Notes |
|---|------|---------|-------|
| 1 | Schema: add `carriedOverTicketCount` to `FiscalYearHistory` | `schema.prisma` | Run `prisma migrate dev` after |
| 2 | Backend: add `getTicketYearSummary()` to `SettingsService` | `settings.service.ts` | New method only |
| 3 | Backend: add `getDistinctTicketFiscalYears()` to `SettingsService` | `settings.service.ts` | New method only |
| 4 | Backend: update `startNewFiscalYear()` to carry over tickets and record count | `settings.service.ts` | Edit existing method |
| 5 | Backend: add `getTicketYearSummary` and `getDistinctTicketFiscalYears` handlers | `settings.controller.ts` | New exports |
| 6 | Backend: register new routes | `settings.routes.ts` | Two new `router.get` lines |
| 7 | Run `npx tsc --noEmit` in backend — must pass before proceeding | `backend/` | Fix any TypeScript errors |
| 8 | Frontend: add `TicketYearSummary` interface + update `StartNewFiscalYearResult` + add two new service methods | `settingsService.ts` | |
| 9 | Frontend: add `ticketSummary` and `ticketList` to `queryKeys.fiscalYear` | `queryKeys.ts` | |
| 10 | Frontend: add fiscal year filter to `TicketListPage` | `TicketListPage.tsx` | State, query, filter bar, year badge |
| 11 | Frontend: update `WIZARD_STEPS` + add Step 3 Ticket Summary + shift Review to Step 4 | `AdminSettings.tsx` | Most complex change |
| 12 | Run `npx tsc --noEmit` in frontend — must pass | `frontend/` | Fix any TypeScript errors |

---

## 8. Data & Behaviour Decisions

### 8.1 Ticket Creation Is Never Blocked

Unlike POs (which are blocked when `isExpired`), ticket creation is **never disabled** by fiscal year state. Tech requests and maintenance orders must always be accepted. No gate logic should be added.

### 8.2 Shared Fiscal Year Label

Tickets use the same `currentFiscalYear` string as POs (e.g., `"2025-2026"`). There is no separate ticket fiscal year. This is the correct approach — one rollover per year covers both systems.

### 8.3 Carry-Over Semantics

| Ticket Status | Behavior at Rollover |
|--------------|----------------------|
| OPEN | Re-stamped with new fiscal year (carried over) |
| IN_PROGRESS | Re-stamped with new fiscal year (carried over) |
| ON_HOLD | Re-stamped with new fiscal year (carried over) |
| RESOLVED | **Stays in old year** (historical record) |
| CLOSED | **Stays in old year** (historical record) |

Rationale: Resolved/closed tickets represent completed work from the old year. Open tickets are still active work and belong logically to whichever year staff is currently working in.

### 8.4 FiscalYear is Non-Nullable on Ticket

The `Ticket.fiscalYear` field is `String` (required). This was already designed correctly. The service falls back to `String(new Date().getFullYear())` if no fiscal year is configured in settings. All existing tickets already have this field populated.

### 8.5 No Changes to Ticket Number Format

The existing ticket number format (`TKT-{uuid}`) already includes no year component. The `generateTicketNumber()` helper uses `TECH-{year}-{seq}` but that is separate from `ticketNumber` (which is set to `TKT-{uuid}`). No changes to numbering are needed.

### 8.6 Distinct Ticket Fiscal Years — Separate Endpoint

A separate `GET /settings/ticket-fiscal-years` endpoint is used rather than reusing `GET /settings/fiscal-years` (PO years). This is correct because:
- In early years, only POs may exist (or vice versa)
- Both can use the same year labels but the distinct values may diverge
- The separation keeps the APIs clean and dependency-free

### 8.7 `FiscalYearHistory` Audit Record

The `carriedOverTicketCount` field on `FiscalYearHistory` provides a permanent audit trail of how many tickets were carried over at each rollover. This requires a single schema migration. The `@default(0)` ensures backward compatibility with existing rollover history rows.

---

## 9. File Change Manifest

All files that will be touched:

| File | Change Type | Description |
|------|------------|-------------|
| `backend/prisma/schema.prisma` | Edit | Add `carriedOverTicketCount Int @default(0)` to `FiscalYearHistory` |
| `backend/prisma/migrations/` | Generated | New migration from `prisma migrate dev` |
| `backend/src/services/settings.service.ts` | Edit | Add `getTicketYearSummary()`, `getDistinctTicketFiscalYears()`; update `startNewFiscalYear()` |
| `backend/src/controllers/settings.controller.ts` | Edit | Add `getTicketYearSummary`, `getDistinctTicketFiscalYears` handlers |
| `backend/src/routes/settings.routes.ts` | Edit | Register 2 new GET routes |
| `frontend/src/services/settingsService.ts` | Edit | Add `TicketYearSummary` interface; update `StartNewFiscalYearResult`; add 2 new service methods |
| `frontend/src/lib/queryKeys.ts` | Edit | Add `ticketSummary()` and `ticketList()` to `fiscalYear` key object |
| `frontend/src/pages/TicketListPage.tsx` | Edit | Add FY filter dropdown, year badge, fetch distinct years + settings |
| `frontend/src/pages/admin/AdminSettings.tsx` | Edit | New wizard Step 3 (Ticket Summary), shift Review to Step 4, carry-over count in success screen |

**Files NOT changed:**
- `backend/src/services/tickets.service.ts` — already stamps + filters by `fiscalYear`
- `backend/src/validators/tickets.validators.ts` — already has `fiscalYear` in `TicketQuerySchema`
- `backend/src/controllers/tickets.controller.ts` — no changes needed
- `backend/src/routes/tickets.routes.ts` — no changes needed
- `backend/src/validators/settings.validators.ts` — no new validator needed

---

*End of Specification*
