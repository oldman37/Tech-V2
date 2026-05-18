/**
 * Transportation Request PDF Service
 *
 * Generates transportation request PDF documents using PDFKit.
 * Mirrors the structure and styling of fieldTripPdf.service.ts exactly.
 * Returns a Promise<Buffer> suitable for streaming to the HTTP response.
 */

import PDFDocument from 'pdfkit';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransportationRequestForPdf {
  id:            string;
  status:        string;
  createdAt:     Date;
  tripDate:      Date;

  submitterEmail: string;
  submittedBy: {
    firstName:   string;
    lastName:    string;
    displayName: string | null;
    email:       string;
  } | null;

  school:                    string;
  groupOrActivity:           string;
  sponsorName:               string;
  chargedTo:                 string | null;
  busCount:                  number;
  studentCount:              number;
  chaperoneCount:            number;
  needsDriver:               boolean;
  driverName:                string | null;
  loadingLocation:           string;
  loadingTime:               string;
  leavingSchoolTime:         string;
  arriveFirstDestTime:       string | null;
  leaveLastDestTime:         string | null;
  returnToSchoolTime:        string;
  primaryDestinationName:    string;
  primaryDestinationAddress: string;
  additionalDestinations:    Array<{ name: string; address: string }> | null;
  tripItinerary:             string | null;

  approvedById:     string | null;
  approvedAt:       Date | null;
  approvalComments: string | null;
  assignedDriverNames: string[];
  approvedBy: {
    id: string; displayName: string | null; firstName: string; lastName: string;
  } | null;

  deniedById:   string | null;
  deniedAt:     Date | null;
  denialReason: string | null;
  deniedBy: {
    id: string; displayName: string | null; firstName: string; lastName: string;
  } | null;

  supervisorApprovedById: string | null;
  supervisorApprovedAt:   Date | null;
  supervisorApprovedBy: {
    id: string; displayName: string | null; firstName: string; lastName: string;
  } | null;

  supervisorDeniedById:   string | null;
  supervisorDeniedAt:     Date | null;
  supervisorDenialReason: string | null;
  supervisorDeniedBy: {
    id: string; displayName: string | null; firstName: string; lastName: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const MARGIN   = 50;
const PAGE_W   = 612;
const COL_W    = PAGE_W - MARGIN * 2;
const FONT_REG = 'Helvetica';
const FONT_BLD = 'Helvetica-Bold';
const FONT_SIG = path.join(__dirname, '..', 'assets', 'fonts', 'FreestyleScript.ttf');
const PRIMARY  = '#1565C0';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LIGHT_BG = '#F5F5F5';

// ---------------------------------------------------------------------------
// Status display config
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  APPROVED:                    '#2E7D32',
  DENIED:                      '#C62828',
  PENDING_SUPERVISOR_APPROVAL: PRIMARY,
  PENDING_SECRETARY_REVIEW:    PRIMARY,
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_SUPERVISOR_APPROVAL: 'PENDING SUPERVISOR',
  PENDING_SECRETARY_REVIEW:    'PENDING REVIEW',
  APPROVED:                    'APPROVED',
  DENIED:                      'DENIED',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hRule(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor('#BDBDBD').lineWidth(0.5).stroke();
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.font(FONT_BLD).fontSize(10).fillColor(PRIMARY).text(title);
  doc.moveDown(0.3);
}

function labelValue(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): number {
  doc.font(FONT_BLD).fontSize(8).fillColor('#616161').text(label, x, y, { width });
  const afterLabel = doc.y;
  doc.font(FONT_REG).fontSize(9).fillColor('#212121').text(value, x, afterLabel, { width });
  return doc.y;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'UTC',
  });
}

