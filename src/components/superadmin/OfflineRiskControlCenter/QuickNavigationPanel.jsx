import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, BarChart3, Users, TrendingUp, Clock, 
  List, Settings, Link as LinkIcon 
} from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function QuickNavigationPanel() {
  const links = [
    { label: 'Digest History', icon: List, page: 'SuperAdmin', tab: 'risk-digest' },
    { label: 'Portfolio Ranking', icon: BarChart3, page: 'SuperAdmin', tab: 'offline-reviews' },
    { label: 'Flagged Orders', icon: AlertTriangle, page: 'SuperAdmin', tab: 'orders' },
    { label: 'Manager Analytics', icon: Users, page: 'SuperAdmin', tab: 'manager-analytics' },
    { label: 'Operator Analytics', icon: TrendingUp, page: 'SuperAdmin', tab: 'operator-analytics' },
    { label: 'Temporal Analytics', icon: Clock, page: 'SuperAdmin', tab: 'temporal-analytics' },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Quick Links</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {links.map(link => (
            <Button
              key={link.label}
              variant="outline"
              size="sm"
              className="h-8 text-xs justify-start"
              onClick={() => {
                const url = createPageUrl(link.page);
                window.location.href = `${url}#${link.tab}`;
              }}
            >
              <link.icon className="h-3 w-3 mr-1 flex-shrink-0" />
              <span className="truncate">{link.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}