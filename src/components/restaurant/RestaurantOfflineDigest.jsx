/**
 * Restaurant-Level Offline Risk Digest
 * 
 * Manager/admin view of critical issues at their restaurant.
 */

import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Copy } from 'lucide-react';
import { generateRestaurantDigest, formatDigestAsPlaintext } from '@/lib/offline-digest-logic';

export default function RestaurantOfflineDigest({ restaurantId }) {
    const [copiedToClipboard, setCopiedToClipboard] = React.useState(false);

    const { data: orders = [] } = useQuery({
        queryKey: ['restaurant-orders', restaurantId],
        queryFn: () => base44.entities.Order.list('-offline_synced_at', 500)
    });

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const res = await base44.entities.Restaurant.filter({ id: restaurantId });
            return res?.[0];
        }
    });

    const digest = useMemo(() => {
        return generateRestaurantDigest(restaurantId, orders, restaurant || {}, {});
    }, [restaurantId, orders, restaurant]);

    const handleCopyToClipboard = () => {
        const plaintext = formatDigestAsPlaintext(digest);
        navigator.clipboard.writeText(plaintext);
        setCopiedToClipboard(true);
        setTimeout(() => setCopiedToClipboard(false), 2000);
    };

    const hasCritical = 
        (digest.critical_now?.overdue_flagged?.count || 0) > 0 ||
        (digest.critical_now?.operator_outliers?.count || 0) > 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Store Risk Digest</h3>
                    <p className="text-xs text-gray-500 mt-1">Critical issues at {restaurant?.name || 'your restaurant'}</p>
                </div>
                <Button
                    onClick={handleCopyToClipboard}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                >
                    <Copy className="h-3 w-3 mr-1" />
                    {copiedToClipboard ? 'Copied!' : 'Copy'}
                </Button>
            </div>

            {hasCritical && (
                <Card className="border border-red-200 bg-red-50">
                    <CardContent className="p-4">
                        <div className="flex gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                            <p className="text-sm text-red-900 font-semibold">Issues Need Review</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Overdue Section */}
            {digest.critical_now?.overdue_flagged?.count > 0 && (
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-red-900">
                            🚨 Overdue Flagged Orders ({digest.critical_now.overdue_flagged.count})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-xs text-gray-600">
                            Oldest: <span className="font-semibold">{digest.critical_now.overdue_flagged.oldest_minutes} minutes</span>
                        </p>
                        {digest.critical_now.overdue_flagged.orders.map(o => (
                            <div key={o.order_id} className="p-2 bg-gray-50 rounded text-xs">
                                <div className="flex justify-between">
                                    <span className="font-mono font-semibold">{o.order_id}</span>
                                    <span className="text-gray-500">{o.age_minutes}m ago</span>
                                </div>
                                {o.issue && <p className="text-gray-600 mt-1">{o.issue}</p>}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Operator Outliers */}
            {digest.critical_now?.operator_outliers?.count > 0 && (
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">⚠️ Operator Watch ({digest.critical_now.operator_outliers.count})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {digest.critical_now.operator_outliers.list.map((op, idx) => (
                            <div key={idx} className="p-2 bg-yellow-50 rounded border border-yellow-100">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs font-semibold text-gray-900">{op.name}</p>
                                        <p className="text-xs text-gray-600">{op.flagged_count} flagged orders</p>
                                    </div>
                                    <Badge className="text-xs bg-yellow-100 text-yellow-800">{op.flagged_rate}%</Badge>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Next Actions */}
            {digest.next_actions?.top_reason_code && (
                <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">📋 Next Action</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-900">{digest.next_actions.top_reason_code.action}</p>
                        <p className="text-xs text-gray-500 mt-2">
                            Most common issue: <span className="font-mono font-semibold">{digest.next_actions.top_reason_code.code}</span>
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Summary */}
            {digest.summary_metrics && (
                <Card className="border-0 shadow-sm bg-blue-50">
                    <CardContent className="p-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs text-gray-600">Offline (24h)</p>
                                <p className="text-lg font-bold text-gray-900">{digest.summary_metrics.total_offline}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Flagged (24h)</p>
                                <p className="text-lg font-bold text-orange-600">
                                    {digest.summary_metrics.flagged_24h}
                                    <span className="ml-1 text-sm">({digest.summary_metrics.flagged_rate_24h}%)</span>
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Escalated (24h)</p>
                                <p className="text-lg font-bold text-red-600">{digest.summary_metrics.escalated_24h}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-600">Avg Flagged Rate</p>
                                <p className="text-lg font-bold text-gray-900">{digest.next_actions.avg_flagged_rate}%</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}