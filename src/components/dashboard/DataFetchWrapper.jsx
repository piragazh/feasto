import React from 'react';
import { SkeletonCard, SkeletonTable, SkeletonStats, SkeletonChart, SkeletonFormSection } from '@/components/ui/skeleton-loader';
import { LiveRegion } from '@/lib/aria-utils';

/**
 * Wrapper component for data-fetching views
 * Handles loading states, errors, and ARIA announcements
 */
export function DataFetchWrapper({
  isLoading,
  error,
  data,
  skeletonType = 'card',
  skeletonCount = 3,
  children,
  errorMessage,
  loadingMessage = 'Loading content...',
  successMessage
}) {
  // Render skeleton based on type
  const renderSkeleton = () => {
    switch (skeletonType) {
      case 'table':
        return <SkeletonTable rows={skeletonCount} />;
      case 'stats':
        return <SkeletonStats count={skeletonCount} />;
      case 'chart':
        return <SkeletonChart />;
      case 'form':
        return <SkeletonFormSection />;
      case 'card':
      default:
        return <SkeletonCard count={skeletonCount} />;
    }
  };

  return (
    <>
      {/* ARIA announcements for screen readers */}
      <LiveRegion role="status" message={isLoading ? loadingMessage : ''} />
      {error && <LiveRegion role="alert" message={`Error: ${errorMessage || error.message}`} />}
      {!isLoading && data && successMessage && <LiveRegion role="status" message={successMessage} />}

      {/* Loading state */}
      {isLoading && renderSkeleton()}

      {/* Error state */}
      {error && !isLoading && (
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <h3 className="font-semibold text-red-900 dark:text-red-200 mb-2">Error Loading Data</h3>
          <p className="text-red-800 dark:text-red-300 text-sm">{errorMessage || error.message}</p>
        </div>
      )}

      {/* Success state */}
      {!isLoading && !error && children}
    </>
  );
}

/**
 * Wrapper for table/list views with dynamic updates
 */
export function DynamicListWrapper({
  isLoading,
  error,
  items = [],
  children,
  emptyMessage = 'No items to display',
  itemLabel = 'item',
  errorMessage
}) {
  const itemCount = items?.length || 0;
  const countMessage = `${itemCount} ${itemCount === 1 ? itemLabel : `${itemLabel}s`}`;

  return (
    <>
      <LiveRegion role="status" message={!isLoading && itemCount >= 0 ? `Loaded: ${countMessage}` : ''} />
      {error && <LiveRegion role="alert" message={`Error: ${errorMessage || error.message}`} />}

      {isLoading ? (
        <SkeletonTable rows={5} />
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-300 text-sm">{errorMessage || error.message}</p>
        </div>
      ) : itemCount === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          {emptyMessage}
        </div>
      ) : (
        children
      )}
    </>
  );
}