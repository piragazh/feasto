/**
 * Local Operator Outliers (Restaurant-Scoped)
 * 
 * Shows operators in THIS restaurant with high flagged rates.
 * No portfolio cross-operator comparison.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SourceLabel from '@/components/superadmin/OfflineRiskControlCenter/SourceLabel';

export default function LocalOperatorOutliersCard({ digest }) {
  if (!digest?.critical_now?.operator_outliers) return null;

  const outliers = digest.critical_now.operator_outliers.list || [];

  if (outliers.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">⚠️ Operator Watch ({outliers.length})</CardTitle>
          <SourceLabel source="derived" size="sm" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {outliers.slice(0, 3).map((op, idx) => (
          <div key={idx} className="p-3 bg-yellow-50 rounded border border-yellow-200">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-gray-900">{op.name}</p>
                <p className="text-xs text-gray-600 mt-0.5">{op.flagged_count} flagged orders</p>
              </div>
              <Badge className="bg-yellow-100 text-yellow-800 text-xs flex-shrink-0">{op.flagged_rate}%</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}