import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, TrendingUp, ChevronRight, Zap } from 'lucide-react';
import { detectAnomalies } from '@/lib/offline-review-anomaly-rules';
import { enrichAnomaliesWithScoring } from '@/lib/offline-review-severity-scoring';

/**
 * Offline Review Health Indicator
 * 
 * Displays:
 * - Summary metrics (flagged count, unresolved, escalated)
 * - Anomaly alerts (rule-based indicators)
 * - Reason code breakdown with severity highlights
 * - Overdue/escalation emphasis
 */
export default function OfflineReviewHealthIndicator({ orders = [] }) {
    const now = new Date();
    
    const getReviewAge = (isoStr) => {
        if (!isoStr) return 0;
        return (now.getTime() - new Date(isoStr).getTime()) / (1000 * 60 * 60);
    };

    // Categorize orders
    const flagged = orders.filter(o => o.needs_review && o.offline_created);
    const unreviewed = flagged.filter(o => !o.offline_review_status || o.offline_review_status === 'new');
    const reviewed = flagged.filter(o => o.offline_review_reason_code);
    const resolved = flagged.filter(o => o.offline_review_status === 'resolved');
    const escalated = flagged.filter(o => o.offline_review_status === 'escalated');
    const acknowledged = flagged.filter(o => o.offline_review_status === 'acknowledged');
    const overdue = unreviewed.filter(o => getReviewAge(o.offline_synced_at) > 4);
    const withNotes = flagged.filter(o => o.offline_review_notes && o.offline_review_notes.trim());

    // Reason code distribution
    const reasonCodeCounts = {};
    const abuseSuspiciousCodes = { potential_abuse: 0, large_price_mismatch: 0, repeated_offline_issues: 0 };
    reviewed.forEach(order => {
        const code = order.offline_review_reason_code;
        reasonCodeCounts[code] = (reasonCodeCounts[code] || 0) + 1;
        if (code in abuseSuspiciousCodes) abuseSuspiciousCodes[code]++;
    });

    // Manager load
    const reviewsByManager = {};
    flagged.forEach(order => {
        if (order.offline_review_by) {
            reviewsByManager[order.offline_review_by] = (reviewsByManager[order.offline_review_by] || 0) + 1;
        }
    });

    // Sync validation error distribution
    const syncErrorDistribution = {};
    flagged.forEach(order => {
        if (order.sync_validation_notes) {
            // Extract first error type from notes (simple heuristic)
            const noteUpper = order.sync_validation_notes.toUpperCase();
            if (noteUpper.includes('DISCOUNT')) syncErrorDistribution['discount'] = (syncErrorDistribution['discount'] || 0) + 1;
            else if (noteUpper.includes('COUPON')) syncErrorDistribution['coupon'] = (syncErrorDistribution['coupon'] || 0) + 1;
            else if (noteUpper.includes('PRICE')) syncErrorDistribution['price'] = (syncErrorDistribution['price'] || 0) + 1;
            else syncErrorDistribution['other'] = (syncErrorDistribution['other'] || 0) + 1;
        }
    });

    // Detect anomalies and enrich with severity scoring
    const anomalyData = useMemo(() => {
        const detected = detectAnomalies({
            totalOrders: orders.length,
            flaggedCount: flagged.length,
            unresolvedCount: unreviewed.length,
            reviewedCount: reviewed.length,
            escalatedCount: escalated.length,
            oldestUnresolvedHours: unreviewed.length > 0 ? Math.max(...unreviewed.map(o => getReviewAge(o.offline_synced_at))) : 0,
            reasonCodes: reasonCodeCounts,
            reviews: flagged,
            abuseSuspiciousCodes
        });
        return enrichAnomaliesWithScoring(detected);
    }, [orders]);

    const avgReviewAge = unreviewed.length > 0
        ? (unreviewed.reduce((s, o) => s + getReviewAge(o.offline_synced_at), 0) / unreviewed.length).toFixed(1)
        : 0;

    const notesRatio = flagged.length > 0 ? Math.round((withNotes.length / flagged.length) * 100) : 0;

    const topReasonCode = Object.entries(reasonCodeCounts).length > 0
        ? Object.entries(reasonCodeCounts).sort(([, a], [, b]) => b - a)[0]
        : null;

    return (
        <div className="space-y-4">
            {/* ─────────────────────────────────────────────────────────────────────── */}
            {/* SUMMARY METRICS */}
            {/* ─────────────────────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {/* Total Flagged */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-gray-600 font-medium">Flagged (7d)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <span className="text-2xl font-bold text-gray-900">{flagged.length}</span>
                    </CardContent>
                </Card>

                {/* Unresolved */}
                <Card className={unreviewed.length > 0 ? 'border-orange-200 bg-orange-50' : ''}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-gray-600 font-medium">Unresolved</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-bold text-orange-900">{unreviewed.length}</span>
                            {overdue.length > 0 && (
                                <Badge className="bg-red-100 text-red-700 text-xs">
                                    {overdue.length} overdue
                                </Badge>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Escalated */}
                <Card className={escalated.length > 0 ? 'border-red-200 bg-red-50' : ''}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-gray-600 font-medium">Escalated</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <span className="text-2xl font-bold text-red-900">{escalated.length}</span>
                        {escalated.length > 0 && (
                            <p className="text-xs text-red-600 mt-1">
                                {reviewed.length > 0 ? Math.round((escalated.length / reviewed.length) * 100) : 0}% of reviewed
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Resolved */}
                <Card className={resolved.length > 0 ? 'border-green-200 bg-green-50' : ''}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-gray-600 font-medium">Resolved</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <span className="text-2xl font-bold text-green-900">{resolved.length}</span>
                    </CardContent>
                </Card>

                {/* Documentation */}
                <Card className={notesRatio >= 70 ? 'border-green-200 bg-green-50' : notesRatio >= 50 ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs text-gray-600 font-medium">Documented</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <span className="text-2xl font-bold text-gray-900">{notesRatio}%</span>
                        <p className="text-xs text-gray-600 mt-1">{withNotes.length}/{flagged.length}</p>
                    </CardContent>
                </Card>
            </div>

            {/* ─────────────────────────────────────────────────────────────────────── */}
            {/* OVERALL STATUS BANNER */}
            {/* ─────────────────────────────────────────────────────────────────────── */}
            {anomalyData.status && anomalyData.status !== 'ok' && (
                <Card className={`border-2 ${
                    anomalyData.status === 'critical' ? 'border-red-400 bg-red-50' :
                    anomalyData.status === 'risk' ? 'border-orange-400 bg-orange-50' :
                    'border-yellow-400 bg-yellow-50'
                }`}>
                    <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${
                                anomalyData.status === 'critical' ? 'bg-red-100' :
                                anomalyData.status === 'risk' ? 'bg-orange-100' :
                                'bg-yellow-100'
                            }`}>
                                {anomalyData.status === 'critical' ? (
                                    <AlertCircle className="h-5 w-5 text-red-600" />
                                ) : anomalyData.status === 'risk' ? (
                                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                                ) : (
                                    <Clock className="h-5 w-5 text-yellow-600" />
                                )}
                            </div>
                            <div className="flex-1">
                                <p className={`text-sm font-bold ${
                                    anomalyData.status === 'critical' ? 'text-red-900' :
                                    anomalyData.status === 'risk' ? 'text-orange-900' :
                                    'text-yellow-900'
                                }`}>
                                    {anomalyData.status.toUpperCase()}: {anomalyData.description}
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                    Risk score: {anomalyData.totalScore} ({anomalyData.anomalies.filter(a => a.severity !== 'info').length} issues)
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ─────────────────────────────────────────────────────────────────────── */}
            {/* PRIORITISED ANOMALY ALERTS (HIGH → MEDIUM → LOW → INFO) */}
            {/* ─────────────────────────────────────────────────────────────────────── */}
            {anomalyData.anomalies.length > 0 && (
                <div className="space-y-2">
                    {anomalyData.anomalies.map((anomaly, idx) => {
                        const severityConfig = {
                            'high': { icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-900', badge: 'bg-red-100 text-red-800' },
                            'medium': { icon: AlertTriangle, bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-900', badge: 'bg-orange-100 text-orange-800' },
                            'low': { icon: Clock, bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-900', badge: 'bg-yellow-100 text-yellow-800' },
                            'info': { icon: Zap, bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-900', badge: 'bg-blue-100 text-blue-800' }
                        };
                        
                        const config = severityConfig[anomaly.severity] || severityConfig.info;
                        const Icon = config.icon;

                        return (
                            <Card key={idx} className={`border ${config.bg} ${config.border}`}>
                                <CardContent className="pt-4">
                                    <div className="flex gap-3">
                                        <Icon className={`h-5 w-5 ${config.text} flex-shrink-0 mt-0.5`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <p className={`text-sm font-medium ${config.text}`}>
                                                    {anomaly.message}
                                                </p>
                                                <Badge className={`text-xs flex-shrink-0 ${config.badge}`}>
                                                    {anomaly.severity.toUpperCase()}
                                                </Badge>
                                            </div>
                                            {anomaly.nextAction && (
                                                <p className={`text-xs ${config.text} opacity-80 italic`}>
                                                    → {anomaly.nextAction}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────────── */}
            {/* REASON CODE BREAKDOWN */}
            {/* ─────────────────────────────────────────────────────────────────────── */}
            {reviewed.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-blue-500" />
                            Decision Breakdown
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {/* Resolved subsection */}
                            {resolved.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                        <p className="text-xs font-semibold text-gray-700">Resolved ({resolved.length})</p>
                                    </div>
                                    <div className="ml-6 space-y-1.5">
                                        {Object.entries(reasonCodeCounts)
                                            .filter(([code]) => {
                                                const codeOrders = resolved.filter(o => o.offline_review_reason_code === code);
                                                return codeOrders.length > 0;
                                            })
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([code, count]) => {
                                                const codeResolved = resolved.filter(o => o.offline_review_reason_code === code).length;
                                                return (
                                                    <div key={code} className="flex items-center justify-between text-xs p-1.5 bg-green-50 rounded">
                                                        <div className="flex items-center gap-2">
                                                            <ChevronRight className="h-3 w-3 text-gray-400" />
                                                            <span className="text-gray-700 font-medium">{code.replace(/_/g, ' ')}</span>
                                                        </div>
                                                        <Badge className="bg-green-100 text-green-800">{codeResolved}</Badge>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}

                            {/* Escalated subsection */}
                            {escalated.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 mt-3">
                                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                                        <p className="text-xs font-semibold text-gray-700">Escalated ({escalated.length})</p>
                                    </div>
                                    <div className="ml-6 space-y-1.5">
                                        {Object.entries(reasonCodeCounts)
                                            .filter(([code]) => {
                                                const codeOrders = escalated.filter(o => o.offline_review_reason_code === code);
                                                return codeOrders.length > 0;
                                            })
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([code, count]) => {
                                                const codeEscalated = escalated.filter(o => o.offline_review_reason_code === code).length;
                                                const isSuspicious = ['potential_abuse', 'large_price_mismatch', 'repeated_offline_issues'].includes(code);
                                                return (
                                                    <div key={code} className={`flex items-center justify-between text-xs p-1.5 rounded ${
                                                        isSuspicious ? 'bg-red-50 border border-red-200' : 'bg-orange-50'
                                                    }`}>
                                                        <div className="flex items-center gap-2">
                                                            <ChevronRight className={`h-3 w-3 ${isSuspicious ? 'text-red-400' : 'text-gray-400'}`} />
                                                            <span className={`font-medium ${isSuspicious ? 'text-red-700' : 'text-gray-700'}`}>
                                                                {code.replace(/_/g, ' ')}
                                                            </span>
                                                        </div>
                                                        <Badge className={isSuspicious ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}>
                                                            {codeEscalated}
                                                        </Badge>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ─────────────────────────────────────────────────────────────────────── */}
            {/* SYNC VALIDATION ERRORS */}
            {/* ─────────────────────────────────────────────────────────────────────── */}
            {Object.keys(syncErrorDistribution).length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Validation Error Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {Object.entries(syncErrorDistribution)
                                .sort(([, a], [, b]) => b - a)
                                .map(([type, count]) => (
                                    <div key={type} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                                        <span className="text-gray-700 font-medium capitalize">{type}:</span>
                                        <Badge className="bg-gray-200 text-gray-800">{count}</Badge>
                                    </div>
                                ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ─────────────────────────────────────────────────────────────────────── */}
            {/* ADDITIONAL CONTEXT */}
            {/* ─────────────────────────────────────────────────────────────────────── */}
            <Card className="border-gray-200 bg-gray-50">
                <CardContent className="pt-4 text-xs text-gray-700 space-y-2">
                    <p>
                        <strong>Review Speed:</strong> Unresolved avg age {avgReviewAge}h
                    </p>
                    {reviewed.length > 0 && topReasonCode && (
                        <p>
                            <strong>Most Common:</strong> {topReasonCode[0].replace(/_/g, ' ')} ({topReasonCode[1]} cases)
                        </p>
                    )}
                    {Object.keys(reviewsByManager).length > 1 && (
                        <p>
                            <strong>Reviewers:</strong> {Object.keys(reviewsByManager).length} managers
                        </p>
                    )}
                    <p className="text-gray-600 italic mt-3">
                        Indicators are rule-based signals, not proof. All anomalies require human investigation.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}