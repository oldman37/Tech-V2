#!/usr/bin/env bash
# unassign-missing-audit-equipment.sh
#
# For every unresolved missing item in an inventory audit session, clears the
# equipment's room assignment (sets "roomId" = NULL) while keeping the school
# assignment ("officeLocationId") intact.
#
# "Unresolved missing" = inventory_audit_items WHERE status = 'MISSING'
#                                                AND "resolvedAt" IS NULL
#
# Equipment is kept at the school so it still appears in school-level inventory
# views but no longer shows as assigned to any room — matching the physical
# reality that the item was not found during the audit.
#
# Optional filters:
#   --fy "2025-2026"    Only process sessions for this fiscal year
#   --school "Name"     Only process sessions for this school (partial match)
#
# Usage (from the Tech-V2 project root):
#   bash scripts/unassign-missing-audit-equipment.sh                    # dry run
#   bash scripts/unassign-missing-audit-equipment.sh --force            # apply all
#   bash scripts/unassign-missing-audit-equipment.sh --fy "2025-2026" --force
#   bash scripts/unassign-missing-audit-equipment.sh --school "Lincoln" --force

set -euo pipefail

FORCE=false
FY_FILTER=""
SCHOOL_FILTER=""

# Parse arguments
i=1
while [[ $i -le $# ]]; do
  arg="${!i}"
  case "$arg" in
    --force) FORCE=true ;;
    --fy)
      i=$((i+1))
      FY_FILTER="${!i}"
      ;;
    --fy=*) FY_FILTER="${arg#--fy=}" ;;
    --school)
      i=$((i+1))
      SCHOOL_FILTER="${!i}"
      ;;
    --school=*) SCHOOL_FILTER="${arg#--school=}" ;;
  esac
  i=$((i+1))
done

# Escape single quotes in filter args to prevent broken SQL strings
FY_FILTER="${FY_FILTER//\'/\'\'}"
SCHOOL_FILTER="${SCHOOL_FILTER//\'/\'\'}"

PSQL="sudo docker compose exec -T db psql -U techv2 -d tech_v2 -t -A"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "   Inventory Audit — Unassign Missing Equipment from Rooms     "
echo "═══════════════════════════════════════════════════════════════"
if $FORCE; then
  echo "  MODE: LIVE (changes will be written)"
else
  echo "  MODE: DRY RUN (no changes written)"
fi
[[ -n "$FY_FILTER"     ]] && echo "  Filter fiscal year : $FY_FILTER"
[[ -n "$SCHOOL_FILTER" ]] && echo "  Filter school      : $SCHOOL_FILTER (partial match)"
echo ""

# ── Build the optional WHERE clauses for session filters ────────────────────
SESSION_FILTER=""
if [[ -n "$FY_FILTER" ]]; then
  SESSION_FILTER="${SESSION_FILTER} AND s.\"fiscalYear\" = '${FY_FILTER}'"
fi
if [[ -n "$SCHOOL_FILTER" ]]; then
  SESSION_FILTER="${SESSION_FILTER} AND ol.name ILIKE '%${SCHOOL_FILTER}%'"
fi

# ── Core query: equipment that is MISSING+unresolved AND still has a roomId ──
CANDIDATE_QUERY="
  SELECT
    e.id            AS equipment_id,
    e.\"assetTag\"  AS asset_tag,
    e.name          AS equip_name,
    ol.name         AS school,
    r.name          AS room,
    s.\"fiscalYear\" AS fiscal_year
  FROM inventory_audit_items ai
  JOIN inventory_audit_sessions s  ON s.id  = ai.\"sessionId\"
  JOIN equipment e                  ON e.id  = ai.\"equipmentId\"
  JOIN office_locations ol          ON ol.id = s.\"officeLocationId\"
  LEFT JOIN rooms r                 ON r.id  = e.\"roomId\"
  WHERE ai.status       = 'MISSING'
    AND ai.\"resolvedAt\" IS NULL
    AND e.\"roomId\"    IS NOT NULL
    ${SESSION_FILTER}
  ORDER BY ol.name, r.name, e.\"assetTag\"
