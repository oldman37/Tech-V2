# User-Room Import Script — Research Specification

**Date:** 2026-04-21  
**Script target:** `c:\Tech-V2\backend\scripts\import-user-rooms.ts`  
**CSV source:** `c:\Tech-V2\docs\user.csv`

---

## 1. Current Schema Analysis

### 1.1 User Model (`users` table)

Relevant fields:

| Field | Type | Notes |
|---|---|---|
| `id` | `String` UUID PK | Internal ID |
| `email` | `String` unique | **Match key for CSV** |
| `firstName` | `String` | — |
| `lastName` | `String` | — |
| `officeLocation` | `String?` | Plain string — stores school name, NOT a FK |
| `user_rooms` | relation | Links to legacy `locations` table (old system) — **NOT the new `Room` model** |

**Critical finding — no direct User→Room link in the new system.**  
There is no `roomId` FK on `User` pointing to the new `Room` model. The `user_rooms` junction table exists but links `User` → `locations` (legacy table), not `User` → `Room`.

### 1.2 Room Model (`rooms` table)

```prisma
model Room {
  id         String         @id @default(uuid())
  locationId String                              // FK → OfficeLocation.id
  name       String
  type       String?
  building   String?
  floor      Int?
  capacity   Int?
  isActive   Boolean        @default(true)
  notes      String?
  createdAt  DateTime
  updatedAt  DateTime
  createdBy  String?
  updatedBy  String?
  location   OfficeLocation @relation(...)
  equipment  equipment[]
  tickets    Ticket[]

  @@unique([locationId, name])               // Composite unique key
  @@map("rooms")
}
```

**Key Room fields for the script:**
- Lookup key: `(locationId, name)` — unique composite
- `locationId` → `OfficeLocation.id`
- `name` → matches `user_room` column in CSV

### 1.3 OfficeLocation Model (`office_locations` table)

```prisma
model OfficeLocation {
  id      String  @id @default(uuid())
  name    String  @unique    // this name is the lookup key from CSV user_school
  code    String? @unique
  type    String
  isActive Boolean
  rooms   Room[]
  ...
  @@map("office_locations")
}
```

**Key OfficeLocation fields:**
- Lookup key: `name` (unique) — mapped from `user_school` in CSV with name corrections (see §2)

### 1.4 Schema Gap — Required Migration

The `User` model has **no field** to store a primary room assignment for the new `Room` model. To support this import, a schema migration is required:

**Add to `schema.prisma` User model:**
```prisma
primaryRoomId   String?
primaryRoom     Room?    @relation("UserPrimaryRoom", fields: [primaryRoomId], references: [id])
```

**Add to `schema.prisma` Room model:**
```prisma
primaryUsers    User[]   @relation("UserPrimaryRoom")
```

**Run migration before the script:**
```bash
cd backend
npx prisma migrate dev --name add-user-primary-room
```

---

## 2. School Name Mapping (CSV → DB)

The `user_school` column in user.csv uses abbreviated names that differ from the `OfficeLocation.name` in the database (which matches room.csv).

| CSV `user_school` | DB `OfficeLocation.name` | Notes |
|---|---|---|
| `Obion County Central High` | `Obion County Central High School` | Missing "School" suffix |
| `South Fulton Middle/High` | `South Fulton Middle/High School` | Missing "School" suffix |
| `Obion County Schools` | `District Office` | Completely different name — district-level staff, no school |
| `Hillcrest Elementary` | `Hillcrest Elementary` | Exact match ✓ |
| `Ridgemont Elementary` | `Ridgemont Elementary` | Exact match ✓ |
| `Lake Road Elementary` | `Lake Road Elementary` | Exact match ✓ |
| `South Fulton Elementary` | `South Fulton Elementary` | Exact match ✓ |

**The script must apply a static name-normalisation map before DB lookup.**

Rooms for **"Obion County Schools"** users (district staff) should be looked up under `District Office`. Many district users have blank `user_room`, but some have non-room strings like "Finance Director", "Technology Department", "Data Coach", "Payroll Office", "Receptionist" — these are job titles/positions masquerading as room names. The DB does contain some of these as real room names (e.g. "Payroll Office", "Receptionist" exist under District Office). The script should still attempt the match and log a warning on miss.

---

## 3. Script Approach — Step by Step

