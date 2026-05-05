# Field Trip PDF 500 Error — Diagnosis Spec

**Date:** 2026-05-05  
**Endpoint:** `GET /api/field-trips/:id/pdf`  
**Symptom:** HTTP 500 on every PDF request  

---

## Root Cause Summary

**Primary cause (DB schema mismatch — affects ALL PDF requests):**  
Migration `20260505120000_add_transportation_part_c_bus_and_drivers` added two columns to `field_trip_transportation_requests` (`transportationBusCount INTEGER`, `driverNames JSONB`). `prisma generate` was subsequently run, so the deployed Prisma client now includes those columns in every SELECT against that table. However, the migration has NOT been applied to the production database. When the PDF endpoint executes `prisma.fieldTripRequest.findUnique({ ..., include: { transportationRequest: true } })`, Prisma emits a SELECT containing `"transportationBusCount"` and `"driverNames"` — columns that do not exist in the DB — and PostgreSQL responds with `column "transportationBusCount" does not exist`. This unhandled DB error propagates to the controller's catch block as a 500.

**Why only the PDF endpoint is affected:**  
Every other field-trip endpoint (list, detail, approve, deny, etc.) uses the `TRIP_WITH_RELATIONS` constant, which does **not** include `transportationRequest`. The PDF route is the sole path that passes `transportationRequest: true`:

```
backend/src/services/fieldTrip.service.ts, line 676–690  (getFieldTripPdf)
```

**Secondary cause (signature rendering — affects APPROVED trips only):**  
If the running Docker container was built before the `npm run build` font-copy step was present in `package.json`, `dist/assets/fonts/FreestyleScript.ttf` will be missing. PDFKit throws `ENOENT` when `doc.font(FONT_SIG)` is called for any trip with at least one `APPROVED` approval record. This is latent — currently masked by the primary cause — but must be confirmed.

---

## Evidence Trail

### 1. The Prisma query sequence for `getFieldTripPdf`

Prisma (with `@prisma/adapter-pg`) executes one SQL statement per relation:

| # | Table queried | Log visible? |
|---|---|---|
| 1 | `field_trip_requests` | yes |
| 2 | `users` (submittedBy) | yes |
| 3 | `field_trip_approvals` | yes |
| 4 | `field_trip_status_history` | ✅ last logged before crash |
| 5 | `field_trip_transportation_requests` | ❌ DB error here |

The observed symptom — "Prisma query for `field_trip_status_history` appears in logs just before the error" — is the logging of query #4. Query #5 then fails because it selects non-existent columns.

### 2. Migration file confirms the new columns

**File:** `backend/prisma/migrations/20260505120000_add_transportation_part_c_bus_and_drivers/migration.sql`

```sql
ALTER TABLE "field_trip_transportation_requests"
ADD COLUMN "transportationBusCount" INTEGER,
ADD COLUMN "driverNames"            JSONB;
```

These columns are in `schema.prisma` and therefore in the regenerated Prisma client, but not in the database.

### 3. Only `getFieldTripPdf` queries transportation

`TRIP_WITH_RELATIONS` (used by list, detail, approve, deny, etc.) has no `transportationRequest` key:

```typescript
// backend/src/services/fieldTrip.service.ts  lines 56–66
const TRIP_WITH_RELATIONS = {
  submittedBy: { select: { ... } },
  approvals: { orderBy: { actedAt: 'asc' } },
  statusHistory: { orderBy: { changedAt: 'asc' } },
} as const;   // ← no transportationRequest
```

`getFieldTripPdf` adds it explicitly:

```typescript
// backend/src/services/fieldTrip.service.ts  lines 676–690
const trip = await prisma.fieldTripRequest.findUnique({
  where:   { id },
  include: {
    submittedBy:           { select: { ... } },
    approvals:             { orderBy: { actedAt: 'asc' } },
    statusHistory:         { orderBy: { changedAt: 'asc' } },
    transportationRequest: true,   // ← only here
  },
});
```

### 4. `docker-compose.yml` confirms the migration pathway

```yaml
# docker-compose.yml  line 72
command: sh -c "npx prisma migrate deploy && node dist/server.js"
```

`prisma migrate deploy` runs at container startup. If the container was never restarted after the migration was committed, the production DB is still on the old schema.

### 5. Font file path (secondary risk)

```typescript
// backend/src/services/fieldTripPdf.service.ts  line 106
const FONT_SIG = path.join(__dirname, '..', 'assets', 'fonts', 'FreestyleScript.ttf');
```

Build script copies the font:

```json
// backend/package.json  line 7
"build": "tsc && node -e \"require('fs').mkdirSync('dist/assets/fonts',{recursive:true});require('fs').copyFileSync('src/assets/fonts/FreestyleScript.ttf','dist/assets/fonts/FreestyleScript.ttf')\""
```

Source font exists at `backend/src/assets/fonts/FreestyleScript.ttf`. The build produces `dist/assets/fonts/FreestyleScript.ttf`. In a correctly-built and mounted container the font is present. If the running container image is stale (built before this copy step was added), the font is absent and PDFKit throws `ENOENT` when rendering a trip with approved actions.

---

## Exact File Locations and Line Numbers

