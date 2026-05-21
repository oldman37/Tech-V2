import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';
import { AppError, NotFoundError } from '../utils/errors';

const log = createLogger('BarcodePdfService');

const COLS = 2;
const MARGIN = 36;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const COL_GAP = 14;           // horizontal gap between badge columns
const ROW_GAP = 14;           // vertical gap between badge rows
const USABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;              // 540
const BADGE_W = (USABLE_WIDTH - COL_GAP) / COLS;          // ~263
const BADGE_PADDING = 12;
const BARCODE_W = BADGE_W - BADGE_PADDING * 2;            // ~239
const BARCODE_H = 72;
// Badge interior: top-pad(12) + name(14) + gap(6) + barcode(72) + gap(6) + id(12) + bot-pad(12) = 134
const BADGE_H = 134;
const HEADER_HEIGHT = 48;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN * 2;           // 720
const ROWS_PER_PAGE = Math.floor(
  (USABLE_HEIGHT - HEADER_HEIGHT + ROW_GAP) / (BADGE_H + ROW_GAP),
); // 4
const PER_PAGE = ROWS_PER_PAGE * COLS;                    // 8

export async function generateStudentBarcodePdf(
  locationId: string,
  gradeLevel: string,
): Promise<Buffer> {
  // 1. Resolve office location name
  const location = await prisma.officeLocation.findUnique({
    where: { id: locationId },
    select: { name: true },
  });

  if (!location) {
    throw new NotFoundError('Office location', locationId);
  }

  // 2. Query active students at this location + grade with a non-empty employeeId
  const students = await prisma.user.findMany({
    where: {
      officeLocation: { equals: location.name, mode: 'insensitive' },
      gradeLevel: { equals: gradeLevel, mode: 'insensitive' },
      email: { endsWith: '@students.ocboe.com' },
      employeeId: { not: null },
      isActive: true,
    },
    select: {
      firstName: true,
      lastName: true,
      employeeId: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const validStudents = students.filter(
    (s) => s.employeeId && s.employeeId.trim().length > 0,
  );

  if (validStudents.length === 0) {
    throw new AppError(
      `No students found for the selected school and grade level`,
      404,
      'NO_STUDENTS',
    );
  }

  log.info('Generating barcode PDF', {
    locationName: location.name,
    gradeLevel,
    studentCount: validStudents.length,
  });

  // 3. Build PDF
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const addPageTitle = () => {
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .text(
          `Barcodes \u2014 ${location.name} \u2014 Grade ${gradeLevel}`,
          MARGIN,
          MARGIN,
          { width: USABLE_WIDTH, align: 'center' },
        );
    };

    (async () => {
      try {
        addPageTitle();

        for (let i = 0; i < validStudents.length; i++) {
          // Add a new page when each full page of cells is exhausted
          if (i > 0 && i % PER_PAGE === 0) {
            doc.addPage();
            addPageTitle();
          }

          const posInPage = i % PER_PAGE;
          const col = posInPage % COLS;
          const row = Math.floor(posInPage / COLS);

          const x = MARGIN + col * (BADGE_W + COL_GAP);
          const y = MARGIN + HEADER_HEIGHT + row * (BADGE_H + ROW_GAP);

          const student = validStudents[i];

          // Badge border
          doc
            .roundedRect(x, y, BADGE_W, BADGE_H, 6)
            .lineWidth(0.75)
            .strokeColor('#333333')
            .stroke();

          // Student name
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .fillColor('#000000')
            .text(
              `${student.lastName}, ${student.firstName}`,
              x + BADGE_PADDING,
              y + BADGE_PADDING,
              { width: BARCODE_W, align: 'center', lineBreak: false },
            );

          const barcodeY = y + BADGE_PADDING + 14 + 6;

          // Generate barcode PNG
          try {
            const pngBuffer = await bwipjs.toBuffer({
              bcid: 'code128',
              text: student.employeeId!,
              scale: 3,
              height: 12,
              includetext: false,
            });

            doc.image(pngBuffer, x + BADGE_PADDING, barcodeY, {
              fit: [BARCODE_W, BARCODE_H],
              align: 'center',
              valign: 'center',
            });
          } catch (barcodeErr) {
            log.warn('Failed to generate barcode for student', {
              employeeId: student.employeeId,
            });
            doc
              .rect(x + BADGE_PADDING, barcodeY, BARCODE_W, BARCODE_H)
              .stroke();
            doc
              .fontSize(7)
              .font('Helvetica')
              .text('Barcode unavailable', x + BADGE_PADDING, barcodeY + 32, {
                width: BARCODE_W,
                align: 'center',
              });
          }

          // Employee ID below barcode
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#444444')
            .text(student.employeeId!, x + BADGE_PADDING, barcodeY + BARCODE_H + 6, {
              width: BARCODE_W,
              align: 'center',
              lineBreak: false,
            });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    })();
  });
}
