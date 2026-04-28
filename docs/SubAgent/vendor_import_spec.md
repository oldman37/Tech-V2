# Vendor Import & Schema Extension Specification

**Date:** 2026-03-04  
**Author:** Research Subagent  
**Status:** Ready for Implementation

---

## Section 1: Current State Analysis

### 1.1 Current `vendors` Prisma Model

Location: `C:\Tech-V2\backend\prisma\schema.prisma`

```prisma
model vendors {
  id              String            @id @default(uuid())
  name            String            @unique
  contactName     String?
  email           String?
  phone           String?
  address         String?
  website         String?
  isActive        Boolean           @default(true)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  purchase_orders purchase_orders[]
  equipment       equipment[]
}
```

**All current fields:**
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | String (UUID) | Yes | Auto-generated PK |
| `name` | String | Yes | Unique constraint |
| `contactName` | String? | No | Optional contact person |
| `email` | String? | No | Vendor email |
| `phone` | String? | No | Primary phone |
| `address` | String? | No | Street address only |
| `website` | String? | No | URL |
| `isActive` | Boolean | Yes | Defaults to `true` |
| `createdAt` | DateTime | Yes | Auto-set |
| `updatedAt` | DateTime | Yes | Auto-updated |

### 1.2 Frontend – `Vendor` TypeScript Interface

Location: `C:\Tech-V2\frontend\src\services\referenceDataService.ts`

```typescript
export interface Vendor {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 1.3 ReferenceDataManagement – VendorsTab

Location: `C:\Tech-V2\frontend\src\pages\ReferenceDataManagement.tsx`

**Table columns displayed:** Name, Contact, Email, Phone, Status, Actions

**Form fields (Add/Edit dialog):**
- Name (required)
- Contact Name
- Email
- Phone
- Address (multiline)
- Website URL
- Active toggle (edit mode only)

**Missing from the UI:** city, state, zip, fax (do not exist yet).

### 1.4 Existing Backend API Endpoints

Location: `C:\Tech-V2\backend\src\routes\referenceData.routes.ts`

| Method | Path | Auth Level | Handler |
|---|---|---|---|
| GET | `/api/reference/vendors` | TECHNOLOGY >= 1 | `getVendors` |
| GET | `/api/reference/vendors/:id` | TECHNOLOGY >= 1 | `getVendor` |
| POST | `/api/reference/vendors` | TECHNOLOGY >= 2 | `createVendor` |
| PUT | `/api/reference/vendors/:id` | TECHNOLOGY >= 2 | `updateVendor` |
| DELETE | `/api/reference/vendors/:id` | TECHNOLOGY >= 2 | `deleteVendor` (soft-delete, sets `isActive=false`) |

**No dedicated vendor service** – the controller calls `prisma.vendors` directly.

**Validators file:** `C:\Tech-V2\backend\src\validators\referenceData.validators.ts`
- `CreateVendorSchema` – validates create payload
- `UpdateVendorSchema` – validates update payload
- Both schemas use Zod; missing city, state, zip, fax.

---

## Section 2: Gap Analysis

### 2.1 CSV Fields vs Current Schema

| CSV Column | Target Field | Status | Notes |
|---|---|---|---|
| `company_name` | `name` | ✅ EXISTS | Direct map |
| `company_address` | `address` | ✅ EXISTS | Direct map |
| `company_city` | `city` | ❌ MISSING | Must add |
| `company_state` | `state` | ❌ MISSING | Must add |
| `company_zip` | `zip` | ❌ MISSING | Must add |
| `company_contact` | `contactName` | ✅ EXISTS | Direct map |
| `company_phone` | `phone` | ✅ EXISTS | Direct map |
| `company_fax` | `fax` | ❌ MISSING | Must add |

**Fields that exist in schema but NOT in CSV:**
- `email` – Not present in legacy data; stays as nullable, left empty during import.
- `website` – Not present in legacy data; stays as nullable.

### 2.2 Fields to ADD to the Prisma Schema

Four new nullable fields must be added to the `vendors` model:

```prisma
city  String?
state String?
zip   String?
fax   String?
```

### 2.3 Data Observations from Sample CSV

- **Placeholder phones:** `9999999999` and `0000000000` appear as sentinel values (meaning "no number"). These must be stored as `null`.
- **Malformed fax numbers:** e.g., `651-209800` (Shea PC) – store as-is after trimming; do not attempt to normalize formats.
- **City field contamination:** Row 2 (`Lowe's`) has `"Atlanta, "` as city (trailing comma + space inside quotes). Trim whitespace.
- **Address used for PO Box + city:** Row 12 (`Union City Parts`) has `"Old Rives Rd"` as address and `"P.O. Box 664"` as city. Import as-is; data is legacy and not perfect.
- **Empty strings** in CSV (empty fields) → store as `null`.
- **~2,327 lines** in CSV (including header) → approximately **2,326 vendor records**.

