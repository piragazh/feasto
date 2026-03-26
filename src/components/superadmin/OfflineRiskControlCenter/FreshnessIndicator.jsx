import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * FreshnessIndicator - Page-level freshness display and refresh controls
 * Shows last refresh time, stale warning, and refresh/auto-refresh options
 */
export default function FreshnessIndicator({
  lastRefreshedAt,
  latestSnapshotTime,
  isRefreshing = false,
  onRefresh,
  autoRefreshEnabled = false,
  onAutoRefreshToggle
}) {
  // Calculate age in minutes
  const getAgeMinutes = (timestamp) => {
    if (!timestamp) return null;
    const now = new Date();
    const then = new Date(timestamp);
    return Math.round((now - then) / 1000 / 60);
  };

  // Determine freshness status
  const getStatus = (ageMinutes) => {
    if (!ageMinutes) return { level: 'unknown', icon: '❓', color: 'text-gray-500' };
    if (ageMinutes < 5) return { level: 'fresh', icon: '🟢', color: 'text-green-600' };
    if (ageMinutes < 15) return { level: 'aging', icon: '🟡', color: 'text-yellow-600' };
    return { level: 'stale', icon: '🔴', color: 'text-red-600' };
  };

  const ageMinutes = getAgeMinutes(lastRefreshedAt);
  const status = getStatus(ageMinutes);
  const snapshotAgeMinutes = getAgeMinutes(latestSnapshotTime);

  // Format time display
  const formatTime = (minutes) => {
    if (!minutes && minutes !== 0) return 'unknown';
    if (minutes === 0) return 'just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 1) return mins === 0 ? '1 hour ago' : `1h ${mins}m ago`;
    return `${hours}h ${mins}m ago`;
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-white rounded border border-gray-200">
      {/* Left: Freshness Status */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{status.icon}</span>
          <div>
            <p className={`text-sm font-medium ${status.color}`}>
              {status.level === 'fresh' && 'Data is fresh'}
              {status.level === 'aging' && 'Data is aging'}
              {status.level === 'stale' && 'Data may be stale'}
              {status.level === 'unknown' && 'Data freshness unknown'}
            </p>
            <p className="text-xs text-gray-600">
              Last refreshed: {formatTime(ageMinutes)}
            </p>
            {latestSnapshotTime && (
              <p className="text-xs text-gray-500 mt-1">
                Latest snapshot: {formatTime(snapshotAgeMinutes)}
              </p>
            )}
          </div>
        </div>

        {/* Stale Warning */}
        {status.level === 'stale' && (
          <div className="flex items-start gap-2 p-2 bg-red-50 rounded border border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              Consider refreshing for latest data
            </p>
          </div>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Refresh Button */}
        <Button
          onClick={onRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
          className="gap-2"
          title="Manually refresh all data"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>

        {/* Auto-Refresh Toggle */}
        <button
          onClick={onAutoRefreshToggle}
          className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
            autoRefreshEnabled
              ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
              : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
          }`}
          title="Enable automatic refresh every 5 minutes"
        >
          {autoRefreshEnabled ? '🔄 Auto-refresh ON' : 'Auto-refresh'}
        </button>
      </div>
    </div>
  );
}