import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { loggers } from './logger';

export async function writeAuditLog(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
    },
  }).catch((err: Error) => {
    loggers.server.error('Failed to write audit log', {
      error: { message: err.message, name: err.name },
      actorId, action, entityType, entityId,
    });
  });
}
