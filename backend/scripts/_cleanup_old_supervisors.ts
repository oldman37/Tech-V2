import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const old = await pool.query(
    `SELECT ls.id, ls."supervisorType", u."displayName", ol.name as location
     FROM location_supervisors ls
     JOIN users u ON ls."userId" = u.id
     JOIN office_locations ol ON ls."locationId" = ol.id
     WHERE ls."supervisorType" IN ('CTE_SUPERVISOR','PREK_SUPERVISOR','SUPERVISORS_OF_INSTRUCTION')`
  );
  console.log('Stale records found:', old.rows.length);
  console.table(old.rows);

  if (old.rows.length > 0) {
    const del = await pool.query(
      `DELETE FROM location_supervisors
       WHERE "supervisorType" IN ('CTE_SUPERVISOR','PREK_SUPERVISOR','SUPERVISORS_OF_INSTRUCTION')
       RETURNING id`
    );
    console.log('Deleted', del.rowCount, 'stale assignments');
  }
  await pool.end();
}

main().catch(console.error);
