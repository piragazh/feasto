import { useOptimisticMutation } from './useOptimisticMutation';
/* eslint-disable no-undef */
import { useQueryClient } from '@tanstack/react-query';
import { useOptimisticMutation } from '@/lib/useOptimisticMutation';

/**
 * Common mutation patterns with pre-configured optimistic updates
 * Systematizes optimistic UI across the app
 */

/**
 * useAddItemMutation - Add item to a list with optimistic UI
 */
export function useAddItemMutation(queryKey, newItem) {
  const queryClient = useQueryClient();
  return useOptimisticMutation(null, {
    queryKey,
    onMutate: async () => {
      const previous = queryClient.getQueryData(queryKey);
      
      queryClient.setQueryData(queryKey, (old = []) => [
        ...old,
        { ...newItem, id: `temp-${Date.now()}` }
      ]);

      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
  });
}

/**
 * useUpdateItemMutation - Update item in a list with optimistic UI
 */
export function useUpdateItemMutation(queryKey, itemId, updates) {
  const queryClient = useQueryClient();
  return useOptimisticMutation(null, {
    queryKey,
    onMutate: async () => {
      const previous = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old = []) =>
        old.map(item => 
          item.id === itemId ? { ...item, ...updates } : item
        )
      );

      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
  });
}

/**
 * useDeleteItemMutation - Delete item from a list with optimistic UI
 */
export function useDeleteItemMutation(queryKey, itemId) {
  const queryClient = useQueryClient();
  return useOptimisticMutation(null, {
    queryKey,
    onMutate: async () => {
      const previous = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old = []) =>
        old.filter(item => item.id !== itemId)
      );

      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
  });
}

/**
 * useToggleMutation - Toggle boolean field with optimistic UI
 */
export function useToggleMutation(queryKey, itemId, field) {
  const queryClient = useQueryClient();
  return useOptimisticMutation(null, {
    queryKey,
    onMutate: async () => {
      const previous = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old = []) =>
        old.map(item =>
          item.id === itemId ? { ...item, [field]: !item[field] } : item
        )
      );

      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
  });
}

/**
 * Example usage in components:
 * 
 * const addItemMutation = useOptimisticMutation(
 *   (newItem) => api.addItem(newItem),
 *   {
 *     queryKey: ['items'],
 *     onMutate: async (newItem) => {
 *       const previous = queryClient.getQueryData(['items']);
 *       queryClient.setQueryData(['items'], (old = []) => [...old, newItem]);
 *       return { previous };
 *     },
 *     onError: (error, variables, context) => {
 *       if (context?.previous) {
 *         queryClient.setQueryData(['items'], context.previous);
 *       }
 *       toast.error('Failed to add item');
 *     },
 *   }
 * );
 */