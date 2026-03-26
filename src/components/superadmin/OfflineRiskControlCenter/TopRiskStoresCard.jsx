import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, TrendingUp } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function TopRiskStoresCard({ restaurants, orders }) {
  const topRisks = useMemo(() => {
    if (!restaurants.length || !orders.length) return [];

    const riskMap = restaurants.map(r => {
      const rOrders = orders.filter(o => o.restaurant_id === r.id && o.offline_created);
      const flagged = rOrders.filter(o => o.needs_review).length;
      const escalated = rOrders.filter(o => o.offline_review_status === 'escalated').length;
      
      const flaggedRate = rOrders.length > 0 ? Math.round((flagged / rOrders.length) * 100) : 0;
      const escalationRate = flagged > 0 ? Math.round((escalated / flagged) * 100) : 0;
      const risk = Math.round(flaggedRate * 0.6 + escalationRate * 0.4);

      return {
        id: r.id,
        name: r.name,
        flaggedRate,
        escalationRate,
        risk,
        total: rOrders.length
      };
    }).filter(r => r.total > 0);

    return riskMap.sort((a, b) => b.risk - a.risk).slice(0, 5);
  }, [restaurants, orders]);

  if (topRisks.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Top 5 Risk Stores
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {topRisks.map((store, idx) => (
            <div key={store.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">#{idx + 1} {store.name}</p>
                <p className="text-gray-500 text-xs">{store.flaggedRate}% flagged · {store.escalationRate}% escalated</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <Badge variant="outline" className="text-xs">Risk {store.risk}</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => window.location.href = `${createPageUrl('RestaurantDashboard')}?restaurant_id=${store.id}`}
                >
                  <Eye className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}