### Pre-conditions
- Schema migration (`primaryRoomId` on User) has been applied.
- rooms have been imported via `import-rooms.ts` (they exist in `rooms` table).
- Users exist in DB (synced via Entra ID script `sync-all-users.ts`).

### Step-by-step algorithm

```
1. INIT
   - load .env, connect PrismaClient via pg Pool (same pattern as all other scripts)
   - define SCHOOL_NAME_MAP constant (CSV name → DB OfficeLocation.name)
   - define counters: matched, skippedBlankRoom, userNotFound, locationNotFound,
                      roomNotFound, updated, errors

2. LOAD LOOKUP TABLES (fetch once, build Maps — avoid N+1 queries)
   - fetch all active OfficeLocations → Map<lowerName, { id, name }>
   - fetch all active Rooms → Map<`${locationId}::${lowerName}`, { id, name, locationId }>
   - fetch all Users (id + email) → Map<lowerEmail, { id, email }>

3. READ CSV
   - path.join(__dirname, '../../docs/user.csv')
   - parse with csv-parse/sync: { columns: true, skip_empty_lines: true, trim: true }
   - typed as UserCSVRow { user_firstname, user_lastname, user_email, user_school, user_room }

4. FOR EACH ROW (sequential — avoid parallel Prisma writes)
   a. Trim all fields
   b. Resolve DB school name:
        csvSchool = SCHOOL_NAME_MAP[row.user_school] ?? row.user_school
   c. IF user_room is blank/empty → log "[SKIP] <email> — no room in CSV" → skippedBlankRoom++ → continue
   d. Find User by email (case-insensitive via Map lookup on lower-cased email)
        IF not found → log "[WARN] User not found: <email>" → userNotFound++ → continue
   e. Find OfficeLocation by resolved school name (case-insensitive Map lookup)
        IF not found → log "[WARN] Location not found: '<csvSchool>' for <email>" → locationNotFound++ → continue
   f. Find Room by composite key `${locationId}::${lower(user_room)}`
        IF not found → log "[WARN] Room not found: '<user_room>' @ <school> for <email>" → roomNotFound++ → continue
   g. Update User: prisma.user.update({ where: { id }, data: { primaryRoomId: room.id } })
        Log "[OK] <email> → <school> / <room>"
        updated++

5. PRINT SUMMARY
   =============================================================
   User-Room Import Complete
   -------------------------------------------------------------
   Rows processed:            NNN
   Users updated:             NNN
   Skipped (blank room):      NNN
   Users not found in DB:     NNN
   Locations not found:       NNN
   Rooms not found in DB:     NNN
   Errors:                    NNN
   =============================================================
```

### 3.1 Edge Case Handling

| Scenario | Behaviour |
|---|---|
| `user_room` is blank/empty | Skip silently (log at DEBUG level only) — do NOT clear `primaryRoomId` |
| User email not in DB | Log `[WARN]`, increment `userNotFound`, continue |
| School name not in OfficeLocation | Log `[WARN]` with raw CSV value, increment `locationNotFound`, continue |
| Room name not found for that school | Log `[WARN]`, increment `roomNotFound`, continue — **do NOT create** new rooms |
| Multiple rows for same email | Last processed row wins (idempotent `update`) — log duplicate warning |
| Room name is a job title ("Finance Director") | Treated as a normal room lookup; will warn if it doesn't exist in DB |
| Case difference ("GYM" vs "Gym") | Map uses lowercase on both sides — matches correctly |
| User already has a `primaryRoomId` | Overwritten — the import is authoritative (idempotent re-run safe) |
| DB error on one user | Catch, log `[ERROR]`, increment errors counter, continue loop |

---

## 4. Script Location and File Structure

**File:** `c:\Tech-V2\backend\scripts\import-user-rooms.ts`

```typescript
/**
 * Import user-room assignments from CSV
 * Reads user.csv and sets User.primaryRoomId based on user_school + user_room columns.
 *
 * Pre-requisites:
 *   1. Run: npx prisma migrate dev --name add-user-primary-room
 *   2. Rooms must already be imported (import-rooms.ts)
 *   3. Users must already be synced (sync-all-users.ts)
 *
 * Usage: npx tsx scripts/import-user-rooms.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

// ... (see step-by-step above)
```

**Imports required (all already in package.json):**
- `@prisma/client`
- `@prisma/adapter-pg`
- `pg`
- `csv-parse` (specifically `csv-parse/sync`)
- `dotenv`
- `fs`, `path` (Node stdlib)

---

