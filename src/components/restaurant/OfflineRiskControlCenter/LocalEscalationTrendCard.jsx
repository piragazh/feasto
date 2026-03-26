/**
 * Local Escalation Trend (Restaurant-Scoped)
 * 
 * Shows escalation trend for THIS restaurant only.
 * Calculated from local orders; no portfolio comparison.
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from 'lucide-react';
import SourceLabel from '@/components/superadmin/OfflineRiskControlCenter/SourceLabel';

export default function LocalEscalationTrendCard({ digest }) {
  if (!digest?.watch_worsening) return null;

  const { escalation_24h, escalation_7d, delta_points } = digest.watch_worsening;

  if (!escalation_24h && !escalation_7d) return null;

  const isWorsening = delta_points > 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {isWorsening ? (
              <TrendingUp className="h-4 w-4 text-orange-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-green-500" />
            )}
            Escalation Trend
          </CardTitle>
          <SourceLabel source="derived" size="sm" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 bg-gray-50 rounded">
              <p className="text-xs text-gray-600">24h Escalation</p>
              <p className="text-lg font-bold text-gray-900">{escalation_24h}%</p>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <p className="text-xs text-gray-600">7d Escalation</p>
              <p className="text-lg font-bold text-gray-900">{escalation_7d}%</p>
            </div>
          </div>
          {isWorsening && (
            <div className="p-2 bg-orange-50 rounded border border-orange-200">
              <p className="text-xs text-orange-800">
                <span className="font-semibold">Worsening:</span> +{delta_points} pts
              </p>
            </div>
          )}
          {!isWorsening && delta_points !== 0 && (
            <div className="p-2 bg-green-50 rounded border border-green-200">
              <p className="text-xs text-green-800">
                <span className="font-semibold">Improving:</span> {delta_points} pts
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}