function yesNo(val: boolean): string {
  return val ? 'Yes' : 'No';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateTransportationRequestPdf(
  req: TransportationRequestForPdf,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });
      const chunks: Buffer[] = [];

      doc.on('data',  (chunk) => chunks.push(chunk));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ---- Section 0: Document Header ------------------------------------
      doc
        .font(FONT_BLD)
        .fontSize(18)
        .fillColor(PRIMARY)
        .text('TRANSPORTATION REQUEST', MARGIN, MARGIN, { align: 'left', continued: false });

      // Status chip: filled rectangle with white text, right-aligned
      const statusLabel = STATUS_LABELS[req.status] ?? req.status;
      const statusColor = STATUS_COLORS[req.status] ?? '#616161';
      const chipW = 160;
      const chipH = 18;
      const chipX = PAGE_W - MARGIN - chipW;
      const chipY = MARGIN + 2;
      doc.rect(chipX, chipY, chipW, chipH).fill(statusColor);
      doc
        .font(FONT_BLD)
        .fontSize(8)
        .fillColor('#FFFFFF')
        .text(statusLabel, chipX, chipY + 5, { width: chipW, align: 'center' });

      doc
        .font(FONT_REG)
        .fontSize(10)
        .fillColor('#212121')
        .text('Technology Department', MARGIN, MARGIN + 24);

      doc.moveDown(0.5);
      hRule(doc, doc.y);
      doc.moveDown(0.5);

      const shortId = req.id.slice(-8).toUpperCase();
      doc
        .font(FONT_BLD).fontSize(9).fillColor('#212121')
        .text('Request ID: ', MARGIN, doc.y, { continued: true, width: 90 })
        .font(FONT_REG)
        .text(shortId, { continued: false });

      doc
        .font(FONT_BLD).fontSize(9)
        .text('Generated: ', MARGIN, doc.y, { continued: true, width: 90 })
        .font(FONT_REG)
        .text(new Date().toLocaleString('en-US'));

      doc.moveDown(0.5);
      hRule(doc, doc.y);
      doc.moveDown(0.8);

      const leftX = MARGIN;
      const rightX = MARGIN + COL_W / 2 + 10;
      const colW  = (COL_W / 2) - 10;

      // ---- Section 1: Trip Information -----------------------------------
      sectionHeader(doc, 'TRIP INFORMATION');

      const tripFields: Array<[string, string]> = [
        ['School',               req.school],
        ['Group / Activity',     req.groupOrActivity],
        ['Sponsor',              req.sponsorName],
        ['Charged To',           req.chargedTo ?? '—'],
        ['Trip Date',            formatDate(req.tripDate)],
        ['Number of Buses',      String(req.busCount)],
        ['Number of Students',   String(req.studentCount)],
        ['Number of Chaperones', String(req.chaperoneCount)],
        ['Driver',               req.needsDriver ? 'District Driver' : (req.driverName ?? '—')],
      ];

      for (let i = 0; i < tripFields.length; i += 2) {
        const rowY = doc.y;
        const [lLabel, lVal] = tripFields[i];
        let leftEndY = labelValue(doc, lLabel, lVal, leftX, rowY, colW);

        if (i + 1 < tripFields.length) {
          const [rLabel, rVal] = tripFields[i + 1];
          const rightEndY = labelValue(doc, rLabel, rVal, rightX, rowY, colW);
          leftEndY = Math.max(leftEndY, rightEndY);
        }

        doc.y = leftEndY;
        doc.moveDown(0.4);
      }

      doc.moveDown(0.2);
      hRule(doc, doc.y);
      doc.moveDown(0.8);

      // ---- Section 2: Submitted By ---------------------------------------
      sectionHeader(doc, 'SUBMITTED BY');

      const submitterName = req.submittedBy
        ? (req.submittedBy.displayName ?? `${req.submittedBy.firstName} ${req.submittedBy.lastName}`)
        : 'Unknown';

      const submitterFields: Array<[string, string]> = [
        ['Submitted By', submitterName],
        ['Email',        req.submitterEmail],
        ['Created',      req.createdAt.toLocaleString('en-US')],
      ];

      for (let i = 0; i < submitterFields.length; i += 2) {
        const rowY = doc.y;
        const [lLabel, lVal] = submitterFields[i];
        let leftEndY = labelValue(doc, lLabel, lVal, leftX, rowY, colW);

        if (i + 1 < submitterFields.length) {
          const [rLabel, rVal] = submitterFields[i + 1];
          const rightEndY = labelValue(doc, rLabel, rVal, rightX, rowY, colW);
          leftEndY = Math.max(leftEndY, rightEndY);
        }

        doc.y = leftEndY;
        doc.moveDown(0.4);
      }

      doc.moveDown(0.2);
      hRule(doc, doc.y);
      doc.moveDown(0.8);

      // ---- Section 3: Logistics & Times ----------------------------------
      sectionHeader(doc, 'LOGISTICS & TIMES');

      const logisticsFields: Array<[string, string]> = [
        ['Loading Location',      req.loadingLocation],
        ['Loading Time',          req.loadingTime],
        ['Leaving School Time',   req.leavingSchoolTime],
      ];

      if (req.arriveFirstDestTime) {
        logisticsFields.push(['Arrive at First Destination', req.arriveFirstDestTime]);
      }
      if (req.leaveLastDestTime) {
        logisticsFields.push(['Depart Last Destination', req.leaveLastDestTime]);
      }
      logisticsFields.push(['Return to School Time', req.returnToSchoolTime]);

      for (let i = 0; i < logisticsFields.length; i += 2) {
        const rowY = doc.y;
        const [lLabel, lVal] = logisticsFields[i];
        let leftEndY = labelValue(doc, lLabel, lVal, leftX, rowY, colW);

        if (i + 1 < logisticsFields.length) {
          const [rLabel, rVal] = logisticsFields[i + 1];
          const rightEndY = labelValue(doc, rLabel, rVal, rightX, rowY, colW);
          leftEndY = Math.max(leftEndY, rightEndY);
        }

        doc.y = leftEndY;
        doc.moveDown(0.4);
      }

      doc.moveDown(0.2);
      hRule(doc, doc.y);
      doc.moveDown(0.8);

      // ---- Section 4: Destinations ---------------------------------------
      sectionHeader(doc, 'DESTINATIONS');

      const destFields: Array<[string, string]> = [
        ['Primary Destination',         req.primaryDestinationName],
        ['Primary Destination Address', req.primaryDestinationAddress],
      ];

      for (let i = 0; i < destFields.length; i += 2) {
        const rowY = doc.y;
        const [lLabel, lVal] = destFields[i];
        let leftEndY = labelValue(doc, lLabel, lVal, leftX, rowY, colW);

        if (i + 1 < destFields.length) {
          const [rLabel, rVal] = destFields[i + 1];
          const rightEndY = labelValue(doc, rLabel, rVal, rightX, rowY, colW);
          leftEndY = Math.max(leftEndY, rightEndY);
        }

        doc.y = leftEndY;
        doc.moveDown(0.4);
      }

      if (req.additionalDestinations && req.additionalDestinations.length > 0) {
        req.additionalDestinations.forEach((dest, idx) => {
          const stopLabel = `Stop ${idx + 2}`;
          const rowY = doc.y;
          const leftEndY = labelValue(doc, `${stopLabel}: Name`, dest.name, leftX, rowY, colW);
          const rightEndY = labelValue(doc, `${stopLabel}: Address`, dest.address, rightX, rowY, colW);
          doc.y = Math.max(leftEndY, rightEndY);
          doc.moveDown(0.4);
        });
      }

      doc.moveDown(0.2);
      hRule(doc, doc.y);
      doc.moveDown(0.8);

      // ---- Section 5: Additional Notes / Itinerary (conditional) ---------
      if (req.tripItinerary) {
        sectionHeader(doc, 'ADDITIONAL NOTES / ITINERARY');
        doc.font(FONT_REG).fontSize(9).fillColor('#212121')
          .text(req.tripItinerary, MARGIN, doc.y, { width: COL_W });
        doc.moveDown(0.6);
        hRule(doc, doc.y);
        doc.moveDown(0.8);
      }

      // ---- Section 6: Approval Trail ------------------------------------
      sectionHeader(doc, 'APPROVAL TRAIL');

      // --- Supervisor block ---
      if (req.supervisorApprovedById || req.supervisorDeniedById) {
        doc.font(FONT_BLD).fontSize(9).fillColor('#212121')
          .text('Supervisor Review', leftX, doc.y, { width: COL_W });
        doc.moveDown(0.3);

        if (req.supervisorApprovedById && req.supervisorApprovedBy && req.supervisorApprovedAt) {
          const actorName = req.supervisorApprovedBy.displayName
            ?? `${req.supervisorApprovedBy.firstName} ${req.supervisorApprovedBy.lastName}`;
          const rowY = doc.y;
          const leftEndY = labelValue(doc, 'Approved By', actorName, leftX, rowY, colW);
          const rightEndY = labelValue(
            doc, 'Approved At',
            req.supervisorApprovedAt.toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            }),
            rightX, rowY, colW,
          );
          doc.y = Math.max(leftEndY, rightEndY);
          doc.moveDown(0.4);
        } else if (req.supervisorDeniedById && req.supervisorDeniedBy && req.supervisorDeniedAt) {
          const actorName = req.supervisorDeniedBy.displayName
            ?? `${req.supervisorDeniedBy.firstName} ${req.supervisorDeniedBy.lastName}`;
          const rowY = doc.y;
          const leftEndY = labelValue(doc, 'Denied By', actorName, leftX, rowY, colW);
          const rightEndY = labelValue(
            doc, 'Denied At',
            req.supervisorDeniedAt.toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            }),
            rightX, rowY, colW,
          );
          doc.y = Math.max(leftEndY, rightEndY);
          doc.moveDown(0.3);

          if (req.supervisorDenialReason) {
            const boxX = MARGIN;
            const boxY = doc.y;
            const boxW = COL_W;
            const _denialText = `Denial Reason: ${req.supervisorDenialReason}`;
            const _charsPerLine = Math.max(1, Math.floor((boxW - 12) / 4.8));
            const _lines = Math.max(1, Math.ceil(_denialText.length / _charsPerLine));
            const boxH = Math.max(30, _lines * 11 + 16);
            doc.rect(boxX, boxY, boxW, boxH).fill('#FFEBEE');
            doc.font(FONT_BLD).fontSize(8).fillColor('#C62828')
              .text('Denial Reason: ', boxX + 6, boxY + 8, { continued: true, width: boxW - 12 });
            doc.font(FONT_REG).fontSize(8).fillColor('#212121')
              .text(req.supervisorDenialReason, { continued: false, width: boxW - 100 });
            doc.y = Math.max(doc.y, boxY + boxH);
            doc.moveDown(0.8);
          }
        }

        doc.moveDown(0.4);
        hRule(doc, doc.y);
        doc.moveDown(0.4);
      }

      // --- Secretary block ---
      if (req.approvedById || req.deniedById) {
        doc.font(FONT_BLD).fontSize(9).fillColor('#212121')
          .text('Secretary Review', leftX, doc.y, { width: COL_W });
        doc.moveDown(0.3);

        if (req.approvedById && req.approvedBy && req.approvedAt) {
          const actorName = req.approvedBy.displayName
            ?? `${req.approvedBy.firstName} ${req.approvedBy.lastName}`;
          const rowY = doc.y;
          const leftEndY = labelValue(doc, 'Approved By', actorName, leftX, rowY, colW);
          const rightEndY = labelValue(
            doc, 'Approved At',
            req.approvedAt.toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            }),
            rightX, rowY, colW,
          );
          doc.y = Math.max(leftEndY, rightEndY);
          doc.moveDown(0.4);

          if (req.approvalComments) {
            doc.font(FONT_BLD).fontSize(8).fillColor('#616161')
              .text('Comments', MARGIN, doc.y, { width: COL_W });
            doc.font(FONT_REG).fontSize(9).fillColor('#212121')
              .text(req.approvalComments, { width: COL_W });
            doc.moveDown(0.4);
          }

          if (req.assignedDriverNames && req.assignedDriverNames.length > 0) {
            doc.font(FONT_BLD).fontSize(8).fillColor('#616161')
              .text('Assigned Bus Drivers', MARGIN, doc.y, { width: COL_W });
            req.assignedDriverNames.forEach((name, idx) => {
              doc.font(FONT_REG).fontSize(9).fillColor('#212121')
                .text(`Bus ${idx + 1}: ${name}`, MARGIN + 8, doc.y, { width: COL_W - 8 });
            });
            doc.moveDown(0.4);
          }
        } else if (req.deniedById && req.deniedBy && req.deniedAt) {
          const actorName = req.deniedBy.displayName
            ?? `${req.deniedBy.firstName} ${req.deniedBy.lastName}`;
          const rowY = doc.y;
          const leftEndY = labelValue(doc, 'Denied By', actorName, leftX, rowY, colW);
          const rightEndY = labelValue(
            doc, 'Denied At',
            req.deniedAt.toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            }),
            rightX, rowY, colW,
          );
          doc.y = Math.max(leftEndY, rightEndY);
          doc.moveDown(0.3);

          if (req.denialReason) {
            const boxX = MARGIN;
            const boxY = doc.y;
            const boxW = COL_W;
            const _denialText = `Denial Reason: ${req.denialReason}`;
            const _charsPerLine = Math.max(1, Math.floor((boxW - 12) / 4.8));
            const _lines = Math.max(1, Math.ceil(_denialText.length / _charsPerLine));
            const boxH = Math.max(30, _lines * 11 + 16);
            doc.rect(boxX, boxY, boxW, boxH).fill('#FFEBEE');
            doc.font(FONT_BLD).fontSize(8).fillColor('#C62828')
              .text('Denial Reason: ', boxX + 6, boxY + 8, { continued: true, width: boxW - 12 });
            doc.font(FONT_REG).fontSize(8).fillColor('#212121')
              .text(req.denialReason, { continued: false, width: boxW - 100 });
            doc.y = Math.max(doc.y, boxY + boxH);
            doc.moveDown(0.8);
          }
        }
      }

      doc.moveDown(0.4);
      hRule(doc, doc.y);
      doc.moveDown(0.8);

      // ---- Section 7: Signature Blocks -----------------------------------
      const SIGNATURE_BLOCK_HEIGHT = 100;
      const PAGE_H = 792; // US Letter height in points
      if (doc.y + SIGNATURE_BLOCK_HEIGHT > PAGE_H - MARGIN) {
        doc.addPage();
      }

      doc.moveDown(0.5);
      sectionHeader(doc, 'SIGNATURES');

      const sigLineW = (COL_W / 2) - 20;
      const sigGapX  = 40;
      const sigCol1  = MARGIN;
      const sigCol2  = MARGIN + sigLineW + sigGapX;

      interface SigDef {
        label:      string;
        approvedBy: string | null;
        approvedAt: Date | null;
        isDenied:   boolean;
      }

      const sigDefs: SigDef[] = [
        {
          label:      'Supervisor',
          approvedBy: req.supervisorApprovedBy
            ? (req.supervisorApprovedBy.displayName
                ?? `${req.supervisorApprovedBy.firstName} ${req.supervisorApprovedBy.lastName}`)
            : null,
          approvedAt: req.supervisorApprovedAt,
          isDenied:   !!req.supervisorDeniedById,
        },
        {
          label:      'Transportation Secretary',
          approvedBy: req.approvedBy
            ? (req.approvedBy.displayName
                ?? `${req.approvedBy.firstName} ${req.approvedBy.lastName}`)
            : null,
          approvedAt: req.approvedAt,
          isDenied:   !!req.deniedById,
        },
      ];

      const topY   = doc.y;
      const lineY  = topY + 28;
      const labelY = lineY + 4;
      const dateY  = labelY + 12;

      sigDefs.forEach((sig, idx) => {
        const x = idx === 0 ? sigCol1 : sigCol2;

        if (sig.approvedBy) {
          doc.font(FONT_SIG).fontSize(18).fillColor('#1a237e')
            .text(sig.approvedBy, x, topY, { width: sigLineW, lineBreak: false });
        } else if (sig.isDenied) {
          doc.font(FONT_BLD).fontSize(10).fillColor('#C62828')
            .text('DENIED', x, topY + 8, { width: sigLineW, lineBreak: false });
        }

        // Signature line
        doc.moveTo(x, lineY).lineTo(x + sigLineW, lineY)
          .strokeColor('#212121').lineWidth(0.5).stroke();

        // Role label
        doc.font(FONT_BLD).fontSize(8).fillColor('#212121')
          .text(sig.label, x, labelY, { width: sigLineW });

        // Date
        if (sig.approvedAt) {
          doc.font(FONT_REG).fontSize(7).fillColor('#616161')
            .text(
              sig.approvedAt.toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
              }),
              x, dateY, { width: sigLineW },
            );
        }
      });

      doc.y = dateY + 14;
      doc.moveDown(1.2);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
