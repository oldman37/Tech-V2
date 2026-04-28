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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── School Name Mapping (CSV → DB OfficeLocation.name) ────────────────────

const SCHOOL_NAME_MAP: Record<string, string> = {
  'Obion County Central High': 'Obion County Central High School',
  'South Fulton Middle/High':  'South Fulton Middle/High School',
  'Obion County Schools':      'District Office',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface UserCSVRow {
  user_firstname: string;
  user_lastname:  string;
  user_email:     string;
  user_school:    string;
  user_room:      string;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('👥 Starting user-room import from CSV...\n');

  const csvPath = path.join(__dirname, '../../docs/user.csv');

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at: ${csvPath}`);
  }

  console.log(`📄 Reading CSV file: ${csvPath}`);
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as UserCSVRow[];

  console.log(`✓ Parsed ${rows.length} rows from CSV\n`);

  // ── Build lookup Maps (fetch once — avoids N+1 queries) ─────────────────
  console.log('🔍 Fetching DB lookup tables...');

  const locations = await prisma.officeLocation.findMany({
    select: { id: true, name: true },
  });
  const locationMap = new Map<string, string>(); // lowerName → id
  for (const loc of locations) {
    locationMap.set(loc.name.toLowerCase(), loc.id);
  }
  console.log(`  ✓ ${locations.length} office locations`);

  const rooms = await prisma.room.findMany({
    select: { id: true, locationId: true, name: true },
  });
  const roomMap = new Map<string, string>(); // `${locationId}::${lowerName}` → roomId
  for (const room of rooms) {
    const key = `${room.locationId}::${room.name.toLowerCase()}`;
    roomMap.set(key, room.id);
  }
  console.log(`  ✓ ${rooms.length} rooms`);

  const users = await prisma.user.findMany({
    select: { id: true, email: true },
  });
  const userMap = new Map<string, string>(); // lowerEmail → userId
  for (const user of users) {
    userMap.set(user.email.toLowerCase(), user.id);
  }
  console.log(`  ✓ ${users.length} users\n`);

  // ── Counters ─────────────────────────────────────────────────────────────
  let updated          = 0;
  let skippedBlankRoom = 0;
  let userNotFound     = 0;
  let locationNotFound = 0;
  let roomNotFound     = 0;
  let errors           = 0;

  const seenEmails = new Map<string, number>(); // for duplicate detection

  console.log('📥 Processing rows...');

  // ── Per-row processing ───────────────────────────────────────────────────
  for (const row of rows) {
    const email    = row.user_email?.trim().toLowerCase();
    const schoolCsv = row.user_school?.trim();
    const roomName  = row.user_room?.trim();

    // Skip blank rooms
    if (!roomName) {
      skippedBlankRoom++;
      continue;
    }

    // Duplicate email check
    const prev = seenEmails.get(email);
    if (prev !== undefined) {
      console.warn(`  [WARN] Duplicate row for ${email} (row ${prev} and current) — last row wins`);
    }
    seenEmails.set(email, rows.indexOf(row) + 1);

    // Resolve user
    const userId = userMap.get(email);
    if (!userId) {
      console.warn(`  [WARN] User not found: ${email}`);
      userNotFound++;
      continue;
    }

    // Resolve school name
    const dbSchoolName = SCHOOL_NAME_MAP[schoolCsv] ?? schoolCsv;
    const locationId   = locationMap.get(dbSchoolName.toLowerCase());
    if (!locationId) {
      console.warn(`  [WARN] Location not found: '${schoolCsv}' (mapped to '${dbSchoolName}') for ${email}`);
      locationNotFound++;
      continue;
    }

    // Resolve room
    const roomKey = `${locationId}::${roomName.toLowerCase()}`;
    const roomId  = roomMap.get(roomKey);
    if (!roomId) {
      console.warn(`  [WARN] Room not found: '${roomName}' @ ${dbSchoolName} for ${email}`);
      roomNotFound++;
      continue;
    }

    // Update user
    try {
      await prisma.user.update({
        where: { id: userId },
        data:  { primaryRoomId: roomId },
      });
      console.log(`  [OK] ${email} → ${dbSchoolName} / ${roomName}`);
      updated++;
    } catch (err) {
      console.error(`  [ERROR] Failed to update ${email}:`, err);
      errors++;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`
=============================================================
User-Room Import Complete
-------------------------------------------------------------
Rows processed:            ${String(rows.length).padStart(6)}
Users updated:             ${String(updated).padStart(6)}
Skipped (blank room):      ${String(skippedBlankRoom).padStart(6)}
Users not found in DB:     ${String(userNotFound).padStart(6)}
Locations not found:       ${String(locationNotFound).padStart(6)}
Rooms not found in DB:     ${String(roomNotFound).padStart(6)}
Errors:                    ${String(errors).padStart(6)}
=============================================================
`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
