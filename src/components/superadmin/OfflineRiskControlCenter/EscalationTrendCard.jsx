import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function EscalationTrendCard({ digest }) {
  const trend = digest?.watch_worsening;

  if (!trend?.escalation_rate_up) return null;

  const delta = trend.escalation_24h - trend.escalation_7d;
  const isWorsening = delta > 0;

  return (
    <Card className={`border-0 shadow-sm ${isWorsening ? 'bg-yellow-50 border border-yellow-200' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {isWorsening ? (
            <TrendingUp className="h-4 w-4 text-red-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-green-600" />
          )}
          Escalation Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xs space-y-1">
          <p className="text-gray-900">
            <strong>24h:</strong> {trend.escalation_24h}% 
            <Badge className={`ml-2 text-xs ${isWorsening ? 'bg-red-100 text-red-900' : 'bg-green-100 text-green-900'}`}>
              {isWorsening ? '+' : ''}{delta}pts
            </Badge>
          </p>
          <p className="text-gray-600">7-day avg: {trend.escalation_7d}%</p>
        </div>
      </CardContent>
    </Card>
  );
}