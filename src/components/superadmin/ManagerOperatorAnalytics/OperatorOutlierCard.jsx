/**
 * Operator Outlier Card — With Source Label
 * 
 * Displays individual operator anomalies.
 * Source: "derived" (calculated from orders)
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SourceLabel from '../OfflineRiskControlCenter/SourceLabel';
import { TrendingUp } from 'lucide-react';

export default function OperatorOutlierCard({ operator }) {
  if (!operator) return null;

  return (
    <Card className="border border-yellow-200 bg-yellow-50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-yellow-700" />
            {operator.name}
          </CardTitle>
          <SourceLabel source="derived" size="sm" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {operator.flagged_rate && (
          <div className="flex justify-between">
            <span className="text-gray-700">Flagged Rate:</span>
            <Badge className="bg-yellow-100 text-yellow-900">{operator.flagged_rate}%</Badge>
          </div>
        )}
        {operator.escalation_rate && (
          <div className="flex justify-between">
            <span className="text-gray-700">Escalation:</span>
            <Badge className="bg-yellow-100 text-yellow-900">{operator.escalation_rate}%</Badge>
          </div>
        )}
        {operator.total_orders && (
          <p className="text-gray-600">Orders: {operator.total_orders}</p>
        )}
      </CardContent>
    </Card>
  );
}