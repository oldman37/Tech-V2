import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const res = await pool.query(
    `SELECT name, code, type, "isActive" FROM office_locations ORDER BY name`
  );
  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);
