import express, { Request, Response } from 'express';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { UserSyncService } from '../services/userSync.service';
import { cronJobsService } from '../services/cronJobs.service';
import { prisma } from '../lib/prisma';
import { msalClient } from '../config/entraId';
import { Client } from '@microsoft/microsoft-graph-client';
import { loggers } from '../lib/logger';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Helper to create Graph client from user's token
async function createGraphClient() {
  try {
    // Get app-only token for Graph API
    const authResult = await msalClient.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });

    return Client.init({
      authProvider: (done) => {
        done(null, authResult?.accessToken || '');
      },
    });
  } catch (error) {
    loggers.admin.error('Failed to get Graph token', { error });
    throw new Error('Failed to authenticate with Microsoft Graph');
  }
}

// Get sync status
router.get('/sync-status', async (req: Request, res: Response) => {
  try {
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const lastSynced = await prisma.user.findFirst({
      orderBy: { lastSync: 'desc' },
      select: { lastSync: true, email: true },
    });

    const roleBreakdown = await prisma.user.groupBy({
      by: ['role'],
      _count: true,
    });

    // Log environment variables for debugging
    loggers.admin.debug('Group configuration status', {
      groupsConfigured: {
        admin: !!process.env.ENTRA_ADMIN_GROUP_ID,
        technologyDirector: !!process.env.ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID,
        directorOfSchools: !!process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID,
      },
    });

    res.json({
      totalUsers,
      activeUsers,
      lastSyncedAt: lastSynced?.lastSync,
      lastSyncedUser: lastSynced?.email,
      roleBreakdown: roleBreakdown.map(r => ({
        role: r.role,
        count: r._count,
      })),
      groupsConfigured: {
        admin: !!process.env.ENTRA_ADMIN_GROUP_ID,
        technologyDirector: !!process.env.ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID,
        directorOfSchools: !!process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID,
        financeDirector: !!process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID,
        spedDirector: !!process.env.ENTRA_SPED_DIRECTOR_GROUP_ID,
        maintenanceDirector: !!process.env.ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID,
        transportationDirector: !!process.env.ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID,
        afterschoolDirector: !!process.env.ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID,
        nurseDirector: !!process.env.ENTRA_NURSE_DIRECTOR_GROUP_ID,
        preKDirector: !!process.env.ENTRA_PRE_K_DIRECTOR_GROUP_ID,
        cteDirector: !!process.env.ENTRA_CTE_DIRECTOR_GROUP_ID,
        foodServicesSupervisor: !!process.env.ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID,
        foodServicesPOEntry: !!process.env.ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID,
        financePOEntry: !!process.env.ENTRA_FINANCE_PO_ENTRY_GROUP_ID,
        principals: !!process.env.ENTRA_PRINCIPALS_GROUP_ID,
        vicePrincipals: !!process.env.ENTRA_VICE_PRINCIPALS_GROUP_ID,
        allStaff: !!process.env.ENTRA_ALL_STAFF_GROUP_ID,
        allStudents: !!process.env.ENTRA_ALL_STUDENTS_GROUP_ID,
      },
    });
  } catch (error: any) {
    loggers.admin.error('Failed to get sync status', { error });
    res.status(500).json({ error: 'Failed to get sync status', message: error.message });
  }
});

// Sync all users from Entra ID
router.post('/sync-users/all', async (req: Request, res: Response) => {
  try {
    const graphClient = await createGraphClient();
    const syncService = new UserSyncService(prisma, graphClient);
    
    const result = await syncService.syncAllUsers();

    res.json({
      success: true,
      message: `Synced ${result.added + result.updated} users from Entra ID (${result.added} added, ${result.updated} updated, ${result.errors} errors, ${result.deactivated} deactivated)`,
      count: result.added + result.updated,
      detail: result,
    });
  } catch (error: any) {
    loggers.admin.error('Sync all users failed', { error });
    res.status(500).json({ 
      error: 'Sync failed', 
      message: error.message 
    });
  }
});

