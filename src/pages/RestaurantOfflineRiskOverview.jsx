/**
 * Restaurant-Scoped Offline Risk Overview
 * 
 * Local control center for restaurant admins/managers.
 * Shows only restaurant-relevant signals; no portfolio ranking.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import LocalCriticalAlert from '@/components/restaurant/OfflineRiskControlCenter/LocalCriticalAlert';
import UnresolvedBacklogCard from '@/components/superadmin/OfflineRiskControlCenter/UnresolvedBacklogCard';
import LocalOperatorOutliersCard from '@/components/restaurant/OfflineRiskControlCenter/LocalOperatorOutliersCard';
import LocalEscalationTrendCard from '@/components/restaurant/OfflineRiskControlCenter/LocalEscalationTrendCard';
import LatestSnapshotCard from '@/components/superadmin/OfflineRiskControlCenter/LatestSnapshotCard';
import LocalQuickNavigationPanel from '@/components/restaurant/OfflineRiskControlCenter/LocalQuickNavigationPanel';
import FreshnessIndicator from '@/components/superadmin/OfflineRiskControlCenter/FreshnessIndicator';
import { generateRestaurantDigest } from '@/lib/offline-digest-logic';
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from 'lucide-react';

export default function RestaurantOfflineRiskOverview() {
  const [searchParams] = useSearchParams();
  const restaurantId = searchParams.get('restaurant_id');
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auth check + scoping
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      try {
        const userData = await base44.auth.me();
        return userData;
      } catch {
        return null;
      }
    }
  });

  const { data: manager, isLoading: managerLoading } = useQuery({
    queryKey: ['restaurant-manager', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const managers = await base44.entities.RestaurantManager.filter({
        user_email: user.email
      });
      return managers?.[0] || null;
    },
    enabled: !!user?.email
  });

  // Determine scoped restaurant_id
  const scopedRestaurantId = restaurantId || (manager?.restaurant_ids?.[0]);

  const { data: restaurant, refetch: refetchRestaurant } = useQuery({
    queryKey: ['restaurant', scopedRestaurantId],
    queryFn: async () => {
      if (!scopedRestaurantId) return null;
      const res = await base44.entities.Restaurant.filter({ id: scopedRestaurantId });
      return res?.[0];
    },
    enabled: !!scopedRestaurantId
  });

  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ['restaurant-offline-orders', scopedRestaurantId],
    queryFn: async () => {
      if (!scopedRestaurantId) return [];
      return await base44.entities.Order.filter({
        restaurant_id: scopedRestaurantId,
        offline_created: true
      });
    },
    enabled: !!scopedRestaurantId
  });

  const { data: snapshots = [], refetch: refetchSnapshots } = useQuery({
    queryKey: ['restaurant-digest-snapshots', scopedRestaurantId],
    queryFn: async () => {
      if (!scopedRestaurantId) return [];
      const snaps = await base44.entities.DigestSnapshot.filter(
        { scope: 'restaurant', scope_id: scopedRestaurantId },
        '-timestamp',
        1
      );
      return snaps || [];
    },
    enabled: !!scopedRestaurantId
  });

  const digest = useMemo(() => {
    if (!scopedRestaurantId || !orders.length) return null;
    return generateRestaurantDigest(scopedRestaurantId, orders, restaurant || {}, {});
  }, [scopedRestaurantId, orders, restaurant]);

  const latestSnapshot = snapshots[0] || null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchRestaurant(), refetchOrders(), refetchSnapshots()]);
      setLastRefreshedAt(new Date());
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const interval = setInterval(() => {
      handleRefresh();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshEnabled]);

  // Loading state
  if (userLoading || managerLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Access check: must be manager/admin of restaurant
  if (!scopedRestaurantId || !manager?.restaurant_ids?.includes(scopedRestaurantId)) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="border border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-red-900">Access Denied</p>
                <p className="text-xs text-red-800 mt-1">You don't have access to this restaurant's offline risk data.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Offline Risk Overview</h1>
          <p className="text-sm text-gray-600 mt-1">{restaurant?.name} · Local issues & trends</p>
        </div>

        {/* Freshness Indicator */}
        <div className="mb-6">
          <FreshnessIndicator
            lastRefreshedAt={lastRefreshedAt}
            latestSnapshotTime={latestSnapshot?.timestamp}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            autoRefreshEnabled={autoRefreshEnabled}
            onAutoRefreshToggle={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
          />
        </div>

        {/* Priority Stack: Critical → Backlog → Operators → Trends → Snapshot → Nav */}
        <div className="space-y-4">
          {/* 1. Local Critical Alert */}
          {digest && <LocalCriticalAlert digest={digest} />}

          {/* 2. Unresolved Backlog (reused, scoped) */}
          {orders.length > 0 && <UnresolvedBacklogCard orders={orders.filter(o => o.restaurant_id === scopedRestaurantId)} />}

          {/* 3. Local Operator Outliers */}
          {digest && <LocalOperatorOutliersCard digest={digest} />}

          {/* 4. Local Escalation Trend */}
          {digest && <LocalEscalationTrendCard digest={digest} />}

          {/* 5. Latest Local Snapshot */}
          {latestSnapshot && <LatestSnapshotCard latestSnapshot={latestSnapshot} />}

          {/* 6. Quick Navigation (local links) */}
          <LocalQuickNavigationPanel restaurantId={scopedRestaurantId} />
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-xs text-gray-500 text-center p-3 bg-white rounded border border-gray-200">
          <p>This is your local overview. Use quick links above to dive deeper into flagged orders, analytics, and trends.</p>
        </div>
      </div>
    </div>
  );
}