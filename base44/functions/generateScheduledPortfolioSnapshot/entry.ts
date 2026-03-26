/**
 * Generate Scheduled Portfolio Digest Snapshot
 * 
 * Runs on a daily schedule (9:00 UTC) to create reliable portfolio digest snapshots.
 * Deduplicates on hash to avoid noise if digest unchanged.
 * 
 * Triggered by: Base44 scheduled automation
 * Schedule: Daily 09:00 UTC
 * Created by: 'system' (no user auth)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function hashDigest(digest) {
  const json = JSON.stringify({
    critical_now: digest.critical_now,
    watch_worsening: digest.watch_worsening,
    summary_metrics: digest.summary_metrics
  });
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function countCriticalItems(digest) {
  let count = 0;
  if (digest.critical_now?.overdue_flagged?.count > 0) count += digest.critical_now.overdue_flagged.count;
  if (digest.critical_now?.top_restaurants?.length > 0) count += 1;
  if (digest.critical_now?.abuse_escalations?.count > 0) count += 1;
  return count;
}

function countWorseningItems(digest) {
  let count = 0;
  if (digest.watch_worsening?.escalation_rate_up) count += 1;
  if (digest.watch_worsening?.operator_outliers?.length > 0) count += 1;
  return count;
}

function generateSnapshotId() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `snap-${dateStr}-${seq}`;
}

function formatDigestAsPlaintext(digest) {
  const lines = [];
  lines.push(`=== OFFLINE RISK DIGEST ===`);
  lines.push(`Generated: ${new Date(digest.generated_at).toLocaleString()}`);
  lines.push('');
  
  if (digest.critical_now) {
    lines.push(`🚨 CRITICAL NOW`);
    if (digest.critical_now.overdue_flagged?.count > 0) {
      lines.push(`  Overdue Flagged: ${digest.critical_now.overdue_flagged.count} orders (oldest: ${digest.critical_now.overdue_flagged.oldest_minutes}m)`);
      digest.critical_now.overdue_flagged.orders.slice(0, 3).forEach(o => {
        lines.push(`    - ${o.order_id}: ${o.age_minutes}m old`);
      });
    }
    if (digest.critical_now.top_restaurants?.length > 0) {
      lines.push(`  Top Risk Restaurants:`);
      digest.critical_now.top_restaurants.slice(0, 3).forEach(r => {
        lines.push(`    - ${r.restaurant_name}: Risk ${r.risk_score}, ${r.flagged_rate}% flagged`);
      });
    }
    if (digest.critical_now.abuse_escalations?.count > 0) {
      lines.push(`  Abuse Escalations: ${digest.critical_now.abuse_escalations.count}`);
    }
    lines.push('');
  }
  
  if (digest.watch_worsening) {
    lines.push(`⚠️ WATCH (WORSENING)`);
    if (digest.watch_worsening.escalation_rate_up) {
      lines.push(`  Escalation Rate: ${digest.watch_worsening.escalation_24h}% (24h) vs ${digest.watch_worsening.escalation_7d}% (7d) — UP ${digest.watch_worsening.delta_points}pts`);
    }
    if (digest.watch_worsening.operator_outliers?.length > 0) {
      lines.push(`  Operator Outliers:`);
      digest.watch_worsening.operator_outliers.slice(0, 2).forEach(o => {
        lines.push(`    - ${o.operator_email}: ${o.flagged_rate}% (avg ${o.vs_average}%)`);
      });
    }
    lines.push('');
  }
  
  if (digest.summary_metrics) {
    lines.push(`📊 SUMMARY`);
    lines.push(`  Total Offline: ${digest.summary_metrics.total_offline}`);
    lines.push(`  Flagged: ${digest.summary_metrics.total_flagged} (${digest.summary_metrics.flagged_rate}%)`);
    lines.push(`  Escalated: ${digest.summary_metrics.total_escalated} (${digest.summary_metrics.escalation_rate}%)`);
  }
  
  return lines.join('\n');
}

function generatePortfolioDigest(orders = [], restaurants = [], portfolioAnalytics = {}, operatorAnalytics = {}) {
  const now = new Date();
  const day24h = 24 * 60 * 60 * 1000;
  const day7d = 7 * day24h;

  const overdueOrders = orders
    .filter(o => o.offline_created && o.needs_review && o.offline_review_status === 'new')
    .map(o => {
      const syncedAt = new Date(o.offline_synced_at);
      const ageMinutes = Math.round((now - syncedAt) / (1000 * 60));
      return { ...o, ageMinutes };
    })
    .filter(o => o.ageMinutes > 240)
    .sort((a, b) => b.ageMinutes - a.ageMinutes)
    .slice(0, 10);

  const criticalRestaurants = (portfolioAnalytics.rankedRestaurants || [])
    .slice(0, 5)
    .map(r => {
      const restaurant = restaurants.find(res => res.id === r.restaurant_id);
      return {
        restaurant_id: r.restaurant_id,
        restaurant_name: restaurant?.name || 'Unknown',
        risk_score: r.risk_score,
        flagged_rate: r.flagged_rate,
        escalation_rate: r.escalation_rate,
        flagged_count: r.flagged_count,
        escalated_count: r.escalated_count
      };
    });

  const last24h = orders.filter(o => new Date(o.offline_synced_at) > new Date(now - day24h) && o.offline_created);
  const last7d = orders.filter(o => new Date(o.offline_synced_at) > new Date(now - day7d) && o.offline_created);

  const escalation24h = last24h.length > 0
    ? Math.round((last24h.filter(o => o.offline_review_status === 'escalated').length / last24h.length) * 100)
    : 0;
  const escalation7d = last7d.length > 5
    ? Math.round((last7d.filter(o => o.offline_review_status === 'escalated').length / last7d.length) * 100)
    : 0;

  const worsening = {
    escalation_up: escalation24h > escalation7d + 10,
    escalation_24h: escalation24h,
    escalation_7d: escalation7d,
    delta: escalation24h - escalation7d
  };

  const abuseEscalations = orders
    .filter(o => o.offline_review_status === 'escalated' && o.offline_review_reason_code && 
            ['potential_abuse', 'large_price_mismatch', 'repeated_offline_issues'].includes(o.offline_review_reason_code))
    .slice(-10);

  const operatorOutliers = (operatorAnalytics.outliers || [])
    .filter(o => o.type === 'high_flagged')
    .slice(0, 3);

  const totalOffline = orders.filter(o => o.offline_created).length;
  const totalFlagged = orders.filter(o => o.offline_created && o.needs_review).length;
  const totalEscalated = orders.filter(o => o.offline_created && o.offline_review_status === 'escalated').length;
  const totalOverdue = overdueOrders.length;

  const flaggedRate = totalOffline > 0 ? Math.round((totalFlagged / totalOffline) * 100) : 0;
  const escalationRate = totalFlagged > 0 ? Math.round((totalEscalated / totalFlagged) * 100) : 0;

  return {
    generated_at: now.toISOString(),
    period: '24h',
    critical_now: {
      overdue_flagged: {
        count: totalOverdue,
        oldest_minutes: overdueOrders.length > 0 ? overdueOrders[0].ageMinutes : 0,
        orders: overdueOrders.map(o => ({
          order_id: o.id,
          restaurant_name: restaurants.find(r => r.id === o.restaurant_id)?.name,
          age_minutes: o.ageMinutes,
          sync_validation_notes: o.sync_validation_notes
        }))
      },
      top_restaurants: criticalRestaurants,
      abuse_escalations: {
        count: abuseEscalations.length,
        recent: abuseEscalations.map(o => ({
          order_id: o.id,
          restaurant_name: restaurants.find(r => r.id === o.restaurant_id)?.name,
          reason_code: o.offline_review_reason_code,
          reviewed_at: o.offline_review_at
        }))
      }
    },
    watch_worsening: {
      escalation_rate_up: worsening.escalation_up,
      escalation_24h: worsening.escalation_24h,
      escalation_7d: worsening.escalation_7d,
      delta_points: worsening.delta,
      flagged_rate_24h: Math.round((last24h.filter(o => o.needs_review).length / Math.max(last24h.length, 1)) * 100),
      operator_outliers: operatorOutliers.map(o => ({
        operator_email: o.operator_email,
        flagged_rate: o.flagged_rate,
        vs_average: o.vs_average
      }))
    },
    summary_metrics: {
      total_offline: totalOffline,
      total_flagged: totalFlagged,
      flagged_rate: flaggedRate,
      total_escalated: totalEscalated,
      escalation_rate: escalationRate,
      restaurants_with_issues: criticalRestaurants.length
    }
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    console.log('[Scheduled] generateScheduledPortfolioSnapshot triggered');

    // Fetch all orders and restaurants
    const orders = await base44.asServiceRole.entities.Order.list('-offline_synced_at', 1000);
    const restaurants = await base44.asServiceRole.entities.Restaurant.list();

    // Calculate portfolio analytics (simplified, mirrors OfflineReviewPortfolio logic)
    const restaurantRisks = restaurants.map(r => {
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
    });

    const portfolioAnalytics = {
      rankedRestaurants: restaurantRisks.sort((a, b) => b.risk_score - a.risk_score)
    };

    // Operator analytics
    const operatorStats = {};
    orders
      .filter(o => o.offline_created && o.offline_created_by)
      .forEach(o => {
        if (!operatorStats[o.offline_created_by]) {
          operatorStats[o.offline_created_by] = { total: 0, flagged: 0 };
        }
        operatorStats[o.offline_created_by].total++;
        if (o.needs_review) {
          operatorStats[o.offline_created_by].flagged++;
        }
      });

    const avgFlaggedRate = orders.filter(o => o.offline_created && o.needs_review).length / Math.max(orders.filter(o => o.offline_created).length, 1);

    const operatorOutliers = Object.entries(operatorStats)
      .filter(([, stats]) => stats.total >= 5)
      .map(([email, stats]) => {
        const rate = stats.flagged / stats.total;
        return {
          type: rate > avgFlaggedRate * 2 ? 'high_flagged' : 'normal',
          operator_email: email,
          flagged_rate: Math.round(rate * 100),
          vs_average: Math.round((rate - avgFlaggedRate) * 100)
        };
      })
      .filter(o => o.type === 'high_flagged');

    const operatorAnalytics = { outliers: operatorOutliers };

    // Generate digest
    const digest = generatePortfolioDigest(orders, restaurants, portfolioAnalytics, operatorAnalytics);
    const plaintext = formatDigestAsPlaintext(digest);

    // Get recent snapshots for dedup check
    const recentSnapshots = await base44.asServiceRole.entities.DigestSnapshot.filter({ scope: 'portfolio' });

    const digestHash = hashDigest(digest);

    // Check for duplicate
    if (recentSnapshots.length > 0) {
      const latest = recentSnapshots.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )[0];
      
      if (latest.digest_hash === digestHash) {
        console.log(`[Scheduled] Digest unchanged, skipping snapshot (hash: ${digestHash})`);
        return Response.json({
          success: true,
          scheduled: true,
          is_duplicate: true,
          message: 'Digest unchanged, no snapshot created',
          hash: digestHash
        });
      }
    }

    // Create snapshot
    const snapshot = {
      snapshot_id: generateSnapshotId(),
      timestamp: new Date().toISOString(),
      scope: 'portfolio',
      scope_id: null,
      digest_version: 1,
      digest_hash: digestHash,
      critical_item_count: countCriticalItems(digest),
      worsening_item_count: countWorseningItems(digest),
      plaintext_summary: plaintext,
      snapshot_data: digest,
      acknowledged: false,
      acknowledged_by: null,
      acknowledged_at: null,
      acknowledged_note: null,
      recurring_concern: false,
      action_taken: null,
      created_by: 'system'
    };

    const created = await base44.asServiceRole.entities.DigestSnapshot.create(snapshot);

    console.log(`[Scheduled] Portfolio snapshot created: ${created.id}`);

    return Response.json({
      success: true,
      scheduled: true,
      snapshot_id: created.id,
      critical_count: snapshot.critical_item_count,
      message: 'Scheduled portfolio snapshot created'
    });
  } catch (error) {
    console.error('[Scheduled] Error:', error);
    return Response.json({ error: error.message, scheduled: true }, { status: 500 });
  }
});