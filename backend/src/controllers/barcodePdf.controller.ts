import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { handleControllerError } from '../utils/errorHandler';
import { generateStudentBarcodePdf } from '../services/barcodePdf.service';
import type { z } from 'zod';
import type { BarcodePdfQuerySchema } from '../validators/barcodePdf.validators';

// ---------------------------------------------------------------------------
// Generate barcode PDF
// ---------------------------------------------------------------------------

export const generatePdf = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { locationId, gradeLevel } = req.query as unknown as z.infer<typeof BarcodePdfQuerySchema>;

    const pdfBuffer = await generateStudentBarcodePdf(locationId, gradeLevel);

    const safeName = gradeLevel.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="barcodes-grade-${safeName}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    handleControllerError(error, res);
  }
};
