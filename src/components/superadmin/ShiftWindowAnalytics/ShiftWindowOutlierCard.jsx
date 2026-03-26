/**
 * Shift Window Outlier Card — With Source Label
 * 
 * Displays detected outliers in shift windows.
 * Source: "proxy" (estimated window model)
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SourceLabel from '../OfflineRiskControlCenter/SourceLabel';
import { AlertTriangle } from 'lucide-react';

export default function ShiftWindowOutlierCard({ outlier, label }) {
  if (!outlier) return null;

  return (
    <Card className="border border-orange-200 bg-orange-50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            {label}
          </CardTitle>
          <SourceLabel source="proxy" size="sm" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {outlier.message && (
          <p className="text-xs text-orange-900">{outlier.message}</p>
        )}
        {outlier.flagged_rate && (
          <Badge className="bg-orange-100 text-orange-800 text-xs">
            {outlier.flagged_rate}% flagged
          </Badge>
        )}
        {outlier.escalation_rate && (
          <Badge className="bg-orange-100 text-orange-800 text-xs">
            {outlier.escalation_rate}% escalation
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}