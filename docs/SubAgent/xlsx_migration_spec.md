# xlsx → ExcelJS Migration Specification

**Generated:** May 1, 2026  
**Author:** GitHub Copilot (Claude Sonnet 4.6)  
**Status:** RESEARCH ONLY — No files have been modified  
**Related:** `docs/NPM_DEPENDENCY_AUDIT.md` Section 6.1 (C-1)

---

## 1. Executive Summary

`xlsx` v0.18.5 is abandoned (last npm publish: March 2022), has two active HIGH-severity CVEs with no npm fix path (ReDoS and Prototype Pollution), and directly processes user-uploaded spreadsheet files — making it a live production attack surface.

**Replacement:** `exceljs` (MIT license, actively maintained, 13k+ GitHub stars, built-in TypeScript types)

**Scope:**
- **4 backend files** require code changes
- **2 package.json files** require dependency changes
- **0 frontend files** — frontend only references `'xlsx'` as a format string value, not as a package import
- **0 shared files** — unused in shared package

**Complexity:** MEDIUM-HIGH — ExcelJS is entirely async/Promise-based vs xlsx's synchronous API; CSV handling requires a separate code path

---

## 2. Files Requiring Changes

| # | File | Type | CRUD | Complexity |
|---|---|---|---|---|
| 1 | `backend/src/services/inventoryImport.service.ts` | Production | READ (buffer) | Medium — async already, needs CSV branch |
| 2 | `backend/src/controllers/inventory.controller.ts` | Production | WRITE (buffer) | Medium — async already, `ws['!cols']` special case |
| 3 | `backend/scripts/read-inventory-excel.ts` | Utility script | READ (file) | Low — needs async wrapper |
| 4 | `backend/scripts/read-excel.ts` | Utility script | READ (file) | Low — needs async wrapper |
| 5 | `backend/package.json` | Config | — | Trivial — swap dependency |
| 6 | `package.json` (root) | Config | — | Trivial — remove duplicate |

---

## 3. Complete xlsx API Inventory

### 3.1 `backend/src/services/inventoryImport.service.ts`

**Usage:** Reads a user-uploaded Excel buffer (or CSV buffer) and returns typed row data.

| xlsx API Call | Line | Options Passed | Purpose |
|---|---|---|---|
| `import * as XLSX from 'xlsx'` | 9 | — | Package import |
| `XLSX.read(fileBuffer, { type: 'buffer', raw: false, cellDates: true })` | 229 | `type: 'buffer'` — input is Node.js Buffer; `raw: false` — format values; `cellDates: true` — return Date objects (not serial numbers) | Parse uploaded file buffer into workbook |
| `workbook.SheetNames[0]` | 232 | — | Get first sheet name as fallback |
| `workbook.SheetNames.find(name => name.toLowerCase().includes(...))` | 235–239 | — | Find preferred sheet ("non-disposed" or "equipment") |
| `workbook.Sheets[sheetName]` | 241 | — | Access worksheet by name |
| `XLSX.utils.sheet_to_json<ExcelRowData>(worksheet, { raw: false, defval: null })` | 247–250 | `raw: false` — formatted values; `defval: null` — empty cells become `null` | Convert worksheet to typed JSON array |

**Data flow:**  
`Buffer (fileBuffer)` → `XLSX.read()` → workbook → sheet name lookup → `workbook.Sheets[name]` → `XLSX.utils.sheet_to_json()` → `ExcelRowData[]`

**Important:** This function is `private async parseExcelFile(fileBuffer: Buffer)`. The `importFromExcel` public method already has `fileName: string` as a parameter but does not pass it to `parseExcelFile`. This is the key CSV gap — see Section 6.

---

### 3.2 `backend/src/controllers/inventory.controller.ts`

**Usage:** Builds an Excel workbook from inventory query results and sends as a binary download.

| xlsx API Call | Line | Options Passed | Purpose |
|---|---|---|---|
| `import * as XLSX from 'xlsx'` | 15 | — | Package import |
| `XLSX.utils.book_new()` | 490 | — | Create empty workbook |
| `XLSX.utils.json_to_sheet(rows)` | 491 | — | Convert JSON array to worksheet (auto-generates header row from object keys) |
| `ws['!cols'] = colWidths` | 494–497 | `wch` (width in characters) per column | Set column widths — **direct worksheet property access** |
| `XLSX.utils.book_append_sheet(wb, ws, 'Inventory')` | 499 | — | Attach worksheet to workbook with name `'Inventory'` |
| `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })` | 501 | `type: 'buffer'` — output Node.js Buffer; `bookType: 'xlsx'` — OOXML format | Serialize workbook to buffer for HTTP response |

