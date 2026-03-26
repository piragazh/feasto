import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

/**
 * Offline Review Statistics
 * 
 * Summary dashboard showing:
 * - Total flagged orders by review state
 * - Overdue (pending >4h)
 * - Escalated items (need investigation)
 * - Review quality metrics
 */
export default function OfflineReviewStats({ orders = [] }) {
    const now = new Date();
    const getReviewAge = (isoStr) => {
        if (!isoStr) return 0;
        return (now.getTime() - new Date(isoStr).getTime()) / (1000 * 60 * 60);
    };

    const flagged = orders.filter(o => o.needs_review && o.offline_created);
    const newOrders = flagged.filter(o => !o.offline_review_status || o.offline_review_status === 'new');
    const acknowledgedOrders = flagged.filter(o => o.offline_review_status === 'acknowledged');
    const resolvedOrders = flagged.filter(o => o.offline_review_status === 'resolved');
    const escalatedOrders = flagged.filter(o => o.offline_review_status === 'escalated');

    const overdueOrders = newOrders.filter(o => getReviewAge(o.offline_synced_at) > 4);
    const avgReviewAgeHours = newOrders.length > 0
        ? (newOrders.reduce((s, o) => s + getReviewAge(o.offline_synced_at), 0) / newOrders.length).toFixed(1)
        : 0;

    const withNotesCount = flagged.filter(o => o.offline_review_notes && o.offline_review_notes.trim()).length;
    const notesRatio = flagged.length > 0 ? Math.round((withNotesCount / flagged.length) * 100) : 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
            {/* Pending (New) */}
            <Card className={newOrders.length > 0 ? 'border-red-200 bg-red-50' : ''}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-gray-600 font-medium">Pending Review</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900">{newOrders.length}</span>
                        {newOrders.length > 0 && (
                            <Badge className="bg-red-100 text-red-700 text-xs">
                                {avgReviewAgeHours}h avg
                            </Badge>
                        )}
                    </div>
                    {overdueOrders.length > 0 && (
                        <p className="text-xs text-red-600 font-medium mt-1">
                            {overdueOrders.length} overdue (&gt;4h)
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Acknowledged */}
            <Card className={acknowledgedOrders.length > 0 ? 'border-blue-200 bg-blue-50' : ''}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-gray-600 font-medium">Acknowledged</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-blue-900">{acknowledgedOrders.length}</span>
                        {acknowledgedOrders.length > 0 && (
                            <Badge className="bg-blue-100 text-blue-700 text-xs">interim</Badge>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Resolved */}
            <Card className={resolvedOrders.length > 0 ? 'border-green-200 bg-green-50' : ''}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-gray-600 font-medium">Resolved</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-green-900">{resolvedOrders.length}</span>
                    </div>
                </CardContent>
            </Card>

            {/* Escalated */}
            <Card className={escalatedOrders.length > 0 ? 'border-orange-200 bg-orange-50' : ''}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-gray-600 font-medium">Escalated</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-orange-900">{escalatedOrders.length}</span>
                        {escalatedOrders.length > 0 && (
                            <Badge className="bg-orange-100 text-orange-700 text-xs">needs work</Badge>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Documentation Quality */}
            <Card className={notesRatio >= 90 ? 'border-green-200 bg-green-50' : notesRatio >= 70 ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-gray-600 font-medium">Documented</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900">{notesRatio}%</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                        {withNotesCount}/{flagged.length} with notes
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}