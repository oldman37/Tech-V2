import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // All active locations and their supervisor counts
  const locations = await pool.query(
    `SELECT ol.name, ol.code, ol.type, ol."isActive",
            COUNT(ls.id) as supervisor_count
     FROM office_locations ol
     LEFT JOIN location_supervisors ls ON ol.id = ls."locationId"
     WHERE ol."isActive" = true
     GROUP BY ol.id
     ORDER BY 
       CASE ol.type WHEN 'SCHOOL' THEN 0 WHEN 'DISTRICT_OFFICE' THEN 1 WHEN 'DEPARTMENT' THEN 2 WHEN 'PROGRAM' THEN 3 END,
       ol.name`
  );
  console.log('\n=== ACTIVE LOCATIONS ===');
  console.table(locations.rows);

  // All current supervisor assignments
  const assignments = await pool.query(
    `SELECT ol.name as location, ol.type, ls."supervisorType", u."displayName", u.email
     FROM location_supervisors ls
     JOIN users u ON ls."userId" = u.id
     JOIN office_locations ol ON ls."locationId" = ol.id
     ORDER BY 
       CASE ol.type WHEN 'SCHOOL' THEN 0 WHEN 'DISTRICT_OFFICE' THEN 1 WHEN 'DEPARTMENT' THEN 2 WHEN 'PROGRAM' THEN 3 END,
       ol.name, ls."supervisorType"`
  );
  console.log('\n=== ALL SUPERVISOR ASSIGNMENTS ===');
  console.table(assignments.rows);

  await pool.end();
}

main().catch(console.error);
