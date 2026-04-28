import { useMutation, useQueryClient } from '@tanstack/react-query';
import locationService from '@/services/location.service';
import { CreateLocationRequest, AssignSupervisorRequest, SupervisorType } from '@/types/location.types';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Mutation for creating a new location
 */
export function useCreateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLocationRequest) =>
      locationService.createLocation(data),

    onSuccess: () => {
      // Invalidate all location queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.locations.all,
      });
    },

    onError: (error: Error) => {
      console.error('Failed to create location:', error);
    },
  });
}

/**
 * Mutation for updating a location
 */
export function useUpdateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateLocationRequest }) =>
      locationService.updateLocation(id, data),

    onSuccess: (_, { id }) => {
      // Invalidate all location queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.locations.all,
      });
      
      // Invalidate specific location
      queryClient.invalidateQueries({
        queryKey: queryKeys.locations.detail(id),
      });
    },

    onError: (error: Error) => {
      console.error('Failed to update location:', error);
    },
  });
}

/**
 * Mutation for deleting a location
 */
export function useDeleteLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (locationId: string) =>
      locationService.deleteLocation(locationId),

    onSuccess: () => {
      // Invalidate all location queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.locations.all,
      });
    },

    onError: (error: Error) => {
      console.error('Failed to delete location:', error);
    },
  });
}

/**
 * Mutation for assigning a supervisor to a location
 */
export function useAssignSupervisor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ locationId, data }: { locationId: string; data: AssignSupervisorRequest }) =>
      locationService.assignSupervisor(locationId, data),

    onSuccess: (_, { locationId }) => {
      // Invalidate location queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.locations.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.locations.detail(locationId),
      });
    },

    onError: (error: Error) => {
      console.error('Failed to assign supervisor:', error);
    },
  });
}

/**
 * Mutation for removing a supervisor from a location
 */
export function useRemoveSupervisor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ locationId, supervisorId, supervisorType }: { locationId: string; supervisorId: string; supervisorType: SupervisorType }) =>
      locationService.removeSupervisor(locationId, supervisorId, supervisorType),

    onSuccess: (_, { locationId }) => {
      // Invalidate location queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.locations.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.locations.detail(locationId),
      });
    },

    onError: (error: Error) => {
      console.error('Failed to remove supervisor:', error);
    },
  });
}
