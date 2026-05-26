#!/usr/bin/env bash
# backfill-audit-fiscal-year.sh
#
# Ties completed/in-progress InventoryAuditSession records to the currently
# ACTIVE FiscalYearAudit by updating their "fiscalYear" column to match.
#
# Usage (from the Tech-V2 project root):
#   bash scripts/backfill-audit-fiscal-year.sh           # dry run
#   bash scripts/backfill-audit-fiscal-year.sh --force   # apply

set -euo pipefail

FORCE=false
for arg in "$@"; do
  [[ "$arg" == "--force" ]] && FORCE=true
done

PSQL="sudo docker compose exec -T db psql -U techv2 -d tech_v2 -t -A"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "   Inventory Audit — Backfill Fiscal Year on Sessions      "
echo "═══════════════════════════════════════════════════════════"
if $FORCE; then
  echo "  MODE: LIVE (changes will be written)"
else
  echo "  MODE: DRY RUN (no changes written)"
fi
echo ""

# ── 1. Find the active fiscal year ──────────────────────────────────────────
FY=$($PSQL -c "SELECT \"fiscalYear\" FROM fiscal_year_audits WHERE status = 'ACTIVE' LIMIT 1;" 2>/dev/null | tr -d '[:space:]')

if [[ -z "$FY" ]]; then
  echo "❌  No ACTIVE FiscalYearAudit found in the database."
  echo "    Start a fiscal year audit in the app first, then re-run this script."
  echo ""
  exit 1
fi

echo "  Active fiscal year : $FY"
echo ""

# ── 2. Preview affected sessions ────────────────────────────────────────────
COUNT=$($PSQL -c "
  SELECT COUNT(*) FROM inventory_audit_sessions
  WHERE status IN ('COMPLETED','IN_PROGRESS')
    AND \"fiscalYear\" IS DISTINCT FROM '$FY';
" | tr -d '[:space:]')

if [[ "$COUNT" == "0" ]]; then
  echo "✅  No sessions need updating — all completed/in-progress sessions"
  echo "    already have fiscalYear = \"$FY\"."
  echo ""
  exit 0
fi

echo "  Found $COUNT session(s) that will be updated → \"$FY\""
echo ""
echo "  School                             Room                   Status       Current FY"
echo "  ─────────────────────────────────────────────────────────────────────────────────"

$PSQL -c "
  SELECT
    rpad(ol.name, 34) ||
    rpad(r.name, 22) ||
    rpad(s.status, 12) ||
    coalesce(s.\"fiscalYear\", 'null')
  FROM inventory_audit_sessions s
  JOIN office_locations ol ON ol.id = s.\"officeLocationId\"
  JOIN rooms r ON r.id = s.\"roomId\"
  WHERE s.status IN ('COMPLETED','IN_PROGRESS')
    AND s.\"fiscalYear\" IS DISTINCT FROM '$FY'
  ORDER BY ol.name, r.name;
" | while IFS= read -r line; do
  echo "  $line"
done

echo ""

# ── 3. Dry-run gate ──────────────────────────────────────────────────────────
if ! $FORCE; then
  echo "⚠   DRY RUN — no changes made."
  echo "    Re-run with --force to update all $COUNT session(s)."
  echo ""
  echo "    bash scripts/backfill-audit-fiscal-year.sh --force"
  echo ""
  exit 0
fi

# ── 4. Apply the update ──────────────────────────────────────────────────────
UPDATED=$($PSQL -c "
  WITH upd AS (
    UPDATE inventory_audit_sessions
    SET \"fiscalYear\" = '$FY'
    WHERE status IN ('COMPLETED','IN_PROGRESS')
      AND \"fiscalYear\" IS DISTINCT FROM '$FY'
    RETURNING id
  )
  SELECT COUNT(*) FROM upd;
" | tr -d '[:space:]')

echo "✅  Updated $UPDATED session(s) → fiscalYear = \"$FY\""
echo ""
echo "  Next steps:"
echo "    1. Refresh the Inventory Audit page — completed rooms should now"
echo "       appear as done under the fiscal year."
echo "    2. For any school that is fully audited, click \"Complete Location\""
echo "       in the app to mark it done within the fiscal year audit."
echo ""
