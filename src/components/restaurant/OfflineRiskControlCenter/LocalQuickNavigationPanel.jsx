/**
 * Local Quick Navigation Panel (Restaurant-Scoped)
 * 
 * Links to local actions and analytics.
 * No portfolio-level navigation.
 */

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, BarChart3, Clock, Eye } from 'lucide-react';

export default function LocalQuickNavigationPanel({ restaurantId }) {
  const actions = [
    {
      label: 'Review Flagged Orders',
      icon: CheckCircle,
      action: () => window.location.href = `/${restaurantId}/offline-review-queue`,
      desc: 'Manage pending reviews'
    },
    {
      label: 'Local Analytics',
      icon: BarChart3,
      action: () => window.location.href = `/${restaurantId}/offline-analytics`,
      desc: 'Trends & patterns'
    },
    {
      label: 'Temporal Analysis',
      icon: Clock,
      action: () => window.location.href = `/${restaurantId}/offline-temporal`,
      desc: 'Shift-window insights'
    },
    {
      label: 'Digest History',
      icon: Eye,
      action: () => window.location.href = `/${restaurantId}/digest-snapshots`,
      desc: 'Past snapshots'
    }
  ];

  return (
    <Card className="border-0 shadow-sm bg-blue-50">
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-gray-700 mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {actions.map((action, idx) => {
            const IconComponent = action.icon;
            return (
              <Button
                key={idx}
                variant="outline"
                className="h-auto flex-col gap-1 py-2 text-xs"
                onClick={action.action}
              >
                <IconComponent className="h-4 w-4" />
                <span className="font-medium">{action.label}</span>
                <span className="text-[10px] text-gray-600">{action.desc}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}