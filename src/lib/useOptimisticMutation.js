import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * useOptimisticMutation - Wraps React Query mutation with optimistic updates
 * Provides immediate UI feedback before server response
 * Automatically reverts on error
 */
export function useOptimisticMutation(
  mutationFn,
  options = {}
) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn,
    ...options,
    onMutate: async (variables) => {
      // Call user's onMutate if provided
      let context = {};
      if (options.onMutate) {
        context = await options.onMutate(variables);
      }

      // Cancel outgoing queries to prevent overwriting optimistic data
      if (options.queryKey) {
        await queryClient.cancelQueries({ queryKey: options.queryKey });
      }

      return context;
    },
    onError: (error, variables, context) => {
      // Revert optimistic updates on error
      if (options.queryKey && context) {
        queryClient.setQueryData(options.queryKey, context.previousData);
      }

      // Call user's onError if provided
      if (options.onError) {
        options.onError(error, variables, context);
      }
    },
    onSuccess: (data, variables, context) => {
      // Invalidate and refetch on success
      if (options.queryKey) {
        queryClient.invalidateQueries({ queryKey: options.queryKey });
      }

      // Call user's onSuccess if provided
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
  });

  return mutation;
}