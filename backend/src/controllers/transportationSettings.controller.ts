/**
 * Transportation Settings Controller
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { TransportationSettingsService } from '../services/transportationSettings.service';
import { handleControllerError } from '../utils/errorHandler';
import { createGraphClient } from '../utils/graphClient';
import { prisma } from '../lib/prisma';
import { UpdateTransportationSettingsSchema } from '../validators/transportation.validators';
import { loggers } from '../lib/logger';

const service = new TransportationSettingsService(prisma);

export const get = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const settings = await service.get();
    res.json(settings);
  } catch (error) {
    handleControllerError(error, res);
  }
};

export const update = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = UpdateTransportationSettingsSchema.parse(req.body);
    const settings = await service.update(data);
    res.json(settings);
  } catch (error) {
    handleControllerError(error, res);
  }
};

/**
 * GET /api/transportation/settings/suggested-emails
 *
 * Queries Microsoft Graph for members of the Finance Director,
 * Director of Schools, and Transportation Secretary Entra groups
 * and returns their email addresses as suggestions for the settings form.
 */
export const getSuggestedEmails = async (req: AuthRequest, res: Response): Promise<void> => {
  const groupEnvMap = {
    financeDirector:         process.env['ENTRA_FINANCE_DIRECTOR_GROUP_ID'],
    directorOfSchools:       process.env['ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID'],
    transportationSecretary: process.env['ENTRA_TRANSPORTATION_SECRETARY_GROUP_ID'],
  } as const;

  type GroupKey = keyof typeof groupEnvMap;

  async function getMembersEmails(graphClient: Awaited<ReturnType<typeof createGraphClient>>, groupId: string): Promise<string[]> {
    try {
      const resp = await graphClient
        .api(`/groups/${groupId}/members`)
        .select('mail,userPrincipalName')
        .get() as { value?: Array<{ mail?: string; userPrincipalName?: string }> };
      return (resp.value ?? [])
        .map((m) => m.mail ?? m.userPrincipalName ?? '')
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  try {
    const graphClient = await createGraphClient();
    const result: Record<GroupKey, string[]> = {
      financeDirector:         [],
      directorOfSchools:       [],
      transportationSecretary: [],
    };

    for (const [key, groupId] of Object.entries(groupEnvMap) as [GroupKey, string | undefined][]) {
      if (groupId) {
        result[key] = await getMembersEmails(graphClient, groupId);
      }
    }

    res.json(result);
  } catch (error) {
    loggers.admin.error('Failed to fetch suggested emails from Graph', { error });
    // Return empty suggestions — don't fail the page load
    res.json({
      financeDirector:         [],
      directorOfSchools:       [],
      transportationSecretary: [],
    });
  }
};
