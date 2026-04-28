import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // 1. Deactivate Black Oak Elementary and remove any supervisor assignments
  const boe = await pool.query(
    `SELECT id, name, code FROM office_locations WHERE code = 'BOE' OR name = 'Black Oak Elementary'`
  );
  if (boe.rows.length > 0) {
    for (const loc of boe.rows) {
      const del = await pool.query(
        `DELETE FROM location_supervisors WHERE "locationId" = $1 RETURNING id, "supervisorType"`,
        [loc.id]
      );
      console.log(`Removed ${del.rowCount} supervisor assignments from ${loc.name}`);
      await pool.query(
        `UPDATE office_locations SET "isActive" = false WHERE id = $1`,
        [loc.id]
      );
      console.log(`Deactivated: ${loc.name}`);
    }
  } else {
    console.log('Black Oak Elementary not found');
  }

  // 2. Deactivate old Ridgemont Elementary (code RES) and remove assignments
  const res = await pool.query(
    `SELECT id, name, code, "isActive" FROM office_locations WHERE code = 'RES' OR name = 'Ridgemont Elementary'`
  );
  if (res.rows.length > 0) {
    for (const loc of res.rows) {
      const del = await pool.query(
        `DELETE FROM location_supervisors WHERE "locationId" = $1 RETURNING id`,
        [loc.id]
      );
      if (del.rowCount) console.log(`Removed ${del.rowCount} supervisor assignments from ${loc.name}`);
      await pool.query(
        `UPDATE office_locations SET "isActive" = false WHERE id = $1`,
        [loc.id]
      );
      console.log(`Deactivated: ${loc.name} (${loc.code})`);
    }
  }

  // 3. Verify OCMS is active
  const ocms = await pool.query(
    `SELECT id, name, code, "isActive" FROM office_locations WHERE code = 'OCMS'`
  );
  console.log('\nObion County Middle School:', ocms.rows);

  await pool.end();
}

main().catch(console.error);
