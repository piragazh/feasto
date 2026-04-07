import React from 'react';
import { AlertTriangle, Clock, Car, Wrench, Zap } from 'lucide-react';

const REASON_CONFIG = {
    temporary_closed: {
        icon: Clock,
        title: 'Temporarily Closed',
        message: 'We are temporarily not accepting orders right now. Please check back soon.',
        color: 'bg-red-50 border-red-300 text-red-800',
        iconColor: 'text-red-500',
        badgeColor: 'bg-red-100 text-red-700'
    },
    no_drivers: {
        icon: Car,
        title: 'No Drivers Available',
        message: 'We currently have no available drivers. Delivery orders are paused. Please try again shortly.',
        color: 'bg-amber-50 border-amber-300 text-amber-800',
        iconColor: 'text-amber-500',
        badgeColor: 'bg-amber-100 text-amber-700'
    },
    technical_fault: {
        icon: Wrench,
        title: 'Technical Difficulties',
        message: 'We are experiencing a technical issue and cannot accept orders at this time. We apologise for the inconvenience.',
        color: 'bg-orange-50 border-orange-300 text-orange-800',
        iconColor: 'text-orange-500',
        badgeColor: 'bg-orange-100 text-orange-700'
    },
    extremely_busy: {
        icon: Zap,
        title: 'Extremely Busy',
        message: 'We are extremely busy right now and have paused new orders to maintain quality. Please try again in a little while.',
        color: 'bg-yellow-50 border-yellow-300 text-yellow-800',
        iconColor: 'text-yellow-600',
        badgeColor: 'bg-yellow-100 text-yellow-700'
    },
    custom: {
        icon: AlertTriangle,
        title: 'Not Accepting Orders',
        message: 'We are not accepting orders right now.',
        color: 'bg-gray-50 border-gray-300 text-gray-800',
        iconColor: 'text-gray-500',
        badgeColor: 'bg-gray-100 text-gray-700'
    }
};

export default function TemporaryClosureBanner({ temporaryClosure }) {
    if (!temporaryClosure?.enabled) return null;

    const reason = temporaryClosure.reason || 'temporary_closed';
    const config = REASON_CONFIG[reason] || REASON_CONFIG['temporary_closed'];
    const Icon = config.icon;
    const displayMessage = temporaryClosure.custom_message || config.message;

    return (
        <div className={`border-2 rounded-xl p-4 md:p-5 mb-6 ${config.color}`}>
            <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex-shrink-0 ${config.iconColor}`}>
                    <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-lg">{config.title}</h3>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.badgeColor}`}>
                            Not Accepting Orders
                        </span>
                    </div>
                    <p className="text-sm leading-relaxed">{displayMessage}</p>
                </div>
            </div>
        </div>
    );
}