import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { createLogger } from '../lib/logger';

const log = createLogger('EmailQueueAdmin');

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid('Invalid email ID format');

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
  context: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'status', 'attempts', 'priority']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/email-queue
 * Paginated list with status/context filters, sorting
 */
export async function getEmailQueueList(req: Request, res: Response) {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }

    const { page, limit, status, context, search, sortBy, sortDir } = parsed.data;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where.status = statuses[0];
      } else if (statuses.length > 1) {
        where.status = { in: statuses };
      }
    }

    if (context) {
      where.context = context;
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { recipients: { has: search } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.email_queue.findMany({
        where,
        select: {
          id: true,
          recipients: true,
          subject: true,
          priority: true,
          status: true,
          attempts: true,
          lastError: true,
          context: true,
          relatedEntityId: true,
          nextAttemptAt: true,
          sentAt: true,
          createdAt: true,
          updatedAt: true,
          // NOTE: htmlBody excluded intentionally
        },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.email_queue.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    log.debug('Email queue list fetched', { page, limit, total, filters: { status, context, search } });

    return res.json({ items, total, page, limit, totalPages });
  } catch (error) {
    log.error('Failed to fetch email queue list', { error });
    return res.status(500).json({ error: 'Failed to fetch email queue' });
  }
}

/**
 * GET /api/admin/email-queue/stats
 * Counts by status
 */
export async function getEmailQueueStats(_req: Request, res: Response) {
  try {
    const grouped = await prisma.email_queue.groupBy({
      by: ['status'],
      _count: true,
    });

    const stats: Record<string, number> = {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
    };

    let total = 0;
    for (const row of grouped) {
      stats[row.status] = row._count;
      total += row._count;
    }

    return res.json({ ...stats, total });
  } catch (error) {
    log.error('Failed to fetch email queue stats', { error });
    return res.status(500).json({ error: 'Failed to fetch email queue stats' });
  }
}

/**
 * POST /api/admin/email-queue/:id/retry
 * Reset a single failed email to pending
 */
export async function retryEmail(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    const idResult = uuidSchema.safeParse(id);
    if (!idResult.success) {
      return res.status(400).json({ error: 'Invalid email ID format' });
    }

    const email = await prisma.email_queue.findUnique({ where: { id } });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (email.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed emails can be retried' });
    }

    await prisma.email_queue.update({
      where: { id: id },
      data: {
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextAttemptAt: new Date(),
      },
    });

    log.info('Email retried', { id, subject: email.subject });

    return res.json({ success: true, message: 'Email re-queued for retry' });
  } catch (error) {
    log.error('Failed to retry email', { error, id: req.params.id });
    return res.status(500).json({ error: 'Failed to retry email' });
  }
}

/**
 * POST /api/admin/email-queue/retry-all-failed
 * Retry all failed emails at once
 */
export async function retryAllFailed(_req: Request, res: Response) {
  try {
    const result = await prisma.email_queue.updateMany({
      where: { status: 'failed' },
      data: {
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextAttemptAt: new Date(),
      },
    });

    log.info('Bulk retry of failed emails', { count: result.count });

    return res.json({
      success: true,
      count: result.count,
      message: `${result.count} failed email${result.count === 1 ? '' : 's'} re-queued`,
    });
  } catch (error) {
    log.error('Failed to bulk retry emails', { error });
    return res.status(500).json({ error: 'Failed to retry failed emails' });
  }
}