**Data flow:**  
`InventoryItem[]` → `rows` (mapped objects) → `XLSX.utils.book_new()` + `XLSX.utils.json_to_sheet()` + `ws['!cols']` + `XLSX.utils.book_append_sheet()` → `XLSX.write()` → `Buffer` → `res.send(buf)`

**Column width logic:**  
```typescript
const colWidths = Object.keys(rows[0] || {}).map((key) => ({
  wch: Math.max(key.length, 15),   // minimum 15 chars wide
}));
ws['!cols'] = colWidths;
```
This maps each column header length to a minimum 15-character width. ExcelJS uses a different property on `worksheet.columns`.

---

### 3.3 `backend/scripts/read-inventory-excel.ts`

**Usage:** One-off utility script to inspect `docs/Inventory - 02-03-2026.xlsx`.

| xlsx API Call | Line | Options | Purpose |
|---|---|---|---|
| `import * as XLSX from 'xlsx'` | 1 | — | Package import |
| `XLSX.readFile(excelFilePath)` | 9 | — | Synchronous file read from disk |
| `workbook.SheetNames` | 12 | — | List sheet names |
| `workbook.SheetNames[0]` | 16 | — | Get first sheet name |
| `workbook.Sheets[sheetName]` | 17 | — | Access first worksheet |
| `XLSX.utils.sheet_to_json(worksheet)` | 21 | none — defaults: `raw: true`, no `defval` | Convert to plain JSON (no typed generics) |

**Data flow:**  
`filePath` → `XLSX.readFile()` → workbook → `workbook.SheetNames[0]` → `workbook.Sheets[name]` → `XLSX.utils.sheet_to_json()` → `Record<string, unknown>[]` → `console.log()`

**Note:** Code runs in a synchronous top-level `try/catch` — no `async` wrapper. ExcelJS requires async.

---

### 3.4 `backend/scripts/read-excel.ts`

**Usage:** One-off utility script to inspect `Superviors list.xlsx`.

| xlsx API Call | Line | Options | Purpose |
|---|---|---|---|
| `import * as XLSX from 'xlsx'` | 1 | — | Package import |
| `XLSX.readFile(excelFilePath)` | 9 | — | Synchronous file read from disk |
| `workbook.SheetNames` | 12 | — | List sheet names |
| `workbook.SheetNames[0]` | 16 | — | Get first sheet name |
| `workbook.Sheets[sheetName]` | 17 | — | Access first worksheet |
| `XLSX.utils.sheet_to_json(worksheet)` | 21 | none | Convert to plain JSON |

Identical pattern to `read-inventory-excel.ts` — same migration applies.

---

## 4. Complete API Mapping Table

| xlsx API | ExcelJS Equivalent | Notes |
|---|---|---|
| `import * as XLSX from 'xlsx'` | `import ExcelJS from 'exceljs'` | ExcelJS ships built-in TypeScript types — no `@types/exceljs` needed |
| `XLSX.read(buf, { type: 'buffer', cellDates: true })` | `const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf)` | Async; ExcelJS always returns native `Date` objects — `cellDates` option not needed |
| `XLSX.readFile(filePath)` | `const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(filePath)` | Async |
| `workbook.SheetNames[0]` | `workbook.worksheets[0]?.name` | `worksheets` is an array of `ExcelJS.Worksheet` |
| `workbook.SheetNames.find(fn)` | `workbook.worksheets.find(ws => fn(ws.name))?.name` | `.find()` on worksheet objects |
| `workbook.Sheets[sheetName]` | `workbook.getWorksheet(sheetName)` | Returns `ExcelJS.Worksheet \| undefined` |
| `XLSX.utils.sheet_to_json<T>(ws, { raw: false, defval: null })` | Manual `ws.eachRow()` iteration — see Section 5.1 helper | No direct equivalent; requires row iteration |
| `XLSX.utils.sheet_to_json(ws)` (no options) | Same manual `ws.eachRow()` iteration | Same helper function applies |
| `XLSX.utils.book_new()` | `const wb = new ExcelJS.Workbook()` | |
| `XLSX.utils.json_to_sheet(rows)` | `wb.addWorksheet(name)` then `ws.columns = [...]` + `ws.addRows(rows)` | Columns and header row are set together |
| `ws['!cols'] = [{wch: N}, ...]` | `ws.columns = [{ header: key, key: key, width: N }, ...]` | Column widths are set on the column definition array, not a property |
| `XLSX.utils.book_append_sheet(wb, ws, name)` | Handled by `wb.addWorksheet(name)` | No separate append step — `addWorksheet` returns the sheet |
| `XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })` | `Buffer.from(await wb.xlsx.writeBuffer())` | Async; cast to `Buffer` for `.length` and `res.send()` compatibility |
| `XLSX.writeFile(wb, path)` | `await wb.xlsx.writeFile(path)` | Async — not currently used in this project |

