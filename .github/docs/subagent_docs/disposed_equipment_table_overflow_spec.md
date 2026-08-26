# Spec: Disposed Equipment table forces horizontal scroll instead of reflowing

## Current state analysis
`frontend/src/pages/DisposedEquipment.tsx` defines its columns for the shared
`ResponsiveTable`. Three identifier columns render raw, uncontained values:
- `assetTag` (line ~191): `<strong style={{ fontWeight: 600 }}>{item.assetTag}</strong>`
  — and it is `isPrimary: true`, so the column-drop logic never hides it.
- `serialNumber` (line ~219): `item.serialNumber || '—'` — bare text.
- `poNumber` (line ~250): `item.poNumber || '—'` — bare text.

`ResponsiveTable`'s `estimateMinWidth` budgets column space from the **header label text**
only, not cell content. A short header ("Serial #", "PO #") plus a long, space-less value
under-budgets the column: the JS fit calculation treats it as cheap, but the browser's
`auto` table-layout still expands the column to the full unbroken token, because normal and
`break-word` wrapping do not reduce an unbroken token's min-content width.

## Reference implementation already in this repo
`frontend/src/pages/InventoryManagement.tsx` fixed the identical three columns:
- `assetTag` line ~211: `<strong style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>`
- `serialNumber` lines ~247-262 and `poNumber` lines ~321-336: a `<span title={value}>`
  with `fontFamily: 'monospace'`, `fontSize: '0.8125rem'`, `overflowWrap: 'anywhere'`, and
  an em-dash `<span style={{ color: 'var(--slate-400)' }}>—</span>` fallback.

**Deviation from the source bug report, deliberate.** The source document prescribes
`whiteSpace: nowrap` + `overflow: hidden` + `textOverflow: ellipsis` + `maxWidth: 100%`
truncation. This repo's own code comment at `InventoryManagement.tsx:249-251` records that
this exact approach was tried and **does not work** in an auto-layout table — a percentage
`max-width` resolves to `none` during intrinsic sizing, so the cell simply grows. Wrapping
is what shrinks it. We copy the pattern that actually ships and works here, which is also
what the source document's own guidance asks for ("prefer whichever pattern this repo
already uses elsewhere for the same kind of field").

## Problem definition
Long unbroken identifiers push the table wider than its container at ordinary desktop
widths, producing a raw horizontal scrollbar instead of the column-drop reflow every other
table performs.

## Proposed solution architecture
Apply the proven `overflowWrap: 'anywhere'` containment to exactly the three offending
columns, matching Inventory Management's rendering byte-for-byte in style shape.

## Implementation steps
1. `assetTag`: add `overflowWrap: 'anywhere'` to the existing `<strong>` style.
2. `serialNumber`: render a `<span title>` with monospace + `overflowWrap: 'anywhere'`,
   falling back to the muted em dash.
3. `poNumber`: identical treatment.
   -> verify each: `git diff` touches only these three `render` functions.
4. Frontend image build. -> verify: exits 0.

No other column is touched: Name, Category, Brand, Model, Location, dates, currency and
funding either wrap naturally on spaces or are short/fixed-format. `disposedReason` already
has its own `title` + manual 40-char truncation and is left alone.

## Dependencies
None. No change to `ResponsiveTable.tsx`.

## Configuration changes
None.

## Risks and mitigations
- Risk: over-applying containment to normal text columns. Mitigation: scope strictly to the
  three identifier columns.
- Risk: em-dash fallback styling drifts from the page's existing convention. Mitigation:
  `disposedReason` on this same page already uses `<span style={{ color:
  'var(--slate-400)' }}>—</span>`; reuse it.