---

## Section 3: Implementation Plan

### Step 1: Prisma Schema Migration

**File:** `C:\Tech-V2\backend\prisma\schema.prisma`

Add four fields to the `vendors` model immediately after `address`:

```prisma
model vendors {
  id              String            @id @default(uuid())
  name            String            @unique
  contactName     String?
  email           String?
  phone           String?
  address         String?
  city            String?           // NEW
  state           String?           // NEW
  zip             String?           // NEW
  fax             String?           // NEW
  website         String?
  isActive        Boolean           @default(true)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  purchase_orders purchase_orders[]
  equipment       equipment[]
}
```

**Migration command:**
```bash
npx prisma migrate dev --name add_vendor_address_fields
```

**Suggested migration name:** `add_vendor_address_fields`

All four new fields are `String?` (nullable), making this fully backward-compatible. No existing data is modified.

---

### Step 2: Backend Updates

#### 2a. Validators — `C:\Tech-V2\backend\src\validators\referenceData.validators.ts`

Add `city`, `state`, `zip`, `fax` to both `CreateVendorSchema` and `UpdateVendorSchema`:

**`CreateVendorSchema`** – add after `address`:
```typescript
city:    z.string().max(100).nullish(),
state:   z.string().max(50).nullish(),
zip:     z.string().max(20).nullish(),
fax:     z.string().max(30).nullish(),
```

**`UpdateVendorSchema`** – add after `address`:
```typescript
city:    z.string().max(100).nullish(),
state:   z.string().max(50).nullish(),
zip:     z.string().max(20).nullish(),
fax:     z.string().max(30).nullish(),
```

#### 2b. Controller — `C:\Tech-V2\backend\src\controllers\referenceData.controller.ts`

**No changes required.** The controller passes the Zod-parsed `data` object directly to Prisma (`prisma.vendors.create({ data })` and `prisma.vendors.update({ where: { id }, data })`). Once the schema and validators are updated, new fields flow through automatically.

#### 2c. Routes — `C:\Tech-V2\backend\src\routes\referenceData.routes.ts`

**No changes required.** All vendor CRUD routes already exist and call the correct handlers.

#### 2d. Service Layer

**No dedicated vendor service exists.** Logic lives in the controller. No service changes needed.

---

### Step 3: Shared Types Update

Location: `C:\Tech-V2\shared\src\`

The `Vendor` type is **not** defined in the shared package (`types.ts`, `api-types.ts`, or `index.ts`). The frontend defines its own `Vendor` interface in `referenceDataService.ts`.

**Action:** No changes to the shared package are needed. The shared package does not expose a `Vendor` type.

---

### Step 4: Import Script

**File to Create:** `C:\Tech-V2\backend\scripts\import-companies.ts`

The script must follow the exact pattern established in `import-rooms.ts`:
- Import `PrismaClient` + `PrismaPg` adapter
- Use `dotenv` for env config
- Use `csv-parse/sync` for CSV parsing
- Report progress with console output
- Upsert (update if name exists, create if not)

**Complete script design:**

```typescript
/**
 * Import vendors/companies from legacy CSV file
 * Reads C:\Tech-V2\docs\company.csv and upserts into the vendors table.
 * Skips records where company_name is empty.
 * Stores placeholder phone/fax values (0000000000, 9999999999) as null.
 *
 * Usage: npx tsx scripts/import-companies.ts
 */

import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// CSV row shape matching the legacy export
interface CompanyCSVRow {
  company_name: string;
  company_address: string;
  company_city: string;
  company_state: string;
  company_zip: string;
  company_contact: string;
  company_phone: string;
  company_fax: string;
}

// Placeholder phone values that mean "no number" in the legacy system
const PLACEHOLDER_PHONES = new Set(['0000000000', '9999999999', '']);

/**
 * Clean a string field:
 * - Trims whitespace
 * - Returns null for empty strings
 */