---

## 5. Complete Before/After Code for Each File

### 5.1 Shared Helper: `worksheetToJson<T>()`

This helper replaces `XLSX.utils.sheet_to_json()` and should be added as a private method in `InventoryImportService` (or as a module-level utility in the service file).

```typescript
// ── BEFORE (xlsx): ──────────────────────────────────────────────────────────
const rows = XLSX.utils.sheet_to_json<ExcelRowData>(worksheet, {
  raw: false,
  defval: null,
});

// ── AFTER (exceljs): ─────────────────────────────────────────────────────────
// Private helper added to InventoryImportService:
private worksheetToJson<T extends object>(worksheet: ExcelJS.Worksheet): T[] {
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = cell.value?.toString() ?? '';
  });

  const rows: T[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row

    const rowData: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;

      let value: unknown = null;
      if (cell.value !== null && cell.value !== undefined) {
        if (cell.value instanceof Date) {
          value = cell.value; // Already a Date object — equivalent to cellDates: true
        } else if (
          typeof cell.value === 'object' &&
          'richText' in (cell.value as object)
        ) {
          // Rich text — flatten to plain string
          value = (cell.value as ExcelJS.CellRichTextValue).richText
            .map((r) => r.text)
            .join('');
        } else if (
          typeof cell.value === 'object' &&
          'result' in (cell.value as object)
        ) {
          // Formula cell — use the cached result value
          value = (cell.value as ExcelJS.CellFormulaValue).result as
            | number
            | string
            | null;
        } else {
          value = cell.value;
        }
      }
      rowData[header] = value; // null for empty cells — equivalent to defval: null
    });

    rows.push(rowData as T);
  });

  return rows;
}
```

---

### 5.2 `backend/src/services/inventoryImport.service.ts`

**Critical note on CSV handling:** The current `parseExcelFile` method accepts raw `Buffer` without knowing the file extension. `XLSX.read()` silently handles CSV files. ExcelJS **does not** support CSV — it will throw on a CSV buffer. The backend already has `csv-parse@^6.1.0` installed. The migration must:
1. Rename `parseExcelFile` to `parseFile`
2. Pass `fileName` down from `importFromExcel`
3. Branch on extension: `.csv` → `csv-parse`, everything else → ExcelJS

**BEFORE (xlsx — `parseExcelFile` private method, lines 222–264):**

```typescript
// import
import * as XLSX from 'xlsx';

// private method
private async parseExcelFile(fileBuffer: Buffer): Promise<ExcelRowData[]> {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: false, cellDates: true });

    let sheetName = workbook.SheetNames[0];
    const targetSheet = workbook.SheetNames.find(name =>
      name.toLowerCase().includes('non-disposed') ||
      name.toLowerCase().includes('equipment')
    );
    if (targetSheet) {
      sheetName = targetSheet;
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<ExcelRowData>(worksheet, {
      raw: false,
      defval: null,
    });

    logger.info('Excel sheet parsed', { sheetName, rowCount: rows.length });
    return rows;
  } catch (error) {
    logger.error('Failed to parse Excel file', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to parse file. Please ensure it is a valid .xlsx, .xls, or .csv file.');
  }
}
```

**BEFORE — call site inside `importFromExcel` (line ~130):**
```typescript
const rows = await this.parseExcelFile(fileBuffer);
```

---

**AFTER (exceljs):**

