import { PrismaClient, User } from '@prisma/client';
import { Client } from '@microsoft/microsoft-graph-client';
import { loggers } from '../lib/logger';
import { redactEntraId } from '../utils/redact';

type PermissionModule = 'TECHNOLOGY' | 'MAINTENANCE' | 'REQUISITIONS';
type UserRole = 'ADMIN' | 'USER';

interface PermissionMapping {
  module: PermissionModule;
  level: number;
}

interface RoleMapping {
  role: UserRole;
  permissions: PermissionMapping[];
}

export interface SyncErrorDetail {
  entraId: string;
  message: string;
}

export interface SyncOperationResult {
  added: number;
  updated: number;
  errors: number;
  deactivated: number;
  totalProcessed: number;
  durationMs: number;
  errorDetails: SyncErrorDetail[];
}

export class UserSyncService {
  private groupRoleMappings: Map<string, RoleMapping>;

  // Reverse map: group ID → env var name (for diagnostics)
  private groupIdToEnvName: Map<string, string[]>;

  constructor(
    private prisma: PrismaClient,
    private graphClient: Client
  ) {
    // Initialize group-to-role mappings from environment
    this.groupRoleMappings = new Map();
    this.groupIdToEnvName = new Map();

    // Helper: add a mapping, merging if the same group ID is used by multiple env vars
    const addMapping = (envVar: string, groupId: string | undefined, mapping: RoleMapping) => {
      if (!groupId) return;

      // Track env var → group ID for diagnostics
      const names = this.groupIdToEnvName.get(groupId) ?? [];
      names.push(envVar);
      this.groupIdToEnvName.set(groupId, names);

      const existing = this.groupRoleMappings.get(groupId);
      if (existing) {
        // Merge: take highest role + highest level per module
        const mergedRole: UserRole = (existing.role === 'ADMIN' || mapping.role === 'ADMIN') ? 'ADMIN' : 'USER';
        const permsByModule = new Map<PermissionModule, number>();
        for (const perm of [...existing.permissions, ...mapping.permissions]) {
          const current = permsByModule.get(perm.module) ?? 0;
          if (perm.level > current) permsByModule.set(perm.module, perm.level);
        }
        this.groupRoleMappings.set(groupId, {
          role: mergedRole,
          permissions: Array.from(permsByModule.entries()).map(([module, level]) => ({ module, level })),
        });

        loggers.userSync.warn('Multiple env vars point to the same Entra group ID — mappings merged', {
          groupId,
          envVars: names,
          mergedRole,
          mergedPermissions: Array.from(permsByModule.entries()).map(([m, l]) => `${m}:${l}`),
        });
      } else {
        this.groupRoleMappings.set(groupId, mapping);
      }
    };

    // System Admin - Full access to everything
    addMapping('ENTRA_ADMIN_GROUP_ID', process.env.ENTRA_ADMIN_GROUP_ID, {
      role: 'ADMIN',
      permissions: [
        { module: 'TECHNOLOGY', level: 3 },
        { module: 'MAINTENANCE', level: 3 },
        { module: 'REQUISITIONS', level: 6 },
      ],
    });

    // Director of Schools - Ultimate authority; issues final PO numbers
    addMapping('ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID', process.env.ENTRA_DIRECTOR_OF_SCHOOLS_GROUP_ID, {
      role: 'ADMIN',
      permissions: [
        { module: 'TECHNOLOGY', level: 2 },
        { module: 'MAINTENANCE', level: 3 },
        { module: 'REQUISITIONS', level: 6 },
      ],
    });

    // Director of Finance - Financial approval (dos_approved stage)
    addMapping('ENTRA_FINANCE_DIRECTOR_GROUP_ID', process.env.ENTRA_FINANCE_DIRECTOR_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'TECHNOLOGY', level: 2 },
        { module: 'MAINTENANCE', level: 2 },
        { module: 'REQUISITIONS', level: 5 },
      ],
    });

    // Tech Assistants - Technology department management
    addMapping('ENTRA_TECH_ASSISTANTS_GROUP_ID', process.env.ENTRA_TECH_ASSISTANTS_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'TECHNOLOGY', level: 3 },
        { module: 'MAINTENANCE', level: 2 },
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Maintenance Admin - Maintenance oversight
    addMapping('ENTRA_MAINTENANCE_ADMIN_GROUP_ID', process.env.ENTRA_MAINTENANCE_ADMIN_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'TECHNOLOGY', level: 2 },
        { module: 'MAINTENANCE', level: 3 },
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Principals - School-level management
    addMapping('ENTRA_PRINCIPALS_GROUP_ID', process.env.ENTRA_PRINCIPALS_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'TECHNOLOGY', level: 2 },
        { module: 'MAINTENANCE', level: 2 },
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Vice Principals - School-level support
    addMapping('ENTRA_VICE_PRINCIPALS_GROUP_ID', process.env.ENTRA_VICE_PRINCIPALS_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'TECHNOLOGY', level: 2 },
        { module: 'MAINTENANCE', level: 2 },
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // SPED Director - Requisition supervisor only
    addMapping('ENTRA_SPED_DIRECTOR_GROUP_ID', process.env.ENTRA_SPED_DIRECTOR_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Maintenance Director - Facilities oversight
    addMapping('ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID', process.env.ENTRA_MAINTENANCE_DIRECTOR_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'MAINTENANCE', level: 3 },
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Transportation Director - Transportation oversight
    addMapping('ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID', process.env.ENTRA_TRANSPORTATION_DIRECTOR_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'REQUISITIONS', level: 3 },
        { module: 'MAINTENANCE', level: 2 },
      ],
    });

    // Technology Director - Technology oversight
    addMapping('ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID', process.env.ENTRA_TECHNOLOGY_DIRECTOR_GROUP_ID, {
      role: 'ADMIN',
      permissions: [
        { module: 'TECHNOLOGY', level: 3 },
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Afterschool Director - Afterschool programs
    addMapping('ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID', process.env.ENTRA_AFTERSCHOOL_DIRECTOR_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Nurse Director - Health services
    addMapping('ENTRA_NURSE_DIRECTOR_GROUP_ID', process.env.ENTRA_NURSE_DIRECTOR_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Pre-K Director
    addMapping('ENTRA_PRE_K_DIRECTOR_GROUP_ID', process.env.ENTRA_PRE_K_DIRECTOR_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // CTE Director
    addMapping('ENTRA_CTE_DIRECTOR_GROUP_ID', process.env.ENTRA_CTE_DIRECTOR_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Food Services Supervisor - Food services oversight
    addMapping('ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID', process.env.ENTRA_FOOD_SERVICES_SUPERVISOR_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'REQUISITIONS', level: 3 },
      ],
    });

    // Finance PO Entry - Purchase order entry and account code assignment
    addMapping('ENTRA_FINANCE_PO_ENTRY_GROUP_ID', process.env.ENTRA_FINANCE_PO_ENTRY_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'REQUISITIONS', level: 4 },
      ],
    });

    // Food Services PO Entry - Food service purchase order entry
    addMapping('ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID', process.env.ENTRA_FOOD_SERVICES_PO_ENTRY_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'REQUISITIONS', level: 4 },
      ],
    });

    // All Staff - Standard staff member access
    addMapping('ENTRA_ALL_STAFF_GROUP_ID', process.env.ENTRA_ALL_STAFF_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'TECHNOLOGY', level: 1 },
        { module: 'MAINTENANCE', level: 1 },
        { module: 'REQUISITIONS', level: 2 },
      ],
    });

    // All Students - Very limited access
    addMapping('ENTRA_ALL_STUDENTS_GROUP_ID', process.env.ENTRA_ALL_STUDENTS_GROUP_ID, {
      role: 'USER',
      permissions: [
        { module: 'TECHNOLOGY', level: 1 },
      ],
    });
  }

  /**
   * Determine role and permissions from user's Entra ID groups.
   *
   * MERGES permissions from ALL matching groups — takes the highest role
   * and the highest permission level per module across all matched groups.
   * This ensures users in multiple groups (e.g. Principals + Finance PO Entry)
   * get the combined maximum, not just the first match.
   */
  public getRoleFromGroups(groupIds: string[]): RoleMapping {
    let highestRole: UserRole = 'USER';
    const permissionsByModule = new Map<PermissionModule, number>();
    const matchedGroups: string[] = [];

    for (const groupId of groupIds) {
      const mapping = this.groupRoleMappings.get(groupId);
      if (!mapping) continue;

      matchedGroups.push(groupId);

      // Take highest role
      if (mapping.role === 'ADMIN') highestRole = 'ADMIN';

      // Take highest level per module
      for (const perm of mapping.permissions) {
        const current = permissionsByModule.get(perm.module) ?? 0;
        if (perm.level > current) {
          permissionsByModule.set(perm.module, perm.level);
        }
      }
    }

    if (matchedGroups.length === 0) {
      return { role: 'USER', permissions: [] };
    }

    const permissions: PermissionMapping[] = Array.from(permissionsByModule.entries())
      .map(([module, level]) => ({ module, level }));

    loggers.userSync.debug('Role determined from groups (merged)', {
      matchedGroupCount: matchedGroups.length,
      matchedEnvVars: matchedGroups.flatMap(g => this.groupIdToEnvName.get(g) ?? []),
      role: highestRole,
      permissions: permissions.map(p => `${p.module}:${p.level}`),
    });

    return { role: highestRole, permissions };
  }

  /**
   * Get the group-to-env-var mapping for diagnostics
   */
  public getGroupDiagnostics(): {
    configuredGroups: Array<{ envVar: string; groupId: string }>;
    duplicateGroupIds: Array<{ groupId: string; envVars: string[] }>;
  } {
    const configuredGroups: Array<{ envVar: string; groupId: string }> = [];
    const duplicateGroupIds: Array<{ groupId: string; envVars: string[] }> = [];

    for (const [groupId, envVars] of this.groupIdToEnvName) {
      for (const envVar of envVars) {
        configuredGroups.push({ envVar, groupId });
      }
      if (envVars.length > 1) {
        duplicateGroupIds.push({ groupId, envVars });
      }
    }

    return { configuredGroups, duplicateGroupIds };
  }

  /**
   * Map Entra ID office location to standardized values
   */
  private mapOfficeLocation(entraLocation: string | null | undefined): string | null {
    if (!entraLocation) return null;

    const normalized = entraLocation.toLowerCase().trim();
    
    // Map to standardized location names (must match office_locations.name exactly)
    const locationMap: Record<string, string> = {
      // District Office
      'district': 'District Office',
      'central office': 'District Office',
      'district office': 'District Office',
      'assigned to district': 'District Office',
      'assigned to district office': 'District Office',
      
      // Obion County Central High School
      'obion county central high school': 'Obion County Central High School',
      'central high school': 'Obion County Central High School',
      'central high': 'Obion County Central High School',
      
      // Elementary Schools
      'hillcrest elementary': 'Hillcrest Elementary',
      'hillcrest elementary school': 'Hillcrest Elementary',
      'lake road elementary': 'Lake Road Elementary',
      'lake road elementary school': 'Lake Road Elementary',
      'ridgemont elementary': 'Ridgemont Elementary',
      'ridgemont elementary school': 'Ridgemont Elementary',
      'south fulton elementary': 'South Fulton Elementary',
      'south fulton elementary school': 'South Fulton Elementary',
      
      // South Fulton Middle/High School
      'south fulton middle high school': 'South Fulton Middle/High School',
      'south fulton middle/high school': 'South Fulton Middle/High School',
      'south fulton middle': 'South Fulton Middle/High School',
      'south fulton high school': 'South Fulton Middle/High School',
      
      // Departments
      'maintenance': 'Maintenance Department',
      'maintenance department': 'Maintenance Department',
      'transportation': 'Transportation Department',
      'transportation department': 'Transportation Department',
      'technology': 'Technology Department',
      'technology department': 'Technology Department',
      
      // Add more schools as needed
    };

    // Check for exact match first
    if (locationMap[normalized]) {
      return locationMap[normalized];
    }

    // If no mapping found, return the original value
    return entraLocation;
  }

  /**
   * Sync a single user from Entra ID
   */
  async syncUser(entraId: string): Promise<User> {
    const startTime = Date.now();
    try {
      loggers.userSync.info('Starting user sync', {
        entraId: redactEntraId(entraId),
      });

      // Fetch user from Graph API with multiple location-related fields
      const graphUser = await this.graphClient
        .api(`/users/${entraId}`)
        .select('id,displayName,givenName,surname,mail,jobTitle,department,officeLocation,physicalDeliveryOfficeName,usageLocation,accountEnabled')
        .get();

      // Log location fields for debugging
      loggers.userSync.debug('User location fields retrieved', {
        entraId: redactEntraId(entraId),
        displayName: graphUser.displayName,
        officeLocation: graphUser.officeLocation,
        physicalDeliveryOfficeName: graphUser.physicalDeliveryOfficeName,
        usageLocation: graphUser.usageLocation,
      });

      // Get user's groups (transitiveMemberOf includes nested group memberships)
      const groups = await this.graphClient
        .api(`/users/${entraId}/transitiveMemberOf`)
        .get();

      const groupIds = groups.value.map((g: any) => g.id);
      loggers.userSync.debug('User groups retrieved', {
        entraId: redactEntraId(entraId),
        displayName: graphUser.displayName,
        groupCount: groupIds.length,
      });

      // Determine role from groups
      const { role, permissions } = this.getRoleFromGroups(groupIds);
      loggers.userSync.info('Role assigned from groups', {
        entraId: redactEntraId(entraId),
        displayName: graphUser.displayName,
        role,
        permissionCount: permissions.length,
      });

      // Try multiple fields for office location (some orgs use physicalDeliveryOfficeName instead)
      const rawLocation = graphUser.officeLocation || graphUser.physicalDeliveryOfficeName || null;
      const officeLocation = this.mapOfficeLocation(rawLocation);
      
      loggers.userSync.debug('Location mapped', {
        entraId: redactEntraId(entraId),
        rawLocation,
        mappedLocation: officeLocation,
      });

      // Upsert user
      const user = await this.prisma.user.upsert({
        where: { entraId },
        update: {
          email: graphUser.mail,
          displayName: graphUser.displayName,
          firstName: graphUser.givenName,
          lastName: graphUser.surname,
          jobTitle: graphUser.jobTitle,
          department: graphUser.department,
          officeLocation,
          role, // With simplified 2-role system (ADMIN/USER), role always syncs from Entra groups.
          isActive: graphUser.accountEnabled ?? true,
          lastSync: new Date(),
        },
        create: {
          entraId,
          email: graphUser.mail,
          displayName: graphUser.displayName,
          firstName: graphUser.givenName,
          lastName: graphUser.surname,
          jobTitle: graphUser.jobTitle,
          department: graphUser.department,
          officeLocation,
          role,
          isActive: graphUser.accountEnabled ?? true,
          lastSync: new Date(),
        },
      });

      loggers.userSync.info('User sync completed', {
        entraId: redactEntraId(entraId),
        userId: user.id,
        displayName: user.displayName,
        role: user.role,
        duration: Date.now() - startTime,
      });

      return user;
    } catch (error: any) {
      loggers.userSync.error('User sync failed', {
        entraId: redactEntraId(entraId),
        error: {
          message: error.message,
          code: error.code,
        },
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Sync all users from a specific Entra ID group
   */
  async syncGroupUsers(groupId: string): Promise<SyncOperationResult> {
    const startTime = Date.now();
    loggers.userSync.info('Starting group sync', {
      groupId,
    });

    // Fetch all group members with pagination — include accountEnabled to skip disabled members
    let members: any[] = [];
    let nextLink = `/groups/${groupId}/members?$select=id,accountEnabled`;
    
    while (nextLink) {
      const response = await this.graphClient.api(nextLink).get();
      members = members.concat(response.value);
      nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('/v1.0')[1] : null;
    }

    loggers.userSync.info('Group members retrieved', {
      groupId,
      memberCount: members.length,
    });

    // Pre-fetch existing entraIds to distinguish adds from updates
    const existingRecords = await this.prisma.user.findMany({ select: { entraId: true } });
    const existingEntraIds = new Set<string>(
      existingRecords.map((u) => u.entraId).filter((id): id is string => id !== null)
    );

    let added = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails: SyncErrorDetail[] = [];

    const skippedDisabled = members.filter(
      (m) => m['@odata.type'] === '#microsoft.graph.user' && m.accountEnabled === false
    ).length;

    const CONCURRENCY_LIMIT = 10;

    const eligibleMembers = members.filter(
      (m) => m['@odata.type'] === '#microsoft.graph.user' && m.accountEnabled !== false
    );

    const tasks = eligibleMembers.map((member) => async () => {
      const isNew = !existingEntraIds.has(member.id);
      await this.syncUser(member.id);
      return isNew ? 'added' : 'updated';
    });

    const settled = await this.runWithConcurrency(tasks, CONCURRENCY_LIMIT);

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === 'fulfilled') {
        if (result.value === 'added') { added++; } else { updated++; }
      } else {
        errors++;
        if (errorDetails.length < 20) {
          errorDetails.push({
            entraId: redactEntraId(eligibleMembers[i].id),
            message: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
        loggers.userSync.error('Failed to sync group member', {
          groupId,
          memberId: redactEntraId(eligibleMembers[i].id),
          error: result.reason,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    loggers.userSync.info('Group sync completed', {
      groupId,
      totalMembers: members.length,
      added,
      updated,
      errors,
      duration: durationMs,
    });

    return {
      added,
      updated,
      errors,
      deactivated: 0,
      totalProcessed: added + updated + errors,
      durationMs,
      errorDetails,
    };
  }

  /**
   * Sync all enabled users in the organization
   */
  async syncAllUsers(): Promise<SyncOperationResult> {
    const startTime = Date.now();
    loggers.userSync.info('Starting full user sync');

    // Fetch all enabled users with pagination.
    // $filter=accountEnabled eq true is an advanced filter requiring ConsistencyLevel: eventual
    // and $count=true per Microsoft Graph documentation.
    let allUsers: any[] = [];
    let nextLink = '/users?$select=id&$filter=accountEnabled eq true&$count=true';
    
    while (nextLink) {
      const response = await this.graphClient
        .api(nextLink)
        .header('ConsistencyLevel', 'eventual')
        .get();
      allUsers = allUsers.concat(response.value);
      nextLink = response['@odata.nextLink'] ? response['@odata.nextLink'].split('/v1.0')[1] : null;
      loggers.userSync.debug('Fetching users in progress', {
        usersFetched: allUsers.length,
      });
    }

    loggers.userSync.info('All users retrieved', {
      totalUsers: allUsers.length,
    });

    // Pre-fetch existing entraIds to distinguish adds from updates
    const existingRecords = await this.prisma.user.findMany({ select: { entraId: true } });
    const existingEntraIds = new Set<string>(
      existingRecords.map((u) => u.entraId).filter((id): id is string => id !== null)
    );

    let added = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails: SyncErrorDetail[] = [];

    const CONCURRENCY_LIMIT = 10;

    const tasks = allUsers.map((user) => async () => {
      const isNew = !existingEntraIds.has(user.id);
      await this.syncUser(user.id);
      return isNew ? 'added' : 'updated';
    });

    const settled = await this.runWithConcurrency(tasks, CONCURRENCY_LIMIT);

    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === 'fulfilled') {
        if (result.value === 'added') { added++; } else { updated++; }
      } else {
        errors++;
        if (errorDetails.length < 20) {
          errorDetails.push({
            entraId: redactEntraId(allUsers[i].id),
            message: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
        loggers.userSync.error('Failed to sync user in bulk operation', {
          userId: redactEntraId(allUsers[i].id),
          error: result.reason,
        });
      }
    }

    // Deactivate DB users whose entraId was NOT in the active Entra list.
    // Safety guard: only run when the active list is non-empty (prevents mass deactivation
    // if Graph returns empty due to a transient API error).
    let deactivated = 0;
    const activeEntraIds: string[] = allUsers.map((u) => u.id as string);
    if (activeEntraIds.length > 0) {
      try {
        const deactivatedResult = await this.prisma.user.updateMany({
          where: {
            entraId: { notIn: activeEntraIds },
            isActive: true,
          },
          data: { isActive: false },
        });
        deactivated = deactivatedResult.count;
        if (deactivated > 0) {
          loggers.userSync.info('Deactivated users not present in Entra active list', {
            deactivatedCount: deactivated,
          });
        }
      } catch (error) {
        loggers.userSync.error('Failed to deactivate stale users — DB may have ghost active records', { error });
      }
    }

    const durationMs = Date.now() - startTime;
    loggers.userSync.info('Full user sync completed', {
      totalUsers: allUsers.length,
      added,
      updated,
      errors,
      deactivated,
      duration: durationMs,
    });

    return {
      added,
      updated,
      errors,
      deactivated,
      totalProcessed: allUsers.length,
      durationMs,
      errorDetails,
    };
  }

  /**
   * Run async tasks with a bounded concurrency limit.
   * Processes `tasks` in parallel but no more than `limit` at a time.
   */
  private async runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    limit: number
  ): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = [];
    let index = 0;

    async function worker(): Promise<void> {
      while (index < tasks.length) {
        const current = index++;
        try {
          const value = await tasks[current]();
          results[current] = { status: 'fulfilled', value };
        } catch (reason) {
          results[current] = { status: 'rejected', reason };
        }
      }
    }

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }
}
