import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Fix Sped Department code from empty string to 'SPED'
  const res = await pool.query(
    `UPDATE office_locations SET code = 'SPED' WHERE name = 'Sped Department' AND (code = '' OR code IS NULL) RETURNING name, code`
  );
  if (res.rowCount) {
    console.log(`Updated ${res.rowCount} row(s):`, res.rows);
  } else {
    console.log('No rows needed updating (already has code or not found)');
  }
  await pool.end();
}

main().catch(console.error);