function cleanString(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Clean a phone/fax field:
 * - Trims whitespace
 * - Returns null for placeholder sentinel values and empty strings
 */
function cleanPhone(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim().replace(/\s+/g, '');
  if (PLACEHOLDER_PHONES.has(trimmed)) return null;
  return trimmed.length > 0 ? trimmed : null;
}

async function importCompanies(): Promise<void> {
  console.log('🏢 Starting company/vendor import from CSV...\n');

  try {
    const csvPath = path.join(__dirname, '../../docs/company.csv');

    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }

    console.log(`📄 Reading CSV: ${csvPath}`);
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CompanyCSVRow[];

    console.log(`✓ Parsed ${records.length} rows from CSV\n`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // 1-based, +1 for header

      const name = cleanString(row.company_name);
      if (!name) {
        console.warn(`  ⚠ Row ${rowNum}: empty company_name — skipping`);
        skipped++;
        continue;
      }

      const payload = {
        name,
        address:     cleanString(row.company_address),
        city:        cleanString(row.company_city),
        state:       cleanString(row.company_state),
        zip:         cleanString(row.company_zip),
        contactName: cleanString(row.company_contact),
        phone:       cleanPhone(row.company_phone),
        fax:         cleanPhone(row.company_fax),
      };

      try {
        const existing = await prisma.vendors.findUnique({ where: { name } });
        if (existing) {
          await prisma.vendors.update({ where: { name }, data: payload });
          console.log(`  ↺  Row ${rowNum}: Updated  "${name}"`);
          updated++;
        } else {
          await prisma.vendors.create({ data: { ...payload, isActive: true } });
          console.log(`  ✓  Row ${rowNum}: Created  "${name}"`);
          created++;
        }
      } catch (err: any) {
        const msg = `Row ${rowNum} ("${name}"): ${err.message}`;
        console.error(`  ✗  ${msg}`);
        errors.push(msg);
      }
    }

    console.log('\n══════════════════════════════════════');
    console.log('📊 Import Summary');
    console.log('══════════════════════════════════════');
    console.log(`  ✓ Created : ${created}`);
    console.log(`  ↺ Updated : ${updated}`);
    console.log(`  ⚠ Skipped : ${skipped}`);
    console.log(`  ✗ Errors  : ${errors.length}`);
    if (errors.length > 0) {
      console.log('\nError Details:');
      errors.forEach((e) => console.log(`  - ${e}`));
    }
    console.log('══════════════════════════════════════\n');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

importCompanies().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
```

**Script execution:**
```bash
cd C:\Tech-V2\backend
npx tsx scripts/import-companies.ts
```

**Dependencies already available** (confirmed in `import-rooms.ts`):
- `csv-parse` ✅
- `@prisma/client` ✅
- `@prisma/adapter-pg` ✅
- `pg` ✅
- `dotenv` ✅

---

### Step 5: Frontend Updates

#### 5a. `referenceDataService.ts` — `C:\Tech-V2\frontend\src\services\referenceDataService.ts`

Add four fields to the `Vendor` interface:

```typescript
export interface Vendor {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;        // NEW
  state?: string | null;       // NEW
  zip?: string | null;         // NEW
  fax?: string | null;         // NEW
  website?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

#### 5b. `ReferenceDataManagement.tsx` — `C:\Tech-V2\frontend\src\pages\ReferenceDataManagement.tsx`

**State variables to add in `VendorsTab`:**

```typescript
const [fCity, setFCity]   = useState('');
const [fState, setFState] = useState('');
const [fZip, setFZip]     = useState('');
const [fFax, setFFax]     = useState('');
```

**`openCreate` reset — add:**
```typescript
setFCity(''); setFState(''); setFZip(''); setFFax('');
```

**`openEdit` population — add:**
```typescript
setFCity(v.city ?? '');
setFState(v.state ?? '');
setFZip(v.zip ?? '');
setFFax(v.fax ?? '');
```

**`handleSubmit` payload — add to `payload` object:**
```typescript
city:  fCity  || null,
state: fState || null,
zip:   fZip   || null,
fax:   fFax   || null,
```

**Table `headers` array — update to include City/State:**
```typescript
headers={['Name', 'Contact', 'Phone', 'City/State', 'Status', 'Actions']}
```

**Table row — add City/State column (replace or add after Phone):**
```tsx
<td>
  {v.city || v.state
    ? `${v.city ?? ''}${v.city && v.state ? ', ' : ''}${v.state ?? ''}`
    : <em style={{ opacity: 0.5 }}>—</em>}
</td>
```

**Dialog form — add fields after Address (before Website):**
```tsx
<Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
  <TextField
    fullWidth
    label="City"
    value={fCity}
    onChange={(e) => setFCity(e.target.value)}
    disabled={formLoading}
  />
  <TextField
    label="State"
    value={fState}
    onChange={(e) => setFState(e.target.value)}
    disabled={formLoading}
    sx={{ width: 100 }}
    inputProps={{ maxLength: 2 }}
  />
  <TextField
    label="Zip"
    value={fZip}
    onChange={(e) => setFZip(e.target.value)}
    disabled={formLoading}
    sx={{ width: 120 }}
  />
</Box>
<TextField
  fullWidth
  label="Fax"
  value={fFax}
  onChange={(e) => setFFax(e.target.value)}
  disabled={formLoading}
  sx={{ mb: 2 }}
/>
```

---

## Section 4: Data Cleaning Rules

These rules apply both to the import script and to any manual data entry validation:

| Rule | Detail |
|---|---|
| **Trim whitespace** | All string fields: `raw.trim()` before storing |
| **Empty string → null** | Any field that is empty after trimming is stored as `null` |
| **Sentinel phones** | `"0000000000"` and `"9999999999"` are stored as `null` |
| **Sentinel fax** | Same sentinel values apply to `company_fax` |
| **Phone whitespace** | Internal whitespace stripped (`replace(/\s+/g, '')`) before sentinel check |
| **City contamination** | Trailing commas/spaces in city names are handled by `trim()` |
| **Skip blank names** | Rows where `company_name` is empty/whitespace are skipped with a warning |

---

## Section 5: Migration Safety

### Backward Compatibility

All four new fields (`city`, `state`, `zip`, `fax`) are declared as `String?` (nullable) in Prisma:
- All **existing** vendor records simply have `null` for these fields after migration.
- The generated SQL `ALTER TABLE` will add nullable columns with no `DEFAULT` required.
- No existing queries break because Prisma select returns all fields; callers that do not use these new fields simply ignore them.
- No existing seed scripts, PO creation flows, or equipment assignment flows reference vendor address sub-fields.

### Migration SQL (expected output of `prisma migrate dev`)

```sql
ALTER TABLE "vendors"
  ADD COLUMN "city"  TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "zip"   TEXT,
  ADD COLUMN "fax"   TEXT;
```

### Rollback Plan

If rollback is needed:
```sql
ALTER TABLE "vendors"
  DROP COLUMN IF EXISTS "city",
  DROP COLUMN IF EXISTS "state",
  DROP COLUMN IF EXISTS "zip",
  DROP COLUMN IF EXISTS "fax";
```
Then revert `schema.prisma` and the validators.

---

## Summary of Files to Change

| File | Action |
|---|---|
| `backend/prisma/schema.prisma` | Add `city`, `state`, `zip`, `fax` fields to `vendors` model |
| `backend/src/validators/referenceData.validators.ts` | Add 4 fields to `CreateVendorSchema` and `UpdateVendorSchema` |
| `backend/scripts/import-companies.ts` | **CREATE NEW** – CSV import script |
| `frontend/src/services/referenceDataService.ts` | Add 4 fields to `Vendor` interface |
| `frontend/src/pages/ReferenceDataManagement.tsx` | Add state vars, form fields, and City/State table column |

**Files that do NOT need changes:**
- `backend/src/controllers/referenceData.controller.ts` – passes Zod output directly to Prisma
- `backend/src/routes/referenceData.routes.ts` – all vendor routes already exist
- `shared/src/types.ts` / `api-types.ts` – Vendor type not exposed from shared package
- `backend/prisma/seed.ts` – seed does not seed vendors

---

## Execution Order

1. Add fields to `schema.prisma`
2. Run `npx prisma migrate dev --name add_vendor_address_fields`
3. Update `referenceData.validators.ts`
4. Create `scripts/import-companies.ts`
5. Run the import: `npx tsx scripts/import-companies.ts`
6. Update `frontend/src/services/referenceDataService.ts`
7. Update `frontend/src/pages/ReferenceDataManagement.tsx`
8. Build and verify: `npm run build` in both `backend/` and `frontend/`
