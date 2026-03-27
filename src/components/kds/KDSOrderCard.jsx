import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Flame, Clock, Bike, ShoppingBag, Utensils, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

const URGENCY = {
    fresh:  { mins: 0,  bg: 'bg-gray-800',   border: 'border-gray-700',  timer: 'text-green-400',  label: null },
    warm:   { mins: 10, bg: 'bg-gray-800',   border: 'border-yellow-600/50', timer: 'text-yellow-400', label: null },
    urgent: { mins: 15, bg: 'bg-red-950',    border: 'border-red-500',   timer: 'text-red-300',    label: '⚠ Overdue' },
};

const ORDER_TYPE_ICONS = {
    delivery:   { icon: Bike,       label: 'Delivery',   color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
    collection: { icon: ShoppingBag, label: 'Collection', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    takeaway:   { icon: ShoppingBag, label: 'Takeaway',   color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
    dine_in:    { icon: Utensils,   label: 'Dine In',    color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
};

const ACTION_COLORS = {
    blue:  'bg-blue-600 hover:bg-blue-500 text-white',
    green: 'bg-green-600 hover:bg-green-500 text-white',
};

function getElapsedMins(dateStr) {
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

function formatElapsed(mins) {
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function getUrgency(mins, isReady) {
    if (isReady) return URGENCY.fresh;
    if (mins >= 15) return URGENCY.urgent;
    if (mins >= 10) return URGENCY.warm;
    return URGENCY.fresh;
}

export default function KDSOrderCard({ order, onAction, actionLabel, actionColor, tick, isReady }) {
    const [expanded, setExpanded] = useState(true);
    const [acting, setActing] = useState(false);

    const elapsedMins = getElapsedMins(order.created_date);
    const isKiosk = order.order_source === 'kiosk';
    const unpaidKiosk = isKiosk && order.payment_status === 'pending_payment';

    // Unpaid kiosk orders have higher urgency
    let urgency = getUrgency(elapsedMins, isReady);
    if (unpaidKiosk && urgency !== URGENCY.urgent) {
        urgency = URGENCY.urgent; // Highlight unpaid orders
    }

    const typeConfig = ORDER_TYPE_ICONS[order.order_type] || ORDER_TYPE_ICONS.takeaway;
    const TypeIcon = typeConfig.icon;

    const handleAction = async () => {
        if (!onAction) return;
        // Block prep for unpaid kiosk orders
        if (unpaidKiosk && actionLabel?.includes('Preparing')) {
            return;
        }
        setActing(true);
        await onAction(order.id);
        setActing(false);
    };

    // Build order number display
    const orderNum = order.order_number || `#${order.id.slice(-6).toUpperCase()}`;

    return (
        <div className={`rounded-xl border-2 overflow-hidden transition-all ${urgency.bg} ${urgency.border} ${
            urgency === URGENCY.urgent ? 'shadow-lg shadow-red-500/20 animate-pulse-slow' : ''
        }`}>
            {/* Card Header */}
            <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {urgency === URGENCY.urgent && (
                        <Flame className="h-5 w-5 text-red-400 shrink-0 animate-bounce" />
                    )}
                    {isReady && <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />}
                    <span className="text-white font-bold text-xl tracking-wide">{orderNum}</span>
                    {order.table_number && (
                        <Badge className="bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs">
                            {order.table_number}
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Badge className={`border text-xs ${typeConfig.color}`}>
                        <TypeIcon className="h-3 w-3 mr-1" />
                        {typeConfig.label}
                    </Badge>

                    {/* Kiosk payment status badge */}
                    {isKiosk && (
                        <Badge className={`text-xs border ${
                            unpaidKiosk
                                ? 'bg-red-500/20 text-red-300 border-red-500/30 font-bold animate-pulse'
                                : 'bg-green-500/20 text-green-300 border-green-500/30'
                        }`}>
                            {unpaidKiosk ? '💳 Awaiting Payment' : '✓ Paid'}
                        </Badge>
                    )}

                    {/* Timer */}
                    <div className={`flex items-center gap-1 font-mono font-bold text-base tabular-nums ${urgency.timer}`}>
                        <Clock className="h-4 w-4" />
                        {formatElapsed(elapsedMins)}
                    </div>

                    <button
                        onClick={() => setExpanded(e => !e)}
                        className="text-gray-500 hover:text-gray-300 ml-1"
                    >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {/* Urgency bar */}
            {urgency === URGENCY.urgent && (
                <div className="h-1 bg-red-500 animate-pulse" />
            )}

            {/* Items */}
            {expanded && (
                <div className={`mx-3 mb-3 rounded-lg overflow-hidden ${urgency === URGENCY.urgent ? 'bg-red-900/40' : 'bg-gray-900/60'}`}>
                    {(order.items || []).map((item, idx) => (
                        <div key={idx} className={`px-3 py-2.5 ${idx < order.items.length - 1 ? 'border-b border-gray-700/50' : ''}`}>
                            <div className="flex items-start gap-2">
                                <span className="text-orange-400 font-bold text-lg leading-none mt-0.5 w-8 shrink-0">
                                    ×{item.quantity}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold text-base leading-snug">{item.name}</p>
                                    {/* Customizations */}
                                    {item.customizations && Object.keys(item.customizations).length > 0 && (
                                        <div className="mt-1 space-y-0.5">
                                            {Object.entries(item.customizations).map(([key, val]) => (
                                                <p key={key} className="text-gray-400 text-xs">
                                                    <span className="text-gray-500">{key}:</span>{' '}
                                                    {Array.isArray(val) ? val.join(', ') : val}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Notes */}
            {order.notes && expanded && (
                <div className="mx-3 mb-3 px-3 py-2 bg-yellow-900/30 border border-yellow-700/30 rounded-lg">
                    <p className="text-yellow-300 text-sm">📝 {order.notes}</p>
                </div>
            )}

            {/* Action Button */}
            {onAction && (
                <div className="px-3 pb-3">
                    <Button
                        onClick={handleAction}
                        disabled={acting || unpaidKiosk}
                        title={unpaidKiosk ? 'Cannot prep — payment awaiting confirmation at counter' : ''}
                        className={`w-full font-bold text-base h-11 rounded-lg ${ACTION_COLORS[actionColor]} ${
                            unpaidKiosk ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                    >
                        {acting ? '…' : actionLabel}
                    </Button>
                    {unpaidKiosk && (
                        <p className="text-center text-xs text-red-400 mt-1">⚠️ Awaiting payment confirmation</p>
                    )}
                </div>
            )}

            {/* Ready footer */}
            {isReady && (
                <div className="px-3 pb-3 text-center text-green-400 text-sm font-semibold">
                    ✓ Ready since {new Date(order.updated_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
            )}
        </div>
    );
}