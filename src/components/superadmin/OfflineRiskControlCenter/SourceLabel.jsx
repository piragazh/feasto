import React from 'react';

/**
 * SourceLabel - Card-level data source indicator
 * Labels show whether data comes from live queries or scheduled snapshots
 */
export default function SourceLabel({ source = 'live', size = 'sm' }) {
  const config = {
    live: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      label: '📊 Live Data',
      tooltip: 'Real-time data from order queries (refreshes on page load)'
    },
    snapshot: {
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      text: 'text-purple-700',
      label: '📸 Latest Snapshot',
      tooltip: 'Scheduled digest snapshot (updated every 5-10 min)'
    },
    derived: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      label: '🔀 Derived',
      tooltip: 'Calculated from live data + snapshot'
    }
  };

  const cfg = config[source] || config.live;
  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  return (
    <span
      className={`inline-block ${sizeClass} rounded border ${cfg.bg} ${cfg.border} ${cfg.text} font-medium whitespace-nowrap`}
      title={cfg.tooltip}
    >
      {cfg.label}
    </span>
  );
}