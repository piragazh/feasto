import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from 'lucide-react';

export default function OperatorOutliersCard({ digest }) {
  const outliers = digest?.watch_worsening?.operator_outliers || [];

  if (outliers.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" /> Top Operator Outliers
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {outliers.slice(0, 3).map(op => (
            <div key={op.operator_email} className="flex items-center justify-between p-2 bg-yellow-50 rounded text-xs">
              <div className="min-w-0">
                <p className="font-mono text-gray-900 truncate">{op.operator_email}</p>
              </div>
              <Badge variant="outline" className="text-xs flex-shrink-0 ml-2">
                {op.flagged_rate}% flagged
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}