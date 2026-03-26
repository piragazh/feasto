/**
 * Local Critical Alert (Restaurant-Scoped)
 * 
 * Shows critical issues at THIS restaurant only.
 * No cross-store ranking or portfolio data.
 */

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Clock } from 'lucide-react';
import SourceLabel from '@/components/superadmin/OfflineRiskControlCenter/SourceLabel';

export default function LocalCriticalAlert({ digest }) {
  if (!digest?.critical_now) return null;

  const { overdue_flagged, operator_outliers } = digest.critical_now;
  const hasCritical = (overdue_flagged?.count || 0) > 0 || (operator_outliers?.count || 0) > 0;

  if (!hasCritical) return null;

  return (
    <Card className="border border-red-200 bg-red-50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <p className="font-semibold text-sm text-red-900">🚨 Critical Issues Now</p>
              <SourceLabel source="live" size="sm" />
            </div>
            <div className="text-xs text-red-800 mt-2 space-y-1">
              {overdue_flagged?.count > 0 && (
                <p>
                  <Clock className="h-3 w-3 inline mr-1" />
                  {overdue_flagged.count} overdue (oldest {overdue_flagged.oldest_minutes}m)
                </p>
              )}
              {operator_outliers?.count > 0 && (
                <p>⚠️ {operator_outliers.count} operator(s) need watch</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}