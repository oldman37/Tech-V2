/**
 * Import vendors/companies from CSV file into the database
 * This script reads company.csv and upserts vendor records.
 *
 * Usage: npx tsx scripts/import-companies.ts
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

// ─── Types ─────────────────────────────────────────────────────────────────

interface CompanyCSVRow {
  company_name:    string;
  company_address: string;
  company_city:    string;
  company_state:   string;
  company_zip:     string;
  company_contact: string;
  company_phone:   string;
  company_fax:     string;
  [key: string]: string;
}

// ─── Data Cleaning ──────────────────────────────────────────────────────────

/** Sentinel values that should be treated as null for phone/fax fields. */
const PHONE_SENTINELS = new Set(['0000000000', '9999999999']);

/**
 * Converts a raw string value to a cleaned string or null.
 * Empty strings become null. Whitespace is trimmed.
 */
function cleanString(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Cleans a phone or fax field, converting sentinel "no number" values to null.
 */
function cleanPhone(raw: string | undefined): string | null {
  const cleaned = cleanString(raw);
  if (cleaned === null) return null;
  // Strip all non-digit characters to check for sentinels
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (PHONE_SENTINELS.has(digitsOnly)) return null;
  return cleaned;
}

// ─── Main Import Function ───────────────────────────────────────────────────

async function importCompanies(): Promise<void> {
  console.log('🏢 Starting vendor/company import from CSV...\n');

  try {
    const csvPath = path.join(__dirname, '../../docs/company.csv');

    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`);
    }

    console.log(`📄 Reading CSV file: ${csvPath}`);

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CompanyCSVRow[];

    console.log(`✓ Parsed ${records.length} company entries from CSV\n`);

    // Track statistics
    let inserted = 0;
    let updated  = 0;
    let skipped  = 0;
    const errors: string[] = [];

    console.log('💾 Importing vendors...\n');

    for (const row of records) {
      const name = cleanString(row.company_name);

      // Skip rows with no company name
      if (!name) {
        skipped++;
        continue;
      }

      const vendorData = {
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
        // vendors.name has @unique — use upsert for atomic write
        const isNew = !(await prisma.vendors.findUnique({ where: { name }, select: { id: true } }));
        await prisma.vendors.upsert({
          where:  { name },
          update: vendorData,
          create: { ...vendorData, isActive: true },
        });
        if (isNew) {
          console.log(`  ✓ Inserted: ${name}`);
          inserted++;
        } else {
          console.log(`  ↻ Updated:  ${name}`);
          updated++;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to import "${name}": ${message}`);
        console.error(`  ✗ Error with "${name}": ${message}`);
      }

      // Progress indicator every 100 records
      const total = inserted + updated + skipped + errors.length;
      if (total % 100 === 0) {
        process.stdout.write(`\r  Processed: ${total}/${records.length}  `);
      }
    }

    console.log('\n\n✅ Import completed!\n');

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('📊 IMPORT SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`✓ Vendors inserted: ${inserted}`);
    console.log(`↻ Vendors updated:  ${updated}`);
    console.log(`⊘ Rows skipped:     ${skipped}`);
    console.log(`✗ Errors:           ${errors.length}`);
    console.log('═══════════════════════════════════════\n');

    if (errors.length > 0) {
      console.log('❌ ERRORS:');
      errors.slice(0, 20).forEach((err) => console.log(`  • ${err}`));
      if (errors.length > 20) {
        console.log(`  ... and ${errors.length - 20} more errors`);
      }
      console.log('');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Fatal error during import:', message);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// ─── Entry Point ────────────────────────────────────────────────────────────

importCompanies()
  .then(() => {
    console.log('✨ Company import script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Company import script failed:', error);
    process.exit(1);
  });
