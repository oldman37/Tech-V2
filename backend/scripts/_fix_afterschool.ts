import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Find afterschool director assignments NOT at the Afterschool (AS) location
  const stale = await pool.query(
    `SELECT ls.id, ls."supervisorType", u."displayName", ol.name as location, ol.code
     FROM location_supervisors ls
     JOIN users u ON ls."userId" = u.id
     JOIN office_locations ol ON ls."locationId" = ol.id
     WHERE ls."supervisorType" = 'AFTERSCHOOL_DIRECTOR' AND ol.code != 'AS'`
  );

  console.log('Stale afterschool director assignments:', stale.rows.length);
  console.table(stale.rows);

  if (stale.rows.length > 0) {
    const ids = stale.rows.map((r: any) => r.id);
    const del = await pool.query(
      `DELETE FROM location_supervisors WHERE id = ANY($1) RETURNING id`,
      [ids]
    );
    console.log('Deleted', del.rowCount, 'stale assignments');
  }

  await pool.end();
}

main().catch(console.error);
