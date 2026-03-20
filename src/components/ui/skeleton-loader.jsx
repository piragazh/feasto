import React from 'react';
import { cn } from '@/lib/utils';

export function SkeletonCard({ className, count = 1 }) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-6 bg-gradient-to-r from-gray-200 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-lg animate-pulse">
          <div className="h-6 bg-gray-300 dark:bg-gray-500 rounded w-3/4 mb-4" />
          <div className="space-y-2">
            <div className="h-4 bg-gray-300 dark:bg-gray-500 rounded w-full" />
            <div className="h-4 bg-gray-300 dark:bg-gray-500 rounded w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div className="border rounded-lg overflow-hidden dark:border-gray-700">
      {/* Header */}
      <div className="grid gap-4 p-4 bg-gray-100 dark:bg-gray-800" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-5 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="grid gap-4 p-4 border-t dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 animate-pulse" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, colIdx) => (
            <div key={colIdx} className="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg">
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-6 animate-pulse" />
      <div className="flex items-end gap-4 h-64">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-gradient-to-t from-orange-200 to-orange-100 dark:from-orange-900 dark:to-orange-800 rounded-t animate-pulse"
            style={{ height: `${Math.random() * 80 + 20}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonStats({ count = 3 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-6 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-3 animate-pulse" />
          <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-2/3 animate-pulse" />
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2 mt-3 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonListItem({ count = 1 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
              <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2 animate-pulse" />
            </div>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-full animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonFormField() {
  return (
    <div className="space-y-3">
      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/4 animate-pulse" />
      <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded border dark:border-gray-700 animate-pulse" />
    </div>
  );
}

export function SkeletonFormSection() {
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 space-y-6">
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 animate-pulse" />
          <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      ))}
      <div className="flex gap-3 pt-4">
        <div className="h-10 bg-orange-300 dark:bg-orange-900 rounded w-24 animate-pulse" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse" />
      </div>
    </div>
  );
}