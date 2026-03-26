import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History, CheckCircle } from 'lucide-react';
import SourceLabel from './SourceLabel';

export default function LatestSnapshotCard({ latestSnapshot }) {
  if (!latestSnapshot) return null;

  const timestamp = new Date(latestSnapshot.timestamp);
  const hoursAgo = Math.floor((new Date() - timestamp) / (1000 * 60 * 60));

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4" /> Latest Digest Snapshot
          </CardTitle>
          <SourceLabel source="snapshot" size="sm" />
        </div>
      </CardHeader>
      <CardContent className="text-xs space-y-1">
        <p className="text-gray-900">
          {hoursAgo === 0 ? 'Just now' : `${hoursAgo}h ago`}
        </p>
        <p className="text-gray-600 font-mono">{latestSnapshot.snapshot_id}</p>
        <div className="flex gap-2 mt-2">
          <span className="flex items-center gap-1">
            <span className="text-red-600 font-bold">{latestSnapshot.critical_item_count}</span>
            <span className="text-gray-600">critical</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-yellow-600 font-bold">{latestSnapshot.worsening_item_count}</span>
            <span className="text-gray-600">worsening</span>
          </span>
          {latestSnapshot.acknowledged && (
            <span className="flex items-center gap-1 ml-auto text-green-600">
              <CheckCircle className="h-3 w-3" /> Acknowledged
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}