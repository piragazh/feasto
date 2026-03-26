import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from 'lucide-react';
import SourceLabel from './SourceLabel';

export default function UnresolvedBacklogCard({ orders }) {
  const backlog = useMemo(() => {
    if (!orders.length) return [];

    return orders
      .filter(o => o.offline_created && o.needs_review && (!o.offline_review_status || o.offline_review_status === 'new'))
      .sort((a, b) => new Date(a.offline_synced_at) - new Date(b.offline_synced_at))
      .slice(0, 4);
  }, [orders]);

  if (backlog.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Unresolved Backlog
          </CardTitle>
          <SourceLabel source="live" size="sm" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {backlog.map(order => {
            const ageHours = Math.floor((new Date() - new Date(order.offline_synced_at)) / (1000 * 60 * 60));
            return (
              <div key={order.id} className="text-xs p-2 bg-orange-50 rounded border border-orange-200">
                <p className="font-mono text-orange-700">{order.id}</p>
                <p className="text-orange-600 text-xs mt-0.5">{order.restaurant_name} · {ageHours}h ago</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}