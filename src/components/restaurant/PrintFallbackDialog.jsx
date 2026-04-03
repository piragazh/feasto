import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, X, Printer, MapPin, Phone, Clock } from 'lucide-react';
import { formatUKTime } from '@/lib/ukDateUtils';

/**
 * PrintFallbackDialog — shown when no Bluetooth printer is available.
 * Displays a clean, readable receipt view so non-technical staff can
 * read / manually handle the order without the browser print dialog.
 */
export default function PrintFallbackDialog({ order, restaurant, config, errorMessage, onClose }) {
    if (!order) return null;

    const orderLabel = order.order_type === 'collection' && order.order_number
        ? order.order_number
        : `#${order.id?.slice(-6)}`;

    const orderTypeLabel = {
        delivery: '🚚 Delivery',
        collection: '🏪 Collection',
        takeaway: '🥡 Takeaway',
        dine_in: '🍽️ Dine In',
    }[order.order_type] || order.order_type;

    return (
        <Dialog open={!!order} onOpenChange={onClose}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
                {/* Header */}
                <DialogHeader className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Printer className="h-5 w-5 text-gray-500" />
                        <DialogTitle className="text-base font-semibold">Order {orderLabel}</DialogTitle>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                        <X className="h-4 w-4" />
                    </Button>
                </DialogHeader>

                {/* Error notice */}
                <div className="mx-4 mt-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
                    <div>
                        <p className="font-semibold">Printer not connected</p>
                        <p className="text-xs mt-0.5">{errorMessage || 'No Bluetooth printer available. Here is the order for manual reference.'}</p>
                    </div>
                </div>

                {/* Receipt body */}
                <div className="mx-4 my-4 border border-gray-200 rounded-xl overflow-hidden font-mono text-sm">
                    {/* Restaurant header */}
                    <div className="bg-gray-50 px-4 py-3 text-center border-b">
                        {config?.show_logo !== false && restaurant?.logo_url && (
                            <img src={restaurant.logo_url} alt="Logo" className="h-10 mx-auto mb-2 object-contain" />
                        )}
                        <p className="font-bold text-base">{restaurant?.name || 'KITCHEN ORDER'}</p>
                        {restaurant?.address && <p className="text-xs text-gray-500 mt-0.5">{restaurant.address}</p>}
                        {config?.header_text && <p className="text-xs text-gray-600 mt-1 italic">{config.header_text}</p>}
                    </div>

                    <div className="px-4 py-3 space-y-3">
                        {/* Order meta */}
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-lg">{orderLabel}</span>
                            <Badge variant="outline">{orderTypeLabel}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Clock className="h-3.5 w-3.5" />
                            {order.created_date ? formatUKTime(order.created_date, 'datetime12') : '—'}
                        </div>

                        {order.order_source === 'kiosk' && (
                            <div className="text-center py-1 px-2 bg-indigo-50 border border-indigo-200 rounded text-xs font-semibold text-indigo-700">
                                🖥️ KIOSK ORDER
                            </div>
                        )}

                        {/* Divider */}
                        <div className="border-t border-dashed border-gray-300" />

                        {/* Items */}
                        <div className="space-y-2">
                            {(order.items || []).map((item, idx) => (
                                <div key={idx}>
                                    <div className="flex justify-between font-medium">
                                        <span>{item.quantity}x {item.name}</span>
                                        <span>£{((item.price || 0) * item.quantity).toFixed(2)}</span>
                                    </div>
                                    {item.customizations && typeof item.customizations === 'object' && (
                                        <div className="ml-4 mt-0.5 space-y-0.5">
                                            {Object.entries(item.customizations).map(([k, v]) => {
                                                const val = Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? (v.selection || JSON.stringify(v)) : String(v);
                                                return (
                                                    <div key={k} className="text-xs text-gray-500">
                                                        <span className="text-gray-400">{k.replace(/_/g, ' ')}: </span>{val}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-dashed border-gray-300" />

                        {/* Totals */}
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between text-gray-600">
                                <span>Subtotal</span>
                                <span>£{(order.subtotal || 0).toFixed(2)}</span>
                            </div>
                            {(order.delivery_fee || 0) > 0 && (
                                <div className="flex justify-between text-gray-600">
                                    <span>Delivery</span>
                                    <span>£{(order.delivery_fee).toFixed(2)}</span>
                                </div>
                            )}
                            {(order.discount || 0) > 0 && (
                                <div className="flex justify-between text-green-600">
                                    <span>Discount</span>
                                    <span>-£{(order.discount).toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1 mt-1">
                                <span>TOTAL</span>
                                <span>£{(order.total || 0).toFixed(2)}</span>
                            </div>
                            {order.payment_method && (
                                <div className="text-xs text-gray-500 capitalize">
                                    Payment: {order.payment_method.replace(/_/g, ' ')}
                                </div>
                            )}
                        </div>

                        {/* Customer details */}
                        {config?.show_customer_details !== false && (
                            <>
                                <div className="border-t border-dashed border-gray-300" />
                                <div className="space-y-1 text-sm">
                                    {(order.guest_name || order.created_by) && (
                                        <div className="font-medium">{order.guest_name || order.created_by}</div>
                                    )}
                                    {order.phone && (
                                        <div className="flex items-center gap-1.5 text-gray-600">
                                            <Phone className="h-3.5 w-3.5" />
                                            {order.phone}
                                        </div>
                                    )}
                                    {order.delivery_address && order.order_type === 'delivery' && (
                                        <div className="flex items-start gap-1.5 text-gray-600">
                                            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                            <span>{order.delivery_address}</span>
                                        </div>
                                    )}
                                    {order.notes && (
                                        <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs mt-1">
                                            <span className="font-semibold text-yellow-800">Notes: </span>
                                            <span className="text-yellow-700">{order.notes}</span>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Footer */}
                        {config?.footer_text && (
                            <>
                                <div className="border-t border-dashed border-gray-300" />
                                <p className="text-center text-xs text-gray-500 italic">{config.footer_text}</p>
                            </>
                        )}
                    </div>
                </div>

                {/* Close button */}
                <div className="px-4 pb-4">
                    <Button onClick={onClose} className="w-full">
                        <X className="h-4 w-4 mr-2" />
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}