```typescript
// import — replace xlsx import with:
import ExcelJS from 'exceljs';
import { parse as parseCSV } from 'csv-parse/sync';

// Rename parseExcelFile → parseFile, add fileName parameter
private async parseFile(fileBuffer: Buffer, fileName: string): Promise<ExcelRowData[]> {
  const ext = fileName.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return this.parseCSVBuffer(fileBuffer);
  }

  return this.parseExcelBuffer(fileBuffer);
}

private parseCSVBuffer(fileBuffer: Buffer): ExcelRowData[] {
  try {
    const rows = parseCSV(fileBuffer, {
      columns: true,        // Use first row as header keys
      skip_empty_lines: true,
      trim: true,
      cast: true,           // Auto-cast numbers and booleans
    }) as ExcelRowData[];

    logger.info('CSV file parsed', { rowCount: rows.length });
    return rows;
  } catch (error) {
    logger.error('Failed to parse CSV file', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to parse file. Please ensure it is a valid .xlsx, .xls, or .csv file.');
  }
}

private async parseExcelBuffer(fileBuffer: Buffer): Promise<ExcelRowData[]> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);

    // Find preferred sheet, fall back to first
    const worksheet =
      workbook.worksheets.find(
        (ws) =>
          ws.name.toLowerCase().includes('non-disposed') ||
          ws.name.toLowerCase().includes('equipment')
      ) ?? workbook.worksheets[0];

    if (!worksheet) {
      throw new ValidationError('No worksheets found in the uploaded file.');
    }

    const rows = this.worksheetToJson<ExcelRowData>(worksheet);

    logger.info('Excel sheet parsed', {
      sheetName: worksheet.name,
      rowCount: rows.length,
    });
    return rows;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    logger.error('Failed to parse Excel file', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new ValidationError('Failed to parse file. Please ensure it is a valid .xlsx, .xls, or .csv file.');
  }
}

// worksheetToJson helper — see Section 5.1
```

**AFTER — call site inside `importFromExcel` (update to pass fileName):**
```typescript
// BEFORE:
const rows = await this.parseExcelFile(fileBuffer);

// AFTER:
const rows = await this.parseFile(fileBuffer, fileName);
```

**No external signature changes** — `importFromExcel(fileBuffer, fileName, options, user)` signature is unchanged.

---

### 5.3 `backend/src/controllers/inventory.controller.ts`

**BEFORE (xlsx — `exportInventory` function, lines 488–510):**

```typescript
// import
import * as XLSX from 'xlsx';

// inside exportInventory async function:
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);

// Auto-width columns
const colWidths = Object.keys(rows[0] || {}).map((key) => ({
  wch: Math.max(key.length, 15),
}));
ws['!cols'] = colWidths;

XLSX.utils.book_append_sheet(wb, ws, 'Inventory');

const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

const dateStr = new Date().toISOString().split('T')[0];
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', `attachment; filename="inventory-export-${dateStr}.xlsx"`);
res.setHeader('Content-Length', buf.length);
res.send(buf);
```

---

**AFTER (exceljs):**

```typescript
// import — replace xlsx import with:
import ExcelJS from 'exceljs';

// inside exportInventory async function — replace the xlsx block with:
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Inventory');

// Define columns with header labels, keys, and widths in one pass
// (replaces json_to_sheet + ws['!cols'] assignment)
const columnKeys = Object.keys(rows[0] || {});
worksheet.columns = columnKeys.map((key) => ({
  header: key,
  key: key,
  width: Math.max(key.length, 15),
}));

// Add all data rows (equivalent to json_to_sheet with header row already defined)
worksheet.addRows(rows);

// writeBuffer is async — await it and cast to Buffer for res.send() + Content-Length
const buf = Buffer.from(await workbook.xlsx.writeBuffer());

const dateStr = new Date().toISOString().split('T')[0];
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
res.setHeader('Content-Disposition', `attachment; filename="inventory-export-${dateStr}.xlsx"`);
res.setHeader('Content-Length', buf.length);
res.send(buf);
```

**`exportInventory` is already `async`** — adding `await workbook.xlsx.writeBuffer()` requires no function signature change. No callers are affected.

