/**
 * TransportationRequestService
 *
 * Business logic for standalone transportation requests.
 * Pattern follows FieldTripTransportationService exactly:
 *   - Class instance, exported as singleton
 *   - Prisma includes defined as const at top
 *   - Custom errors: NotFoundError, ValidationError, AuthorizationError
 */
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { NotFoundError, ValidationError, AuthorizationError } from '../utils/errors';
import type {
  CreateTransportationRequestDto,
  ApproveTransportationRequestDto,
  DenyTransportationRequestDto,
} from '../validators/transportationRequest.validators';

// Prisma include shape (reused across all reads)
const TR_WITH_USERS = {
  submittedBy: {
    select: { id: true, firstName: true, lastName: true, displayName: true, email: true },
  },
  approvedBy: {
    select: { id: true, displayName: true, firstName: true, lastName: true },
  },
  deniedBy: {
    select: { id: true, displayName: true, firstName: true, lastName: true },
  },
} as const;

export class TransportationRequestService {

  async create(userId: string, userEmail: string, data: CreateTransportationRequestDto) {
    if (!data.needsDriver && !data.driverName?.trim()) {
      throw new ValidationError('Driver name is required when providing your own driver');
    }

    const tripDate = new Date(data.tripDate);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    if (tripDate < tomorrow) {
      throw new ValidationError('Trip date must be in the future');
    }

    logger.info('Creating transportation request', { userId });

    return prisma.transportationRequest.create({
      data: {
        submittedById:             userId,
        submitterEmail:            userEmail,
        school:                    data.school,
        groupOrActivity:           data.groupOrActivity,
        sponsorName:               data.sponsorName,
        chargedTo:                 data.chargedTo ?? null,
        tripDate:                  tripDate,
        busCount:                  data.busCount,
        studentCount:              data.studentCount,
        chaperoneCount:            data.chaperoneCount,
        needsDriver:               data.needsDriver,
        driverName:                data.driverName ?? null,
        loadingLocation:           data.loadingLocation,
        loadingTime:               data.loadingTime,
        leavingSchoolTime:         data.leavingSchoolTime,
        arriveFirstDestTime:       data.arriveFirstDestTime ?? null,
        leaveLastDestTime:         data.leaveLastDestTime ?? null,
        returnToSchoolTime:        data.returnToSchoolTime,
        primaryDestinationName:    data.primaryDestinationName,
        primaryDestinationAddress: data.primaryDestinationAddress,
        additionalDestinations:    data.additionalDestinations ?? Prisma.DbNull,
        tripItinerary:             data.tripItinerary ?? null,
        status:                    'PENDING',
      },
      include: TR_WITH_USERS,
    });
  }

  async list(userId: string, permLevel: number, filters: {
    status?: string;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.TransportationRequestWhereInput = {};

    // Level 1: own requests only; level 2+: all requests
    if (permLevel < 2) {
      where.submittedById = userId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.from || filters.to) {
      where.tripDate = {};
      if (filters.from) (where.tripDate as Prisma.DateTimeFilter).gte = new Date(filters.from);
      if (filters.to)   (where.tripDate as Prisma.DateTimeFilter).lte = new Date(filters.to);
    }

    return prisma.transportationRequest.findMany({
      where,
      include: TR_WITH_USERS,
      orderBy: [{ tripDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getById(id: string, userId: string, permLevel: number) {
    const record = await prisma.transportationRequest.findUnique({
      where:   { id },
      include: TR_WITH_USERS,
    });

    if (!record) throw new NotFoundError('TransportationRequest', id);

    // Level 1 users can only see their own
    if (permLevel < 2 && record.submittedById !== userId) {
      throw new AuthorizationError('You do not have access to this transportation request');
    }

    return record;
  }

  async approve(id: string, approverId: string, data: ApproveTransportationRequestDto) {
    const record = await prisma.transportationRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('TransportationRequest', id);
    if (record.status !== 'PENDING') {
      throw new ValidationError(`Cannot approve a request with status '${record.status}'`);
    }

    logger.info('Approving transportation request', { id, approverId });

    return prisma.transportationRequest.update({
      where: { id },
      data: {
        status:           'APPROVED',
        approvedById:     approverId,
        approvedAt:       new Date(),
        approvalComments: data.comments ?? null,
      },
      include: TR_WITH_USERS,
    });
  }

  async deny(id: string, denierId: string, data: DenyTransportationRequestDto) {
    const record = await prisma.transportationRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('TransportationRequest', id);
    if (record.status !== 'PENDING') {
      throw new ValidationError(`Cannot deny a request with status '${record.status}'`);
    }

    logger.info('Denying transportation request', { id, denierId });

    return prisma.transportationRequest.update({
      where: { id },
      data: {
        status:       'DENIED',
        deniedById:   denierId,
        deniedAt:     new Date(),
        denialReason: data.denialReason,
      },
      include: TR_WITH_USERS,
    });
  }

  async delete(id: string, userId: string) {
    const record = await prisma.transportationRequest.findUnique({ where: { id } });
    if (!record) throw new NotFoundError('TransportationRequest', id);
    if (record.submittedById !== userId) {
      throw new AuthorizationError('You can only delete your own transportation requests');
    }
    if (record.status !== 'PENDING') {
      throw new ValidationError('Only PENDING requests can be deleted');
    }

    logger.info('Deleting transportation request', { id, userId });
    await prisma.transportationRequest.delete({ where: { id } });
  }
}

export const transportationRequestService = new TransportationRequestService();