"

# ── 1. Count candidates ──────────────────────────────────────────────────────
COUNT=$($PSQL -c "SELECT COUNT(*) FROM (${CANDIDATE_QUERY}) sub;" | tr -d '[:space:]')

if [[ "$COUNT" == "0" ]]; then
  echo "✅  No equipment found that needs updating."
  echo "    All unresolved missing items either have no room assignment already,"
  echo "    or there are no unresolved missing items matching your filters."
  echo ""
  exit 0
fi

# ── 2. Preview table ─────────────────────────────────────────────────────────
echo "  Found $COUNT item(s) whose room assignment will be cleared:"
echo ""
echo "  Asset Tag   School                             Room                   FY          Name"
echo "  ─────────────────────────────────────────────────────────────────────────────────────"

$PSQL -c "
  SELECT
    rpad(e.\"assetTag\", 11) ||
    rpad(ol.name, 34) ||
    rpad(coalesce(r.name, '(none)'), 22) ||
    rpad(coalesce(s.\"fiscalYear\", 'null'), 11) ||
    e.name
  FROM inventory_audit_items ai
  JOIN inventory_audit_sessions s  ON s.id  = ai.\"sessionId\"
  JOIN equipment e                  ON e.id  = ai.\"equipmentId\"
  JOIN office_locations ol          ON ol.id = s.\"officeLocationId\"
  LEFT JOIN rooms r                 ON r.id  = e.\"roomId\"
  WHERE ai.status       = 'MISSING'
    AND ai.\"resolvedAt\" IS NULL
    AND e.\"roomId\"    IS NOT NULL
    ${SESSION_FILTER}
  ORDER BY ol.name, r.name, e.\"assetTag\"
  LIMIT 100;
" | while IFS= read -r line; do
  echo "  $line"
done

if [[ "$COUNT" -gt 100 ]]; then
  echo "  ... and $((COUNT - 100)) more (showing first 100)"
fi

echo ""

# ── 3. Dry-run gate ──────────────────────────────────────────────────────────
if ! $FORCE; then
  echo "⚠   DRY RUN — no changes made."
  echo "    Re-run with --force to clear the room assignment on all $COUNT item(s)."
  echo ""
  echo "    bash scripts/unassign-missing-audit-equipment.sh --force"
  echo ""
  exit 0
fi

# ── 4. Apply — clear roomId on matched equipment ─────────────────────────────
UPDATED=$($PSQL -c "
  WITH target_equipment AS (
    SELECT DISTINCT e.id
    FROM inventory_audit_items ai
    JOIN inventory_audit_sessions s ON s.id  = ai.\"sessionId\"
    JOIN equipment e                 ON e.id  = ai.\"equipmentId\"
    JOIN office_locations ol         ON ol.id = s.\"officeLocationId\"
    WHERE ai.status       = 'MISSING'
      AND ai.\"resolvedAt\" IS NULL
      AND e.\"roomId\"    IS NOT NULL
      ${SESSION_FILTER}
  ),
  upd AS (
    UPDATE equipment
    SET \"roomId\" = NULL
    WHERE id IN (SELECT id FROM target_equipment)
    RETURNING id
  )
  SELECT COUNT(*) FROM upd;
" | tr -d '[:space:]')

echo "✅  Cleared room assignment on $UPDATED equipment record(s)."
echo "    Equipment remains assigned to its school (officeLocationId unchanged)."
echo ""
echo "  Next steps:"
echo "    1. These items will now appear as 'at school, not in a room' in inventory."
echo "    2. The audit items remain MISSING + unresolved in the audit system."
echo "    3. Use the Resolve button in the Unresolved Items page to formally close"
echo "       each item once you know its final disposition."
echo ""