// Sync users from All Staff group
router.post('/sync-users/staff', async (req: Request, res: Response) => {
  try {
    const groupId = process.env.ENTRA_ALL_STAFF_GROUP_ID;
    if (!groupId) {
      return res.status(400).json({ error: 'All Staff group ID not configured in .env' });
    }

    const graphClient = await createGraphClient();
    const syncService = new UserSyncService(prisma, graphClient);
    
    const result = await syncService.syncGroupUsers(groupId);

    res.json({
      success: true,
      message: `Synced ${result.added + result.updated} staff members (${result.added} added, ${result.updated} updated, ${result.errors} errors)`,
      count: result.added + result.updated,
      detail: result,
    });
  } catch (error: any) {
    loggers.admin.error('Sync staff failed', { error });
    res.status(500).json({ 
      error: 'Sync failed', 
      message: error.message 
    });
  }
});

// Sync users from All Students group
router.post('/sync-users/students', async (req: Request, res: Response) => {
  try {
    const groupId = process.env.ENTRA_ALL_STUDENTS_GROUP_ID;
    if (!groupId) {
      return res.status(400).json({ error: 'All Students group ID not configured in .env' });
    }

    const graphClient = await createGraphClient();
    const syncService = new UserSyncService(prisma, graphClient);
    
    const result = await syncService.syncGroupUsers(groupId);

    res.json({
      success: true,
      message: `Synced ${result.added + result.updated} students (${result.added} added, ${result.updated} updated, ${result.errors} errors)`,
      count: result.added + result.updated,
      detail: result,
    });
  } catch (error: any) {
    loggers.admin.error('Sync students failed', { error });
    res.status(500).json({ 
      error: 'Sync failed', 
      message: error.message 
    });
  }
});

// Sync users from a custom group by ID
router.post('/sync-users/group/:groupId', async (req: Request, res: Response) => {
  try {
    const groupId = req.params.groupId as string;

    const graphClient = await createGraphClient();
    const syncService = new UserSyncService(prisma, graphClient);
    
    const result = await syncService.syncGroupUsers(groupId);

    res.json({
      success: true,
      message: `Synced ${result.added + result.updated} users from group (${result.added} added, ${result.updated} updated, ${result.errors} errors)`,
      count: result.added + result.updated,
      detail: result,
    });
  } catch (error: any) {
    loggers.admin.error('Sync group failed', { error, groupId: req.params.groupId });
    res.status(500).json({ 
      error: 'Sync failed', 
      message: error.message 
    });
  }
});

// Cron Jobs Management
// Get status of all scheduled jobs
router.get('/cron-jobs/status', (req: Request, res: Response) => {
  try {
    const status = cronJobsService.getStatus();
    res.json({
      jobs: status,
      timezone: process.env.TZ || 'America/Chicago'
    });
  } catch (error: any) {
    loggers.admin.error('Failed to get cron status', { error });
    res.status(500).json({ error: 'Failed to get cron job status' });
  }
});

// Manually trigger supervisor sync
router.post('/sync-supervisors/trigger', async (req: AuthRequest, res: Response) => {
  try {
    loggers.admin.info('Manual supervisor sync triggered', {
      triggeredBy: req.user?.email,
      userId: req.user?.id,
    });
    
    // Run sync in background and return immediately
    cronJobsService.triggerSupervisorSync()
      .then(() => {
        loggers.admin.info('Manual supervisor sync completed');
      })
      .catch((error) => {
        loggers.admin.error('Manual supervisor sync failed', { error });
      });

    res.json({ 
      message: 'Supervisor sync started. Check logs for progress.',
      triggeredBy: req.user?.email,
      triggeredAt: new Date().toISOString()
    });
  } catch (error: any) {
    loggers.admin.error('Failed to trigger sync', { error });
    res.status(500).json({ 
      error: 'Failed to trigger supervisor sync',
      message: error.message 
    });
  }
});

export default router;