**Edge case — empty inventory:** If `rows` is empty, `rows[0]` is `undefined`. The expression `Object.keys(rows[0] || {})` already handles this in the before code; the ExcelJS equivalent `Object.keys(rows[0] || {})` handles it identically. When `columnKeys` is empty, `worksheet.addRows([])` is a no-op. The result is a valid workbook with no data rows and no columns — consistent with current behavior.

---

### 5.4 `backend/scripts/read-inventory-excel.ts`

**BEFORE (xlsx):**

```typescript
import * as XLSX from 'xlsx';
import path from 'path';

const excelFilePath = path.join(__dirname, '..', '..', 'docs', 'Inventory - 02-03-2026.xlsx');

console.log(`📖 Reading Excel file: ${excelFilePath}`);

try {
  const workbook = XLSX.readFile(excelFilePath);

  console.log('\n📊 Workbook Info:');
  console.log('Sheet Names:', workbook.SheetNames);

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  console.log(`\n📄 Reading sheet: ${sheetName}`);

  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log(`\nTotal rows: ${data.length}`);
  console.log('\n🔍 Sample Data (first 5 rows):');
  console.log(JSON.stringify(data.slice(0, 5), null, 2));

  const headers = Object.keys(data[0] || {});
  console.log('\n📋 Column Headers:');
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. ${header}`);
  });

  console.log('\n📊 Data Type Analysis:');
  headers.forEach(header => {
    const sampleValue = (data[0] as Record<string, unknown>)?.[header];
    const type = typeof sampleValue;
    console.log(`  ${header}: ${type} (Example: ${JSON.stringify(sampleValue)})`);
  });
} catch (error) {
  console.error('❌ Error reading Excel file:', error);
}
```

---

**AFTER (exceljs — wrap in async IIFE because `module: "CommonJS"` in tsconfig):**

```typescript
import ExcelJS from 'exceljs';
import path from 'path';

const excelFilePath = path.join(__dirname, '..', '..', 'docs', 'Inventory - 02-03-2026.xlsx');

console.log(`📖 Reading Excel file: ${excelFilePath}`);

(async () => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelFilePath);

    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    console.log('\n📊 Workbook Info:');
    console.log('Sheet Names:', sheetNames);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheets found in the file.');
    }
    const sheetName = worksheet.name;

    console.log(`\n📄 Reading sheet: ${sheetName}`);

    // Build headers from row 1
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value?.toString() ?? '';
    });

    // Extract data rows (skip row 1 — header)
    const data: Record<string, unknown>[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowData: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        rowData[headers[colNumber]] = cell.value ?? null;
      });
      data.push(rowData);
    });

    console.log(`\nTotal rows: ${data.length}`);
    console.log('\n🔍 Sample Data (first 5 rows):');
    console.log(JSON.stringify(data.slice(0, 5), null, 2));

    const columnHeaders = Object.keys(data[0] || {});
    console.log('\n📋 Column Headers:');
    columnHeaders.forEach((header, index) => {
      console.log(`  ${index + 1}. ${header}`);
    });

    console.log('\n📊 Data Type Analysis:');
    columnHeaders.forEach((header) => {
      const sampleValue = data[0]?.[header];
      const type = typeof sampleValue;
      console.log(`  ${header}: ${type} (Example: ${JSON.stringify(sampleValue)})`);
    });
  } catch (error) {
    console.error('❌ Error reading Excel file:', error);
  }
})();
```

---

### 5.5 `backend/scripts/read-excel.ts`

**BEFORE (xlsx):**

```typescript
import * as XLSX from 'xlsx';
import path from 'path';

const excelFilePath = path.join(__dirname, '..', '..', 'Superviors list.xlsx');

console.log(`📖 Reading Excel file: ${excelFilePath}`);

