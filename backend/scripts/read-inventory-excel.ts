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
