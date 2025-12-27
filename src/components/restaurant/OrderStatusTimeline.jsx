import React from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function OrderStatusTimeline({ statusHistory }) {
    if (!statusHistory || statusHistory.length === 0) return null;

    const statusLabels = {
        pending: 'Order Placed',
        confirmed: 'Confirmed',
        preparing: 'Preparing',
        out_for_delivery: 'Out for Delivery',
        delivered: 'Delivered',
        cancelled: 'Cancelled'
    };

    return (
        <div className="border-t pt-4 mt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Order Timeline</p>
            <div className="space-y-2">
                {statusHistory.map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                        <div className="mt-1">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                                {statusLabels[entry.status] || entry.status}
                            </p>
                            <p className="text-xs text-gray-500">
                                {format(new Date(entry.timestamp), 'MMM d, h:mm a')}
                            </p>
                            {entry.note && (
                                <p className="text-xs text-gray-600 mt-1">{entry.note}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}