try {
  const workbook = XLSX.readFile(excelFilePath);

  console.log('\n📊 Workbook Info:');
  console.log('Sheet Names:', workbook.SheetNames);

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  console.log(`\n📄 Reading sheet: ${sheetName}`);

  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log(`\nTotal rows: ${data.length}`);
  console.log('\n🔍 All rows:');
  console.log(JSON.stringify(data, null, 2));

  const headers = Object.keys(data[0] || {});
  console.log('\n📋 Columns:');
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. ${header}`);
  });
} catch (error) {
  console.error('❌ Error reading Excel file:', error);
}
```

---

**AFTER (exceljs — async IIFE wrapper):**

```typescript
import ExcelJS from 'exceljs';
import path from 'path';

const excelFilePath = path.join(__dirname, '..', '..', 'Superviors list.xlsx');

console.log(`📖 Reading Excel file: ${excelFilePath}`);

(async () => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelFilePath);

    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    console.log('\n📊 Workbook Info:');
    console.log('Sheet Names:', sheetNames);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('No worksheets found in the file.');
    }
    const sheetName = worksheet.name;

    console.log(`\n📄 Reading sheet: ${sheetName}`);

    // Build headers from row 1
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value?.toString() ?? '';
    });

    // Extract data rows
    const data: Record<string, unknown>[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowData: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        rowData[headers[colNumber]] = cell.value ?? null;
      });
      data.push(rowData);
    });

    console.log(`\nTotal rows: ${data.length}`);
    console.log('\n🔍 All rows:');
    console.log(JSON.stringify(data, null, 2));

    const columnHeaders = Object.keys(data[0] || {});
    console.log('\n📋 Columns:');
    columnHeaders.forEach((header, index) => {
      console.log(`  ${index + 1}. ${header}`);
    });
  } catch (error) {
    console.error('❌ Error reading Excel file:', error);
  }
})();
```

---

## 6. Edge Cases and Special Handling

### 6.1 CSV Files — Critical Gap (ExcelJS Does NOT Support CSV)

**The issue:** `XLSX.read(buffer, { type: 'buffer' })` silently handles `.csv` files. ExcelJS `workbook.xlsx.load(buffer)` will throw if handed a CSV buffer.

**Where it matters:** `inventoryImport.service.ts` — the `importFromExcel` method accepts `.csv`, `.xls`, and `.xlsx` files (validated in the route/controller by extension). If a CSV is uploaded and passed to an ExcelJS-only `parseExcelFile`, the process will throw.

**Resolution:** The migration branches on file extension (Section 5.2):
- `.csv` → use `csv-parse` (`csv-parse@^6.1.0` is **already installed** in `backend/package.json`)
- `.xlsx` / `.xls` → use ExcelJS

**`csv-parse` import to add:**
```typescript
import { parse as parseCSV } from 'csv-parse/sync';
```
`csv-parse` ships its own TypeScript types — no `@types/csv-parse` needed.

---

### 6.2 `ws['!cols']` — Direct Worksheet Property Access

**Where:** `inventory.controller.ts` line ~494–497:
```typescript
ws['!cols'] = colWidths;
```
This is a xlsx-specific metadata key on the worksheet object. ExcelJS does not use this pattern.

**Resolution:** Column widths are set via `worksheet.columns = [{ header, key, width }]` at worksheet creation time. The `addWorksheet` + `columns` + `addRows` pattern in Section 5.3 handles this correctly.

---

### 6.3 `cellDates: true` Behavior

**xlsx behavior:** Without `cellDates: true`, Excel date serial numbers are returned as raw numbers. With `cellDates: true`, they become JS `Date` objects.

**ExcelJS behavior:** ExcelJS **always** returns `Date` objects for date cells — no option needed. The `instanceof Date` check in the `worksheetToJson` helper handles this transparently.

---

### 6.4 `raw: false` and `defval: null` Behavior

**xlsx `raw: false`:** Applies formatting (e.g., date string formatting, number formatting). ExcelJS returns values as stored — numbers as `number`, dates as `Date`, strings as `string`.

**xlsx `defval: null`:** Empty cells return `null` instead of being omitted from the row object. The `worksheetToJson` helper uses `{ includeEmpty: true }` in `eachCell` and assigns `null` when `cell.value` is `null` or `undefined`:
```typescript
rowData[header] = value; // null for empty cells
```

---

### 6.5 No `decode_range()` or Cell Address Manipulation Found

A search across all four xlsx-using files found **no usage** of:
- `XLSX.utils.decode_range()`
- `XLSX.utils.encode_range()`
- `XLSX.utils.decode_cell()`
- Individual cell address access like `ws['A1']` (only `ws['!cols']` found — resolved in 6.2)

No streaming requirements were found. All operations are buffer/file-level.

---

### 6.6 `.xls` (Old Excel 97–2003 Format)

`XLSX.read()` and `XLSX.readFile()` support both `.xlsx` (OOXML) and `.xls` (BIFF8). ExcelJS also supports both formats via `workbook.xlsx.load()` and `workbook.xlsx.readFile()` — the same API call handles both. No special branch needed.

---

### 6.7 `Buffer.from()` Wrapper on `writeBuffer()`

ExcelJS `workbook.xlsx.writeBuffer()` returns `Promise<ArrayBuffer>` (not `Promise<Buffer>`). In the Node.js environment, the returned `ArrayBufferLike` needs to be wrapped:
```typescript
const buf = Buffer.from(await workbook.xlsx.writeBuffer());
```
This is required because `res.setHeader('Content-Length', buf.length)` reads `.length` (a `Buffer` property) and `res.send(buf)` expects a `Buffer` or `string`. Omitting `Buffer.from()` will cause a TypeScript error and a potential runtime issue.

---

## 7. Function Signature and Caller Impact Analysis

| Function | File | Currently Async? | Change Required | External Callers Impacted? |
|---|---|---|---|---|
| `parseExcelFile(fileBuffer)` | `inventoryImport.service.ts` | ✅ Yes | Rename to `parseFile(fileBuffer, fileName)` | Internal only — call site in `importFromExcel` needs `fileName` passed down |
| `importFromExcel(buf, name, opts, user)` | `inventoryImport.service.ts` | ✅ Yes | Call `parseFile` instead of `parseExcelFile` | No — `inventory.controller.ts` calls this unchanged |
| `exportInventory(req, res)` | `inventory.controller.ts` | ✅ Yes | Add `await` to `writeBuffer()` call | No — Express route handler, no callers |
| Script top-level code | `read-inventory-excel.ts` | ❌ No | Wrap in `async` IIFE | N/A — standalone scripts |
| Script top-level code | `read-excel.ts` | ❌ No | Wrap in `async` IIFE | N/A — standalone scripts |

**Net result:** Zero external API signature changes. The only internal change is `parseExcelFile` → `parseFile` with an added `fileName` parameter, which is a private method with one internal call site.

---

## 8. npm Commands

### Step 1 — Install ExcelJS in backend

```bash
cd c:\Tech-V2\backend
npm install exceljs
```

ExcelJS ships its own TypeScript declarations. **Do not** run `npm install @types/exceljs` — no such package exists on npm. ExcelJS v4.x type definitions are bundled.

### Step 2 — Uninstall xlsx from backend

```bash
cd c:\Tech-V2\backend
npm uninstall xlsx
```

### Step 3 — Remove duplicate xlsx from workspace root

This step depends on Step 2 being complete. The root `package.json` has `"xlsx": "^0.18.5"` as a duplicate entry (LOW finding L-2 in audit).

```bash
cd c:\Tech-V2
npm uninstall xlsx
```

### Why separate commands?

The backend and root are separate npm workspace members. Running `npm uninstall xlsx` from root only affects the root `package.json`. Running it from `backend/` only affects `backend/package.json`. Both must be run.

### Full command sequence

```bash
# From backend — install replacement, remove old
cd c:\Tech-V2\backend
npm install exceljs
npm uninstall xlsx

# Rebuild to verify TypeScript compilation
npm run build

# From root — remove duplicate
cd c:\Tech-V2
npm uninstall xlsx

# Final build from root for workspace-level check
npm audit
```

---

## 9. ExcelJS Version Information

| Attribute | Value |
|---|---|
| **Package name** | `exceljs` |
| **npm page** | https://www.npmjs.com/package/exceljs |
| **GitHub** | https://github.com/exceljs/exceljs |
| **License** | MIT |
| **TypeScript** | Built-in type definitions (no `@types/exceljs` needed) |
| **Known limitations vs xlsx** | No CSV support (use `csv-parse`); no HTML table import; no XLSB format |
| **Formats supported** | `.xlsx` (OOXML), `.xls` (BIFF8), CSV via separate streaming API (not used here) |
| **Streaming** | Optional streaming read/write API available — not needed for this project |

From `docs/NPM_DEPENDENCY_AUDIT.md` Section 6.1: ExcelJS is described as "MIT licensed, 13k+ GitHub stars, actively maintained, full TypeScript support" — consistent with the project audit findings.

Install `exceljs@latest` to get the most recent stable release.

---

## 10. Build and Test Verification Steps

### Step 1 — TypeScript compilation

```bash
cd c:\Tech-V2\backend
npm run build
# Expected: clean build, zero TypeScript errors
```

Watch for:
- `ExcelJS` default import must match `esModuleInterop: true` in `tsconfig.json` (it is set to `true` ✅)
- `ExcelJS.CellRichTextValue`, `ExcelJS.CellFormulaValue` types in `worksheetToJson` helper
- `Buffer.from()` on `writeBuffer()` return value — TypeScript will flag if omitted

### Step 2 — Import functionality test

```bash
# Manual test: POST to /api/inventory/import with a real .xlsx file
# Verify the import completes successfully with correct row counts
# Verify the import completes with a .csv file (CSV branch)
# Verify a malformed file returns the expected ValidationError message
```

Key assertions:
- Row count matches expected
- Date fields parse as `Date` objects (not serial numbers)
- Empty cells produce `null` values (not `undefined`)
- "Non-disposed Equipment" sheet is detected and preferred over the first sheet when present

### Step 3 — Export functionality test

```bash
# Manual test: POST to /api/inventory/export
# Save the downloaded file and open in Excel / LibreOffice
# Verify:
#   - All columns present with correct headers
#   - Column widths are reasonable (≥15 chars)
#   - Data rows match database content
#   - Date values display correctly (not serial numbers)
#   - File opens without corruption warnings
```

### Step 4 — Script execution test

```bash
cd c:\Tech-V2\backend

# Test read-inventory-excel.ts (requires file to exist at expected path)
npx tsx scripts/read-inventory-excel.ts
# Expected: outputs sheet names, row count, first 5 rows, column headers

# Test read-excel.ts (requires 'Superviors list.xlsx' at project root)
npx tsx scripts/read-excel.ts
# Expected: outputs sheet names, all rows, column list
```

### Step 5 — Security audit verification

```bash
cd c:\Tech-V2
npm audit
# Expected: xlsx CVEs (GHSA-5pgg-2g8v-p4x9, GHSA-4r6h-8v6p-xvw6) no longer appear
```

### Step 6 — Regression check

```bash
# Run existing test suite
cd c:\Tech-V2\backend
npm test
# Expected: all tests pass
```

---

## 11. Files NOT Requiring Changes (Confirmed)

These files reference the string `'xlsx'` as a **format value** only — not as a package import:

| File | Reference | Action |
|---|---|---|
| `backend/src/validators/inventory.validators.ts` | `z.enum(['xlsx', 'csv', 'pdf'])` | No change — string literal |
| `backend/src/services/inventory.service.ts` | Comment: `// Export will be implemented in Phase 3 with xlsx library` | Update comment text only (optional) |
| `backend/src/routes/inventory.routes.ts` | `'xlsx'` in file extension whitelist | No change — string literal |
| `frontend/src/types/inventory.types.ts` | `format: 'xlsx' \| 'csv' \| 'pdf'` | No change — string literal |
| `frontend/src/pages/EquipmentSearch.tsx` | `format: 'xlsx'` | No change — string literal |
| `frontend/src/pages/DisposedEquipment.tsx` | `format: 'xlsx'` | No change — string literal |
| `frontend/src/pages/InventoryManagement.tsx` | `format: 'xlsx'` | No change — string literal |
| `frontend/src/components/inventory/ImportInventoryDialog.tsx` | `.xlsx` in accept strings and error messages | No change — string literals |

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ExcelJS parses dates differently from xlsx (serial numbers vs Date objects) | Low — ExcelJS always returns Date | Medium | Verify `parseDate()` helper in service still receives Date objects; add `instanceof Date` check |
| CSV upload fails silently with ExcelJS | High — ExcelJS will throw | High | The CSV branch via `csv-parse` is mandatory; test with real CSV file post-migration |
| `worksheetToJson` helper misses formula result cells | Low — handled in helper | Medium | Test a file with formula cells if used in production imports |
| `Buffer.from(writeBuffer())` returns wrong type | Low — correctly typed | Medium | TypeScript compilation will catch this |
| `worksheet.columns = []` on empty `rows` array | Low — handled via `rows[0] \|\| {}` | Low | Existing guard in before-code carries over to after-code |
| `workbook.xlsx.load()` throws on corrupt file | Same as xlsx behavior | Low | Existing `try/catch` in `parseExcelBuffer` re-throws as `ValidationError` |

---

*End of specification. Implementation is ready to proceed.*
