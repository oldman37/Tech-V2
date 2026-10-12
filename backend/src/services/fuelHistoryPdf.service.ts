/**
 * Fuel History PDF Service
 *
 * Renders the monthly fuel summary (see FuelConsumptionService.getMonthlySummary)
 * as a landscape PDF table using pdfkit.
 */

import PDFDocument from 'pdfkit';

interface FuelHistoryPdfRow {
  userName:        string;
  unitNumber:      string;
  totalFuelAmount: number;
  fuelUnit:        string;
  previousMileage: number | null;
  latestMileage:   number;
  milesDriven:     number | null;
  entries: { fuelStation?: { officeLocation?: { name: string } | null } | null }[];
}

const MARGIN   = 40;
const PAGE_W   = 792; // US Letter landscape
const COL_W    = PAGE_W - MARGIN * 2;
const FONT_REG = 'Helvetica';
const FONT_BLD = 'Helvetica-Bold';
const PRIMARY  = '#1565C0';
const LIGHT_BG = '#F5F5F5';
const ROW_PAD  = 5;

const fmtMiles = (n: number | null): string => (n === null ? '-' : `${n.toLocaleString('en-US')} mi`);

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function locationsOf(row: FuelHistoryPdfRow): string {
  const names: string[] = [];
  for (const e of row.entries) {
    const n = e.fuelStation?.officeLocation?.name;
    if (n && !names.includes(n)) names.push(n);
  }
  return names.join(', ');
}

export async function generateFuelHistoryPdf(
  rows: FuelHistoryPdfRow[],
  month: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: MARGIN });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const cols = [
        { label: 'User',             w: 130, get: (r: FuelHistoryPdfRow) => r.userName },
        { label: 'Vehicle',          w: 70,  get: (r: FuelHistoryPdfRow) => r.unitNumber },
        { label: 'Total Fuel',       w: 90,  get: (r: FuelHistoryPdfRow) => `${r.totalFuelAmount.toFixed(3)} ${r.fuelUnit}` },
        { label: 'Previous Mileage', w: 90,  get: (r: FuelHistoryPdfRow) => fmtMiles(r.previousMileage) },
        { label: 'Latest Mileage',   w: 90,  get: (r: FuelHistoryPdfRow) => fmtMiles(r.latestMileage) },
        { label: 'Miles Driven',     w: 80,  get: (r: FuelHistoryPdfRow) => fmtMiles(r.milesDriven) },
      ];
      const usedW = cols.reduce((s, c) => s + c.w, 0);
      const locW  = COL_W - usedW;
      const colX: number[] = [];
      cols.reduce((x, c) => { colX.push(x); return x + c.w; }, MARGIN);
      const locX = MARGIN + usedW;
      const bottom = () => doc.page.height - doc.page.margins.bottom;

      const drawHeader = () => {
        const y = doc.y;
        doc.rect(MARGIN, y, COL_W, 18).fillAndStroke(LIGHT_BG, '#E0E0E0');
        doc.font(FONT_BLD).fontSize(8.5).fillColor('#212121');
        cols.forEach((c, i) => doc.text(c.label, colX[i]! + 4, y + 5, { width: c.w - 8, lineBreak: false }));
        doc.text('Location', locX + 4, y + 5, { width: locW - 8, lineBreak: false });
        doc.y = y + 20;
      };

      // ---- Title ----
      doc.font(FONT_BLD).fontSize(18).fillColor(PRIMARY)
        .text('FUEL HISTORY', MARGIN, MARGIN, { align: 'center', width: COL_W });
      doc.font(FONT_REG).fontSize(10).fillColor('#212121')
        .text(`Technology Department - ${monthLabel(month)}`, MARGIN, doc.y, { align: 'center', width: COL_W });
      doc.moveDown(0.3);
      doc.font(FONT_REG).fontSize(8).fillColor('#616161')
        .text(
          `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          MARGIN, doc.y, { align: 'center', width: COL_W },
        );
      doc.moveDown(0.8);

      drawHeader();

      // ---- Rows — height measured first so a row never splits across pages ----
      let totalMiles = 0;
      for (const r of rows) {
        const loc = locationsOf(r);
        doc.font(FONT_REG).fontSize(8.5);
        const rowH = Math.max(
          ...cols.map((c) => doc.heightOfString(c.get(r), { width: c.w - 8 })),
          doc.heightOfString(loc, { width: locW - 8 }),
          10,
        );

        if (doc.y + rowH + ROW_PAD * 2 > bottom()) {
          doc.addPage();
          drawHeader();
        }

        const y = doc.y + ROW_PAD;
        doc.font(FONT_REG).fontSize(8.5).fillColor('#212121');
        cols.forEach((c, i) => doc.text(c.get(r), colX[i]! + 4, y, { width: c.w - 8 }));
        doc.text(loc, locX + 4, y, { width: locW - 8 });

        const lineY = y + rowH + ROW_PAD;
        doc.moveTo(MARGIN, lineY).lineTo(MARGIN + COL_W, lineY)
          .strokeColor('#BDBDBD').lineWidth(0.5).stroke();
        doc.y = lineY + 1;
        totalMiles += r.milesDriven ?? 0;
      }

      // ---- Totals ----
      if (doc.y + 30 > bottom()) doc.addPage();
      doc.y += 10;
      doc.font(FONT_BLD).fontSize(9).fillColor('#212121')
        .text(
          `Rows: ${rows.length}     Total miles driven: ${totalMiles.toLocaleString('en-US')} mi`,
          MARGIN, doc.y, { width: COL_W, align: 'right' },
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
