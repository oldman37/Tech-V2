import * as XLSX from 'xlsx';
import path from 'path';

const excelFilePath = path.join(__dirname, '..', '..', 'Superviors list.xlsx');

console.log(`📖 Reading Excel file: ${excelFilePath}`);

try {
  const workbook = XLSX.readFile(excelFilePath);
  
  console.log('\n📊 Workbook Info:');
  console.log('Sheet Names:', workbook.SheetNames);
  
  // Read the first sheet
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  console.log(`\n📄 Reading sheet: ${sheetName}`);
  
  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`\nTotal rows: ${data.length}`);
  console.log('\n🔍 All rows:');
  console.log(JSON.stringify(data, null, 2));
  
  // Get column headers
  const headers = Object.keys(data[0] || {});
  console.log('\n📋 Columns:');
  headers.forEach((header, index) => {
    console.log(`  ${index + 1}. ${header}`);
  });
  
} catch (error) {
  console.error('❌ Error reading Excel file:', error);
}