| File | Lines | Issue |
|---|---|---|
| `backend/src/services/fieldTrip.service.ts` | 675–700 | `getFieldTripPdf` includes `transportationRequest: true`; this triggers the DB error |
| `backend/prisma/migrations/20260505120000_add_transportation_part_c_bus_and_drivers/migration.sql` | 1–4 | Migration SQL not applied to production DB |
| `backend/prisma/schema.prisma` | 663–664 | `transportationBusCount Int?` and `driverNames Json?` present in schema |
| `backend/src/services/fieldTripPdf.service.ts` | 106 | `FONT_SIG` path; font only loaded when an approval has action `'APPROVED'` (lines 648–651) |
| `backend/src/controllers/fieldTrip.controller.ts` | 390–408 | Controller correctly catches errors and returns 500 |
| `frontend/src/services/fieldTrip.service.ts` | 116–128 | `downloadPdf()` calls `GET /:id/pdf` with `responseType: 'blob'` |
| `frontend/src/pages/FieldTrip/FieldTripDetailPage.tsx` | 179–186 | `handleDownloadPdf` calls `fieldTripService.downloadPdf(trip.id)` |

---

## Proposed Fix

### Fix 1 — Apply the pending migration (required, immediate)

**On the production server**, run one of:

```bash
# Option A: exec into the running container
docker compose exec backend npx prisma migrate deploy

# Option B: rebuild and redeploy the container (migration runs at startup)
docker compose up --build -d backend
```

`prisma migrate deploy` applies `20260505120000_add_transportation_part_c_bus_and_drivers`, adding `transportationBusCount` and `driverNames` to the `field_trip_transportation_requests` table. The PDF query will then succeed.

### Fix 2 — Guard against future schema drift (preventive)

If developers are running `prisma generate` without pairing it with `prisma migrate dev` (creating and committing the migration), add a reminder comment or a CI check. The current developer note acknowledges this pattern ("we recently ran `prisma generate` after removing `estimatedMileage`"), which indicates `estimatedMileage` was removed from `schema.prisma` but no DROP COLUMN migration was created. This is acceptable for additive scenarios (the DB column remains ignored), but dangerous when new required columns are added.

### Fix 3 — Confirm font is present in production image (secondary)

After applying the migration, test the PDF on an **approved** trip. If it still 500s, the font is missing from the running image. Rebuild the container:

```bash
docker compose build backend
docker compose up -d backend
```

The `npm run build` script in `package.json` copies the font into `dist/assets/fonts/`. A fresh build will include it.

### Fix 4 — Action label bug in approval history (cosmetic, non-blocking)

The PDF approval history uses stale action string comparisons. Change in `backend/src/services/fieldTripPdf.service.ts` around line 563:

```typescript
// Before
const actorLabel = (approval.action === 'DENY' || approval.action === 'REJECT')
  ? 'Denied by'
  : (approval.action === 'APPROVE' || approval.action === 'APPROVED')
    ? 'Approved by'
    : 'Action by';

// After
const actorLabel = approval.action === 'DENIED'
  ? 'Denied by'
  : approval.action === 'APPROVED'
    ? 'Approved by'
    : 'Action by';
```

`'DENY'`, `'REJECT'`, and `'APPROVE'` are never stored (the service always stores `'APPROVED'`, `'DENIED'`, or `'SENT_BACK'`). This fix ensures denied actions show "Denied by" in the PDF history rather than "Action by".

---

## Environment / Dependency Checklist

| Item | Status |
|---|---|
| PDFKit `^0.17.2` | ✅ In `package.json` dependencies |
| `@types/pdfkit ^0.17.5` | ✅ Dev dependency |
| `FreestyleScript.ttf` source | ✅ Present at `backend/src/assets/fonts/` |
| Font copy in build script | ✅ `package.json` build script copies to `dist/assets/fonts/` |
| Migration file created | ✅ `20260505120000_add_transportation_part_c_bus_and_drivers` exists |
| Migration applied to production DB | ❌ **NOT confirmed — primary fix required** |
| No Puppeteer/Chrome dependency | ✅ PDFKit is pure Node.js — no headless browser needed |

---

## Security Considerations

1. **ID validation**: The route passes `:id` through `validateRequest(FieldTripIdParamSchema, 'params')` before reaching the controller. No raw UUID injection risk.

2. **Authorization**: `getFieldTripPdf` enforces ownership OR `permLevel >= 3` before generating the PDF. Users cannot download other users' trip PDFs unless they are approvers-level or above.

3. **User-supplied content in PDF**: `trip.teacherName`, `trip.destination`, `trip.purpose`, etc., are rendered as text via PDFKit's `.text()` API — not as HTML. PDFKit does not interpret HTML or execute code from text inputs. No XSS/injection risk in the generated PDF.

4. **Binary response headers**: The controller sets `Content-Type: application/pdf` and `Content-Disposition: attachment`. The filename is `field-trip-${id.slice(-8)}.pdf` — deterministic, no path traversal possible.

5. **Font file path**: `FONT_SIG` is a compile-time constant built from `__dirname`. It is not user-controlled and cannot be redirected to an arbitrary path.

---

## Summary

| | Detail |
|---|---|
| **Root cause** | Migration `20260505120000_add_transportation_part_c_bus_and_drivers` not applied to production DB; Prisma client queries `transportationBusCount`/`driverNames` columns that do not exist |
| **Trigger file** | `backend/src/services/fieldTrip.service.ts` lines 676–700 |
| **DB error** | `column "transportationBusCount" does not exist` (PostgreSQL) |
| **All other endpoints unaffected** | Use `TRIP_WITH_RELATIONS` — no `transportationRequest` include |
| **Immediate fix** | `docker compose exec backend npx prisma migrate deploy` |
| **Secondary risk** | Missing font in stale container image; only affects APPROVED trips |
| **Secondary fix** | `docker compose build backend && docker compose up -d backend` |
