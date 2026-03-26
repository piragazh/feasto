import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import CriticalAlert from '@/components/superadmin/OfflineRiskControlCenter/CriticalAlert';
import TopRiskStoresCard from '@/components/superadmin/OfflineRiskControlCenter/TopRiskStoresCard';
import UnresolvedBacklogCard from '@/components/superadmin/OfflineRiskControlCenter/UnresolvedBacklogCard';
import OperatorOutliersCard from '@/components/superadmin/OfflineRiskControlCenter/OperatorOutliersCard';
import EscalationTrendCard from '@/components/superadmin/OfflineRiskControlCenter/EscalationTrendCard';
import LatestSnapshotCard from '@/components/superadmin/OfflineRiskControlCenter/LatestSnapshotCard';
import QuickNavigationPanel from '@/components/superadmin/OfflineRiskControlCenter/QuickNavigationPanel';
import FreshnessIndicator from '@/components/superadmin/OfflineRiskControlCenter/FreshnessIndicator';
import { generatePortfolioDigest } from '@/lib/offline-digest-logic';

export default function OfflineRiskControlCenter() {
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: restaurants = [], refetch: refetchRestaurants } = useQuery({
    queryKey: ['all-restaurants'],
    queryFn: () => base44.entities.Restaurant.list()
  });

  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ['all-orders'],
    queryFn: () => base44.entities.Order.list('-offline_synced_at', 1000)
  });

  const { data: snapshots = [], refetch: refetchSnapshots } = useQuery({
    queryKey: ['digest-snapshots'],
    queryFn: async () => {
      const snaps = await base44.entities.DigestSnapshot.filter(
        { scope: 'portfolio' },
        '-timestamp',
        1
      );
      return snaps || [];
    }
  });

  const digest = useMemo(() => {
    if (!restaurants.length || !orders.length) return null;
    
    const portfolioAnalytics = {
      rankedRestaurants: restaurants.map(r => {
        const rOrders = orders.filter(o => o.restaurant_id === r.id && o.offline_created);
        const flagged = rOrders.filter(o => o.needs_review).length;
        const escalated = rOrders.filter(o => o.offline_review_status === 'escalated').length;
        
        const flaggedRate = rOrders.length > 0 ? Math.round((flagged / rOrders.length) * 100) : 0;
        const escalationRate = flagged > 0 ? Math.round((escalated / flagged) * 100) : 0;
        
        return {
          restaurant_id: r.id,
          flagged_rate: flaggedRate,
          escalation_rate: escalationRate,
          flagged_count: flagged,
          escalated_count: escalated,
          total_orders: rOrders.length,
          risk_score: Math.round(flaggedRate * 0.6 + escalationRate * 0.4)
        };
      })
    };

    const operatorAnalytics = {
      outliers: Object.entries(
        orders
          .filter(o => o.offline_created && o.offline_created_by)
          .reduce((acc, o) => {
            if (!acc[o.offline_created_by]) {
              acc[o.offline_created_by] = { total: 0, flagged: 0 };
            }
            acc[o.offline_created_by].total++;
            if (o.needs_review) acc[o.offline_created_by].flagged++;
            return acc;
          }, {})
      )
        .filter(([, stats]) => stats.total >= 5)
        .map(([email, stats]) => {
          const rate = stats.flagged / stats.total;
          return {
            operator_email: email,
            flagged_rate: Math.round(rate * 100),
            total: stats.total
          };
        })
        .sort((a, b) => b.flagged_rate - a.flagged_rate)
    };

    return generatePortfolioDigest(orders, restaurants, portfolioAnalytics, operatorAnalytics);
  }, [restaurants, orders]);

  const latestSnapshot = snapshots[0] || null;

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchRestaurants(), refetchOrders(), refetchSnapshots()]);
      setLastRefreshedAt(new Date());
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh effect (every 5 minutes if enabled)
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const interval = setInterval(() => {
      handleRefresh();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [autoRefreshEnabled]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Offline Risk Control Center</h1>
          <p className="text-sm text-gray-600 mt-1">Critical operational overview. Drill down for details.</p>
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

        {/* Priority Stack: Critical → Stores → Backlog → People → Trends → Context → Nav */}
        <div className="space-y-4">
          {/* 1. Critical Alert (if any) */}
          {digest && <CriticalAlert digest={digest} />}

          {/* 2. Top Risk Stores */}
          {restaurants.length > 0 && orders.length > 0 && (
            <TopRiskStoresCard restaurants={restaurants} orders={orders} />
          )}

          {/* 3. Unresolved Backlog */}
          {orders.length > 0 && <UnresolvedBacklogCard orders={orders} />}

          {/* 4. Operator Outliers */}
          {digest && <OperatorOutliersCard digest={digest} />}

          {/* 5. Escalation Trend */}
          {digest && <EscalationTrendCard digest={digest} />}

          {/* 6. Latest Snapshot */}
          {latestSnapshot && <LatestSnapshotCard latestSnapshot={latestSnapshot} />}

          {/* 7. Quick Navigation */}
          <QuickNavigationPanel />
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-xs text-gray-500 text-center p-3 bg-white rounded border border-gray-200">
          <p>This is an overview layer. Use quick links above to drill down for detailed analysis, trends, and actions.</p>
        </div>
      </div>
    </div>
  );
}