## 5. How to Run

```bash
# 1. Apply schema migration (one-time)
cd C:\Tech-V2\backend
npx prisma migrate dev --name add-user-primary-room

# 2. Run the import script
npx tsx scripts/import-user-rooms.ts
```

Same pattern as `import-rooms.ts` and `import-companies.ts`. No new dependencies required.

The script is safe to re-run — `prisma.user.update` is idempotent. Re-running with the same CSV produces the same result.

---

## 6. Expected Output

```
👥 Starting user-room import from CSV...

📄 Reading CSV file: C:\Tech-V2\docs\user.csv
✓ Parsed 487 rows from CSV

🔍 Fetching DB lookup tables...
  ✓ 9 office locations
  ✓ 412 rooms
  ✓ 489 users

📥 Processing rows...
[OK] aakers@ocboe.com → Obion County Central High School / 203
[SKIP] abennett@ocboe.com — no room in CSV
[WARN] Room not found: 'Reading Recovery' @ Hillcrest Elementary for aspicer@ocboe.com
[WARN] Room not found: 'SRO Office' @ Ridgemont Elementary for bdew@ocboe.com
...

=============================================================
User-Room Import Complete
-------------------------------------------------------------
Rows processed:              487
Users updated:               341
Skipped (blank room):         72
Users not found in DB:         0
Locations not found:           0
Rooms not found in DB:        74
Errors:                        0
=============================================================
```

---

## 7. Rooms in CSV That Are Unlikely to Exist in DB

Sampled from user.csv — these room names appear in the CSV but were NOT found in room.csv. The script will warn on these:

| CSV Room Name | School | Likely Status |
|---|---|---|
| `Reading Recovery` | Hillcrest Elementary | Not in room.csv — will warn |
| `SRO Office` | Multiple schools | Not in room.csv — will warn |
| `Alternative School` | OCCHS | **Exists** — in room.csv |
| `KItchen` | Lake Road Elementary | Typo of `Kitchen` — case-insensitive match will fail (name mismatch) |
| `GYM` | Lake Road Elementary | Case-insensitive → matches `Gym` ✓ |
| `Conference Room A4` | OCCHS | Not in room.csv — will warn |
| `Workroom East` / `Workroom West` | Lake Road Elementary | Not in room.csv — will warn |
| `A5`, `A6` | OCCHS | Not in room.csv — will warn |
| `Technology Department` | Obion County Schools | Not a room — job title — will warn |
| `Data Coach` | Obion County Schools | Not a room — job title — will warn |
| `After School` | Ridgemont Elementary | Not in room.csv — will warn |

---

## 8. Rooms That DO Match (Samples)

These names exist in both user.csv and room.csv and will resolve successfully:
- `203`, `160`, `217`, `126`, `129`, `109`, `132`, `138`, `206` → OCCHS numeric rooms ✓
- `Nurse`, `Guidance`, `Library`, `Cafeteria`, `Office`, `Band`, `Gym` → shared specials ✓
- `B3`, `B8`, `B22`, `C3`, `C13`, `A3`, `A1` → Lake Road wing rooms ✓
- `S-2`, `W-2`, `E-8`, `N-13`, `5-8 Workroom` → Ridgemont rooms ✓
- `W9`, `W8`, `E12`, `CDC`, `E2`, `E3` → Hillcrest rooms ✓
- `AG`, `S14`, `N16`, `S6`, `N3` → South Fulton M/H rooms ✓
- `14`, `27`, `19`, `4`, `13` → South Fulton Elementary numeric rooms ✓

---

## 9. Files Referenced

| File | Purpose |
|---|---|
| `c:\Tech-V2\backend\prisma\schema.prisma` | Schema — defines User, Room, OfficeLocation models |
| `c:\Tech-V2\docs\user.csv` | Source CSV for the import |
| `c:\Tech-V2\docs\room.csv` | Reference for which rooms exist in DB |
| `c:\Tech-V2\backend\scripts\import-rooms.ts` | Pattern reference — CSV parse + PrismaClient setup |
| `c:\Tech-V2\backend\scripts\import-companies.ts` | Pattern reference — typed CSV rows, cleanString helpers |
| `c:\Tech-V2\backend\scripts\assign-user-supervisors.ts` | Pattern reference — user iteration, officeLocation lookup |
| `c:\Tech-V2\backend\scripts\import-user-rooms.ts` | **Target script** (to be created) |
