import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { printerManager } from '@/components/restaurant/PrinterService';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Clock, Phone, MapPin, Printer, Search, Filter, ChevronDown, ChevronUp, User, MonitorSmartphone, BadgeCheck } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import RejectOrderDialog from './RejectOrderDialog';
import DriverLocationMap from '@/components/driver/DriverLocationMap';

// ── Canonical visibility helper ──────────────────────────────────────────
// Maps kiosk (order_status) and legacy (status) to unified operational state
const getOrderOperationalStatus = (order) => {
    if (order.order_source === 'kiosk') {
        // Kiosk uses order_status for operational progression
        return order.order_status || order.status || 'unknown';
    }
    // Legacy/online/pos use status field
    return order.status || 'unknown';
};

export default function LiveOrders({ restaurantId, onOrderUpdate }) {
    const [rejectingOrder, setRejectingOrder] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [orderTypeFilter, setOrderTypeFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'kiosk' | 'other' | 'unpaid_kiosk'
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const queryClient = useQueryClient();
    const prevOrderIds = useRef(new Set());
    const restaurantRef = useRef(null);
    const printOrderDetailsRef = useRef(null);

    // Load current user to check role for payment confirmation
    useEffect(() => {
        base44.auth.me().then(user => setCurrentUser(user)).catch(() => {});
    }, []);

    // Load restaurant config once so auto-print can reference it
    useEffect(() => {
        base44.entities.Restaurant.filter({ id: restaurantId }).then(([r]) => {
            if (r) {
                restaurantRef.current = r;
                // Auto-connect all configured bluetooth printers
                const cfg = r.printer_config || {};
                const centralized = cfg.centralized_printers || [];
                const services = [printerManager.printerA, printerManager.printerB];
                centralized.forEach((p, i) => {
                    if (p.connection_type === 'bluetooth' && p.bluetooth_printer?.id && services[i]) {
                        services[i].printerInfo = p.bluetooth_printer;
                        services[i].tryAutoConnect().catch(() => {});
                    }
                });
                // Legacy fallback
                if (!centralized.length) {
                    if (cfg.bluetooth_printer?.id) printerManager.printerA.tryAutoConnect().catch(() => {});
                    if (cfg.printer_b_config?.bluetooth_printer?.id) printerManager.printerB.tryAutoConnect().catch(() => {});
                }
            }
        }).catch(() => {});
    }, [restaurantId]);

    const { data: allOrders = [], isLoading } = useQuery({
        queryKey: ['live-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ 
            restaurant_id: restaurantId,
            status: { $in: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'ready_for_collection'] }
        }, '-created_date'),
        refetchInterval: 15000,
    });

    const { data: availableDrivers = [] } = useQuery({
        queryKey: ['available-drivers'],
        queryFn: () => base44.entities.Driver.filter({ is_available: true }),
        refetchInterval: 30000,
    });

    // ── Auto-print new orders ──────────────────────────────────────────────
    useEffect(() => {
        if (!allOrders.length) return;
        const newIds = new Set(allOrders.map(o => o.id));
        const brandNew = allOrders.filter(o => o.status === 'pending' && !prevOrderIds.current.has(o.id));

        if (brandNew.length > 0 && prevOrderIds.current.size > 0) {
            const r = restaurantRef.current;
            const cfg = r?.printer_config || {};
            if (cfg.auto_print && r) {
                brandNew.forEach(order => {
                    autoPrintOrder(order, r, cfg);
                });
            }
        }

        prevOrderIds.current = newIds;
    }, [allOrders]);

    // Determine order channel for printer routing
    const getOrderChannel = (order) => {
        if (order.order_source === 'kiosk') return 'kiosk_order';
        if (order.order_type === 'dine_in') return 'pos_order';
        if (order.order_type === 'collection' || order.order_type === 'takeaway') return 'online_order';
        return 'online_order';
    };

    // Is this a kiosk order awaiting manual payment confirmation?
    const isKioskAwaitingPayment = (order) =>
        order.order_source === 'kiosk' &&
        order.payment_method === 'pay_at_counter' &&
        order.payment_status === 'pending_payment';

    // Can current user confirm kiosk payments? (role check)
    const canConfirmPayment = (user) => {
        if (!user) return false;
        const allowedRoles = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'];
        return allowedRoles.includes(user.role);
    };

    // Auto-print using centralized printer config with channel routing
    // All errors are caught — failure does not disrupt live order flow
    const autoPrintOrder = async (order, restaurant, cfg) => {
        try {
            const centralized = cfg.centralized_printers || [];
            const channel = getOrderChannel(order);
            const services = [printerManager.printerA, printerManager.printerB];

            if (centralized.length > 0) {
                // Find printers assigned to handle this order channel.
                // Kiosk orders fall back to online_order channel if no kiosk_order slot is configured.
                const effectiveChannel = channel === 'kiosk_order' &&
                    !centralized.some(p => (p.assigned_channels || []).includes('kiosk_order'))
                        ? 'online_order'
                        : channel;
                const assignedPrinters = centralized.filter(p =>
                    (p.assigned_channels || []).includes(effectiveChannel)
                );
                for (let i = 0; i < assignedPrinters.length; i++) {
                    const printerConfig = assignedPrinters[i];
                    // Find which slot index this printer is in
                    const slotIndex = centralized.indexOf(printerConfig);
                    const service = services[slotIndex] || printerManager.printerA;
                    if (printerConfig.connection_type === 'bluetooth' && printerConfig.bluetooth_printer?.id) {
                        if (!service.isConnected()) await service.tryAutoConnect().catch(() => {});
                        if (service.isConnected()) {
                            service.printReceipt(order, restaurant, { ...cfg, bluetooth_printer: printerConfig.bluetooth_printer }).catch(() => {
                                if (printOrderDetailsRef.current) printOrderDetailsRef.current(order.id);
                            });
                            return;
                        }
                    }
                }
                // No bluetooth connected — browser fallback
                if (printOrderDetailsRef.current) printOrderDetailsRef.current(order.id);
            } else {
                // Legacy fallback
                if (cfg.bluetooth_printer?.id && printerManager.printerA.isConnected()) {
                    printerManager.printerA.printReceipt(order, restaurant, cfg).catch(() => {
                        if (printOrderDetailsRef.current) printOrderDetailsRef.current(order.id);
                    });
                } else if (cfg.printer_b_config?.bluetooth_printer?.id && printerManager.printerB.isConnected()) {
                    printerManager.printerB.printReceipt(order, restaurant, { ...cfg, ...cfg.printer_b_config }).catch(() => {
                        if (printOrderDetailsRef.current) printOrderDetailsRef.current(order.id);
                    });
                } else {
                    if (printOrderDetailsRef.current) printOrderDetailsRef.current(order.id);
                }
            }
        } catch (err) {
            console.error('[autoPrintOrder] Error:', err);
            // Fallback to browser print
            if (printOrderDetailsRef.current) printOrderDetailsRef.current(order.id);
        }
    };

    const confirmKioskPaymentMutation = useMutation({
        mutationFn: async (orderId) => {
            // Role check before calling backend
            if (!canConfirmPayment(currentUser)) {
                throw new Error(`Role '${currentUser?.role || 'guest'}' cannot confirm payments`);
            }
            // Call hardened backend function with strict validation
            const response = await base44.functions.invoke('confirmKioskPayment', {
                order_id: orderId,
            });
            return response?.data || response;
        },
        onMutate: async (orderId) => {
            // Optimistic update: mark order as payment_confirmed in cache
            await queryClient.cancelQueries({ queryKey: ['live-orders', restaurantId] });
            const previous = queryClient.getQueryData(['live-orders', restaurantId]);
            
            queryClient.setQueryData(['live-orders', restaurantId], (old) => 
                old.map(o => 
                    o.id === orderId 
                        ? { ...o, payment_status: 'payment_confirmed' }
                        : o
                )
            );
            return { previous };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['live-orders']);
            toast.success(`✓ Payment confirmed for order ${data.order_number}`);
            if (data.order_id) {
                setTimeout(() => printOrderDetails(data.order_id), 500);
            }
            if (onOrderUpdate) onOrderUpdate();
        },
        onError: (error, orderId, context) => {
            // Rollback optimistic update on error
            if (context?.previous) {
                queryClient.setQueryData(['live-orders', restaurantId], context.previous);
            }
            const message = error?.message || error?.response?.data?.error || 'Failed to confirm payment';
            toast.error(message);
            console.error('[confirmKioskPayment] Error:', message);
        },
    });

    // Filter orders (with canonical status mapping)
    const orders = allOrders.filter(order => {
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesSearch = 
                order.phone?.toLowerCase().includes(query) ||
                order.delivery_address?.toLowerCase().includes(query) ||
                order.order_number?.toLowerCase().includes(query) ||
                order.id?.toLowerCase().includes(query) ||
                order.guest_name?.toLowerCase().includes(query) ||
                order.guest_email?.toLowerCase().includes(query);
            if (!matchesSearch) return false;
        }

        // Status filter: use canonical helper to work with both kiosk and legacy models
        if (statusFilter !== 'all') {
            const operationalStatus = getOrderOperationalStatus(order);
            if (operationalStatus !== statusFilter) return false;
        }

        if (orderTypeFilter !== 'all' && order.order_type !== orderTypeFilter) return false;
        
        // Source-based filtering
        if (sourceFilter === 'unpaid_kiosk' && !(order.order_source === 'kiosk' && order.payment_status === 'pending_payment')) return false;
        if (sourceFilter === 'kiosk' && order.order_source !== 'kiosk') return false;
        if (sourceFilter === 'other' && order.order_source === 'kiosk') return false;

        if (dateFrom) {
            const orderDate = new Date(order.created_date);
            const fromDate = new Date(dateFrom);
            if (orderDate < fromDate) return false;
        }
        if (dateTo) {
            const orderDate = new Date(order.created_date);
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (orderDate > toDate) return false;
        }

        return true;
    });

    const bulkUpdateStatus = useMutation({
        mutationFn: async ({ orderIds, newStatus }) => {
            const response = await base44.functions.invoke('bulkUpdateOrderStatus', {
                order_ids: orderIds,
                new_status: newStatus,
            });
            return response?.data || response;
        },
        onSuccess: async (data, { orderIds, newStatus }) => {
            queryClient.invalidateQueries(['live-orders']);
            
            // Send notifications for each order
            for (const orderId of orderIds) {
                const order = allOrders.find(o => o.id === orderId);
                if (order) {
                    await sendCustomerNotification(orderId, newStatus);
                }
            }
            
            toast.success(`${data.updated_count} orders updated to ${newStatus}`);
            setSelectedOrders([]);
            if (onOrderUpdate) onOrderUpdate();
        },
        onError: (error) => {
            const message = error?.response?.data?.error || error?.message || 'Failed to update orders';
            toast.error(message);
            console.error('[bulkUpdateStatus] Error:', message);
        },
    });

    const updateOrderMutation = useMutation({
        mutationFn: async ({ orderId, status, rejection_reason, notify = true }) => {
            // SECURITY: Route through hardened backend function with role checks
            const response = await base44.functions.invoke('updateOrderStatus', {
                order_id: orderId,
                new_status: status,
                rejection_reason: rejection_reason || undefined,
            });
            return response?.data || response;
        },
        onSuccess: async (data, { orderId, status, rejection_reason, notify = true }) => {
            queryClient.invalidateQueries(['live-orders']);
            
            if (notify) {
                await sendCustomerNotification(orderId, status, rejection_reason);
            }
            
            if (onOrderUpdate) onOrderUpdate();
        },
        onError: (error) => {
            const message = error?.response?.data?.error || error?.message || 'Failed to update order';
            toast.error(message);
            console.error('[updateOrderStatus] Error:', message);
        },
    });

    const sendCustomerNotification = async (orderId, status, rejectionReason) => {
        try {
            const order = allOrders.find(o => o.id === orderId);
            if (!order?.phone) return;

            // Check which channels are enabled for this status
            const checkResult = await base44.functions.invoke('shouldSendOrderStatusNotification', {
                restaurantId,
                status
            });
            const { shouldSendSms, shouldSendWhatsApp } = checkResult?.data || {};
            if (!shouldSendSms && !shouldSendWhatsApp) return;

            const orderLabel = order.order_type === 'collection' && order.order_number 
                ? order.order_number 
                : `#${order.id.slice(-6)}`;

            const statusMessages = {
                confirmed: `Your order ${orderLabel} has been confirmed and will be prepared shortly. ✅`,
                preparing: `Your order ${orderLabel} is being prepared. 👨‍🍳`,
                out_for_delivery: `Your order ${orderLabel} is on its way! 🚗`,
                ready_for_collection: `Your order ${orderLabel} is ready for collection! Please come to the restaurant to collect. 🏪`,
                delivered: `Your order ${orderLabel} has been delivered. Enjoy your meal! 🎉`,
                collected: `Thank you for collecting your order ${orderLabel}! Enjoy! 🎉`,
                cancelled: `Your order ${orderLabel} has been cancelled. ${rejectionReason ? `Reason: ${rejectionReason}` : 'Please contact the restaurant for more details.'} ❌`
            };

            const message = statusMessages[status] || `Order ${orderLabel} status updated.`;
            
            // WhatsApp takes priority — send only one channel to avoid duplicates
            if (shouldSendWhatsApp) {
                await base44.functions.invoke('sendWhatsAppCustomer', {
                    to: order.phone,
                    message,
                    orderId: order.id,
                    restaurantId,
                    restaurantName: order.restaurant_name || undefined,
                });
            } else if (shouldSendSms) {
                await base44.functions.invoke('sendSMS', {
                    to: order.phone,
                    message,
                    orderId: order.id,
                    restaurantId,
                    restaurantName: order.restaurant_name || undefined,
                    smsType: 'customer_notification',
                });
            }
        } catch (error) {
            console.error('Customer notification error:', error);
        }
    };

    const handleAccept = (orderId) => {
        updateOrderMutation.mutate({ orderId, status: 'confirmed' });
        toast.success('Order accepted! Preparing...');
        printOrderDetails(orderId);
    };

    const handleReject = async (orderId, reason) => {
        try {
            const response = await base44.functions.invoke('rejectOrderWithRefund', {
                order_id: orderId,
                rejection_reason: reason,
            });
            const result = response?.data;
            queryClient.invalidateQueries(['live-orders']);
            await sendCustomerNotification(orderId, 'cancelled', reason);
            if (onOrderUpdate) onOrderUpdate();
            if (result?.refunded) {
                toast.success('Order rejected and refund issued automatically');
            } else {
                toast.success('Order rejected and customer notified');
            }
        } catch (error) {
            const message = error?.response?.data?.error || error?.message || 'Failed to reject order';
            toast.error(message);
            console.error('[handleReject] Error:', message);
        }
    };

    const assignDriverMutation = useMutation({
        mutationFn: async ({ orderId, driverId }) => {
            // SECURITY: Route through hardened backend function with role checks
            const response = await base44.functions.invoke('assignOrderDriver', {
                orderId,
                driverId,
                restaurantId,
            });
            return response?.data || response;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['live-orders']);
            queryClient.invalidateQueries(['available-drivers']);
            toast.success(`Driver ${data.driver_name} assigned - Order dispatched`);
            if (onOrderUpdate) onOrderUpdate();
        },
        onError: (error) => {
            const message = error?.response?.data?.error || error?.message || 'Failed to assign driver';
            toast.error(message);
            console.error('[assignDriver] Error:', message);
        },
    });

    const handleStatusChange = async (orderId, newStatus) => {
        // When delivered/collected, record actual delivery time and free up driver
        if (newStatus === 'delivered' || newStatus === 'collected') {
            const order = allOrders.find(o => o.id === orderId);
            if (order?.driver_id) {
                base44.entities.Driver.update(order.driver_id, {
                    current_order_id: null,
                    is_available: true
                }).catch(e => console.error('Failed to reset driver:', e));
            }
            // SECURITY: Use backend function (extraFields no longer supported, only status + rejection_reason)
            updateOrderMutation.mutate({ orderId, status: newStatus });
            const statusLabels = { delivered: 'Order delivered', collected: 'Order collected' };
            toast.success(`${statusLabels[newStatus]} - Customer notified`);
            return;
        }

        if (newStatus === 'out_for_delivery') {
            const drivers = await base44.entities.Driver.filter({ 
                is_available: true,
                current_order_id: null 
            });
            
            if (drivers.length > 0) {
                const driver = drivers[0];
                
                const etaPrompt = `Calculate estimated delivery time for a food delivery order.
Distance: Assume 3-5 km average urban delivery.
Traffic: Consider it's ${new Date().getHours()}:00, adjust for peak hours (12-14, 18-21).
Vehicle: ${driver.vehicle_type}
Provide only the time range (e.g., "25-30 min").`;
                
                try {
                    const etaResponse = await base44.integrations.Core.InvokeLLM({
                        prompt: etaPrompt
                    });
                    
                    await base44.entities.Order.update(orderId, { 
                        driver_id: driver.id,
                        estimated_delivery: etaResponse
                    });
                    
                    await base44.entities.Driver.update(driver.id, {
                        current_order_id: orderId,
                        is_available: false
                    });
                } catch (e) {
                    console.error('ETA calculation failed:', e);
                }
            }
        }
        
        // SECURITY: Use backend function — works with both status (legacy) and order_status (kiosk) fields
        updateOrderMutation.mutate({ orderId, status: newStatus });
        const statusLabels = {
            confirmed: 'Order accepted',
            preparing: 'Preparing order',
            out_for_delivery: 'Order dispatched - Driver assigned',
            ready_for_collection: 'Order ready for collection',
            ready: 'Order ready for collection',
            delivered: 'Order delivered',
            collected: 'Order collected'
        };
        toast.success(`${statusLabels[newStatus] || newStatus} - Customer notified via SMS`);
    };

    const printOrderDetails = async (orderId) => {
        const order = allOrders.find(o => o.id === orderId);
        if (!order) return;

        // Use cached restaurant or fetch fresh
        let restaurant = restaurantRef.current;
        if (!restaurant) {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            restaurant = restaurants?.[0];
            restaurantRef.current = restaurant;
        }
        const config = restaurant?.printer_config || {};
        const centralized = config.centralized_printers || [];
        const channel = getOrderChannel(order);
        const services = [printerManager.printerA, printerManager.printerB];

        // Try centralized printers first (channel-aware)
        if (centralized.length > 0) {
            const effectiveChannel = channel === 'kiosk_order' &&
                !centralized.some(p => (p.assigned_channels || []).includes('kiosk_order'))
                    ? 'online_order'
                    : channel;
            const assignedPrinters = centralized.filter(p => (p.assigned_channels || []).includes(effectiveChannel));
            // If none assigned to this channel, try all printers
            const printersToTry = assignedPrinters.length > 0 ? assignedPrinters : centralized;
            for (const printerConfig of printersToTry) {
                const slotIndex = centralized.indexOf(printerConfig);
                const service = services[slotIndex] || printerManager.printerA;
                if (printerConfig.connection_type === 'bluetooth' && printerConfig.bluetooth_printer?.id) {
                    if (!service.isConnected()) await service.tryAutoConnect().catch(() => {});
                    if (service.isConnected()) {
                        try {
                            await service.printReceipt(order, restaurant, { ...config, bluetooth_printer: printerConfig.bluetooth_printer });
                            toast.success(`Printed via ${printerConfig.name || `Printer ${slotIndex + 1}`}`);
                            return;
                        } catch (e) {
                            toast.warning(`${printerConfig.name || 'Bluetooth printer'} failed, trying next...`);
                        }
                    }
                }
            }
        } else {
            // Legacy fallback
            if (config.bluetooth_printer?.id) {
                if (!printerManager.printerA.isConnected()) await printerManager.printerA.tryAutoConnect().catch(() => {});
                if (printerManager.printerA.isConnected()) {
                    try {
                        await printerManager.printerA.printReceipt(order, restaurant, config);
                        toast.success('Printed via Bluetooth Printer A');
                        return;
                    } catch (e) {
                        toast.warning('Bluetooth print failed, falling back to browser print');
                    }
                }
            }
            if (config.printer_b_config?.bluetooth_printer?.id) {
                if (!printerManager.printerB.isConnected()) await printerManager.printerB.tryAutoConnect().catch(() => {});
                if (printerManager.printerB.isConnected()) {
                    try {
                        await printerManager.printerB.printReceipt(order, restaurant, { ...config, ...config.printer_b_config });
                        toast.success('Printed via Bluetooth Printer B');
                        return;
                    } catch (e) {
                        toast.warning('Bluetooth Printer B failed, falling back to browser print');
                    }
                }
            }
        }

        // Browser print fallback (non-crashing)
        try {
            browserPrintOrder(order, restaurant, config);
        } catch (err) {
            toast.error('Print failed — manual review needed');
            console.error('[LiveOrders] Browser print error:', err);
        }
    };

    const browserPrintOrder = (order, restaurant, config) => {
        const printerWidth = config.printer_width === '58mm' ? '400px' : '560px';
        const baseFontSize = config.font_size === 'small' ? '28px' : config.font_size === 'large' ? '38px' : '32px';
        const headerFontSize = config.font_size === 'small' ? '42px' : config.font_size === 'large' ? '56px' : '48px';
        const h3FontSize = config.font_size === 'small' ? '32px' : config.font_size === 'large' ? '42px' : '36px';
        const totalFontSize = config.font_size === 'small' ? '38px' : config.font_size === 'large' ? '48px' : '42px';

        const printWindow = window.open('', '', 'width=300,height=600');
        if (!printWindow) {
            console.warn('[LiveOrders] Print window blocked by popup blocker');
            toast.warning('Popup blocked — cannot print. Please allow popups and retry.');
            return;
        }

        // Wrap document write/print to catch any errors
        if (!printWindow.document) {
            console.warn('[LiveOrders] Print window missing document object');
            toast.error('Cannot access print window document');
            return;
        }
        const orderLabel = order.order_type === 'collection' && order.order_number 
            ? order.order_number 
            : `#${order.id.slice(-6)}`;
        
        try {
            printWindow.document.write(`
            <html>
                <head>
                    <title>Order ${orderLabel}</title>
                    <style>
                        body { font-family: monospace; width: ${printerWidth}; margin: 10px; font-size: ${baseFontSize}; }
                        h2 { text-align: center; margin: 10px 0; font-size: ${headerFontSize}; }
                        h3 { font-size: ${h3FontSize}; }
                        .separator { border-top: 2px dashed #000; margin: 10px 0; }
                        .item { margin: 15px 0; padding: 8px 0; font-size: ${baseFontSize}; border-bottom: 1px solid #e5e5e5; }
                        .total { font-weight: bold; font-size: ${totalFontSize}; margin-top: 10px; }
                        p { font-size: ${baseFontSize}; }
                        small { font-size: ${baseFontSize === '28px' ? '24px' : baseFontSize === '38px' ? '32px' : '28px'}; }
                        .logo { text-align: center; margin: 10px 0; }
                        .logo img { max-width: 80px; height: auto; }
                        .collection-badge { 
                            text-align: center; 
                            background: #dbeafe; 
                            padding: 5px; 
                            font-weight: bold;
                            border-radius: 4px;
                            margin: 10px 0;
                        }
                    </style>
                </head>
                <body>
                    ${config.show_logo !== false && restaurant?.logo_url ? `<div class="logo"><img src="${restaurant.logo_url}" alt="Logo" /></div>` : ''}
                    ${config.header_text ? `<p style="text-align: center; font-weight: bold;">${config.header_text}</p>` : ''}
                    <h2>${restaurant?.name || 'KITCHEN ORDER'}</h2>
                    ${order.order_type === 'collection' ? '<div class="collection-badge">🏪 COLLECTION ORDER</div>' : ''}
                    <div class="separator"></div>
                    ${order.order_source === 'kiosk' ? `
                        <div class="collection-badge" style="background:#e0e7ff;color:#3730a3;border:2px solid #3730a3;">
                            🖥️ KIOSK ORDER
                        </div>
                        ${order.payment_method === 'pay_at_counter' && order.payment_confirmed_at ? 
                            `<div class="collection-badge" style="background:#d1fae5;color:#065f46;border:2px solid #10b981;">✓ PAYMENT CONFIRMED</div>` :
                            order.payment_method === 'pay_at_counter' ?
                            `<div class="collection-badge" style="background:#fef3c7;color:#92400e;border:2px solid #f59e0b;">⏳ AWAITING PAYMENT AT COUNTER</div>` :
                            ''
                        }
                    ` : ''}
                    ${config.show_order_number !== false ? `<p><strong>Order:</strong> ${orderLabel}</p>` : ''}
                    <p><strong>Type:</strong> ${order.order_type === 'collection' ? 'COLLECTION' : order.order_type === 'takeaway' ? 'TAKEAWAY' : order.order_type === 'dine_in' ? 'DINE IN' : 'DELIVERY'}</p>
                    <p><strong>Time:</strong> ${order.created_date ? format(new Date(order.created_date), 'HH:mm') : '--:--'}</p>
                    <div class="separator"></div>
                    <h3>ITEMS:</h3>
                    ${order.items.map(item => {
                        let itemHtml = '<div class="item"><strong>' + item.quantity + 'x ' + item.name + '</strong>';
                        
                        if (item.customizations) {
                            const lines = [];
                            Object.entries(item.customizations).forEach(([key, val]) => {
                                // Handle meal_customizations separately
                                if (key.includes('meal_customizations') && typeof val === 'object') {
                                    Object.entries(val).forEach(([mealKey, mealVal]) => {
                                        const formattedKey = mealKey.replace(/_/g, ' ').toUpperCase();
                                        lines.push('<div style="font-style: italic; margin-top: 4px;">' + formattedKey + '</div>');
                                        
                                        if (Array.isArray(mealVal)) {
                                            mealVal.forEach(optionName => {
                                                const qty = item.itemQuantities && item.itemQuantities[optionName] || 1;
                                                lines.push('<div>' + qty + 'x ' + optionName + '</div>');
                                            });
                                        } else {
                                            lines.push('<div>1x ' + String(mealVal) + '</div>');
                                        }
                                    });
                                    return;
                                }
                                
                                // Regular customizations
                                const formattedKey = key.replace(/_/g, ' ').toUpperCase();
                                lines.push('<div style="font-style: italic; margin-top: 4px;">' + formattedKey + '</div>');
                                
                                if (Array.isArray(val)) {
                                    val.forEach(optionName => {
                                        const qty = item.itemQuantities && item.itemQuantities[optionName] || 1;
                                        lines.push('<div>' + qty + 'x ' + optionName + '</div>');
                                    });
                                } else if (typeof val === 'object' && val !== null) {
                                    // Handle nested objects with 'selection' property
                                    if ('selection' in val) {
                                        lines.push('<div>1x ' + String(val.selection || '') + '</div>');
                                    }
                                    // Skip other complex objects
                                } else {
                                    lines.push('<div>1x ' + String(val) + '</div>');
                                }
                            });
                            
                            if (lines.length > 0) {
                                itemHtml += '<br/><small style="margin-left: 15px; display: block;">' + lines.join('') + '</small>';
                            }
                        }
                        
                        itemHtml += '</div>';
                        return itemHtml;
                    }).join('')}
                    <div class="separator"></div>
                    ${config.show_customer_details !== false ? `
                        <h3>CUSTOMER DETAILS:</h3>
                        ${order.guest_name || order.created_by ? `<p><strong>Name:</strong> ${order.guest_name || order.created_by}</p>` : ''}
                        <p><strong>Phone:</strong> ${order.phone}</p>
                        ${order.order_type === 'delivery' && order.delivery_address ? `<p><strong>Address:</strong> ${order.delivery_address}</p>` : ''}
                        ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
                        ${order.payment_method ? `<p><strong>Payment:</strong> ${order.payment_method.replace(/_/g, ' ').toUpperCase()}</p>` : ''}
                    ` : ''}
                    <div class="separator"></div>
                    <h3>PAYMENT SUMMARY:</h3>
                    <p><strong>Subtotal:</strong> £${(order.subtotal || 0).toFixed(2)}</p>
                    ${(order.delivery_fee || 0) > 0 ? `<p><strong>Delivery Fee:</strong> £${(order.delivery_fee).toFixed(2)}</p>` : ''}
                    ${(order.small_order_surcharge || 0) > 0 ? `<p><strong>Small Order Surcharge:</strong> £${(order.small_order_surcharge).toFixed(2)}</p>` : ''}
                    ${(order.discount || 0) > 0 ? `<p><strong>Discount:</strong> -£${(order.discount).toFixed(2)}</p>` : ''}
                    ${order.coupon_code ? `<p><strong>Coupon Applied:</strong> ${order.coupon_code}</p>` : ''}
                    <div class="separator"></div>
                    <p class="total">TOTAL: £${(order.total || 0).toFixed(2)}</p>
                    ${config.footer_text ? `<p style="text-align: center; margin-top: 10px;">${config.footer_text}</p>` : ''}
                </body>
            </html>
        `);
            printWindow.document.close();
            printWindow.print();
        } catch (err) {
            console.error('[LiveOrders] Print document error:', err);
            toast.error('Print formatting error — close window and retry');
            if (printWindow && !printWindow.closed) {
                printWindow.close();
            }
        }
    };



    // Keep ref always pointing to latest printOrderDetails
    useEffect(() => { printOrderDetailsRef.current = printOrderDetails; });

    const getStatusColor = (status) => {
        const colors = {
            // Legacy status values
            pending: 'bg-yellow-100 text-yellow-800',
            confirmed: 'bg-blue-100 text-blue-800',
            preparing: 'bg-purple-100 text-purple-800',
            out_for_delivery: 'bg-orange-100 text-orange-800',
            ready_for_collection: 'bg-green-100 text-green-800',
            // Kiosk order_status values (map to compatible colors)
            new: 'bg-gray-100 text-gray-800',
            ready: 'bg-green-100 text-green-800',
            completed: 'bg-green-100 text-green-800',
            collected: 'bg-green-100 text-green-800',
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    const handleSelectAll = (checked) => {
        setSelectedOrders(checked ? orders.map(o => o.id) : []);
    };

    const handleSelectOrder = (orderId, checked) => {
        if (checked) {
            setSelectedOrders([...selectedOrders, orderId]);
        } else {
            setSelectedOrders(selectedOrders.filter(id => id !== orderId));
        }
    };

    const clearFilters = () => {
        setSearchQuery('');
        setStatusFilter('all');
        setOrderTypeFilter('all');
        setSourceFilter('all');
        setDateFrom('');
        setDateTo('');
    };

    // Sort orders: unpaid kiosk first, then by operational status, then by age
    const sortedOrders = React.useMemo(() => {
        const sorted = [...orders];
        sorted.sort((a, b) => {
            // Priority 1: Unpaid kiosk orders at top (highest visibility for staff)
            const aUnpaidKiosk = a.order_source === 'kiosk' && a.payment_status === 'pending_payment' ? 0 : 1;
            const bUnpaidKiosk = b.order_source === 'kiosk' && b.payment_status === 'pending_payment' ? 0 : 1;
            if (aUnpaidKiosk !== bUnpaidKiosk) return aUnpaidKiosk - bUnpaidKiosk;

            // Priority 2: Pending/new orders (awaiting action) — use canonical helper
            const statusPriority = { 'new': 0, 'pending': 0, 'confirmed': 1, 'preparing': 2, 'ready': 3, 'ready_for_collection': 3, 'out_for_delivery': 3, 'completed': 4, 'collected': 4, 'cancelled': 5 };
            const aStatus = getOrderOperationalStatus(a);
            const bStatus = getOrderOperationalStatus(b);
            const aPriority = statusPriority[aStatus] ?? 4;
            const bPriority = statusPriority[bStatus] ?? 4;
            if (aPriority !== bPriority) return aPriority - bPriority;

            // Priority 3: Oldest first (most urgent)
            return new Date(a.created_date) - new Date(b.created_date);
        });
        return sorted;
    }, [orders]);

    if (isLoading) {
        return <div className="text-center py-8">Loading orders...</div>;
    }

    return (
        <div>
            {/* Source filter tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
                {[
                    { key: 'all', label: 'All Orders' },
                    { key: 'unpaid_kiosk', label: '💳 Unpaid Kiosk', highlight: 'yellow' },
                    { key: 'kiosk', label: '🖥️ All Kiosk' },
                    { key: 'other', label: 'Online / Other' },
                ].map(tab => {
                    const unpaidCount = allOrders.filter(o => o.order_source === 'kiosk' && o.payment_status === 'pending_payment').length;
                    const kioskCount = allOrders.filter(o => o.order_source === 'kiosk').length;
                    const displayCount = tab.key === 'unpaid_kiosk' ? unpaidCount : tab.key === 'kiosk' ? kioskCount : null;
                    
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setSourceFilter(tab.key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                sourceFilter === tab.key
                                    ? `${tab.highlight === 'yellow' ? 'bg-yellow-600 text-white' : 'bg-indigo-600 text-white'}`
                                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {tab.label}
                            {displayCount !== null && (
                                <span className={`ml-1.5 ${sourceFilter === tab.key ? 'bg-white/20' : 'bg-gray-200'} text-xs px-1.5 py-0.5 rounded-full`}>
                                    {displayCount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold">Live Orders ({orders.length})</h2>
                    {sourceFilter === 'all' && allOrders.filter(o => o.order_source === 'kiosk' && o.payment_status === 'pending_payment').length > 0 && (
                        <p className="text-xs text-orange-600 font-semibold mt-1">
                            ⚠️ {allOrders.filter(o => o.order_source === 'kiosk' && o.payment_status === 'pending_payment').length} unpaid kiosk orders
                        </p>
                    )}
                </div>
                {selectedOrders.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">{selectedOrders.length} selected</span>
                        <Select onValueChange={(status) => {
                            if (status) {
                                bulkUpdateStatus.mutate({ orderIds: selectedOrders, newStatus: status });
                            }
                        }}>
                            <SelectTrigger className="w-48">
                                <SelectValue placeholder="Bulk Update Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="confirmed">Mark as Confirmed</SelectItem>
                                <SelectItem value="preparing">Mark as Preparing</SelectItem>
                                <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                                <SelectItem value="ready_for_collection">Ready for Collection</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => setSelectedOrders([])} size="sm">
                            Clear Selection
                        </Button>
                    </div>
                )}
            </div>

            {/* Search and Filters */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search by phone, address, order number, customer name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>

                        <Button
                            variant="outline"
                            onClick={() => setShowFilters(!showFilters)}
                            className="w-full"
                        >
                            <Filter className="h-4 w-4 mr-2" />
                            {showFilters ? 'Hide Filters' : 'Show Filters'}
                            {showFilters ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
                        </Button>

                        {showFilters && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Status</label>
                                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Status</SelectItem>
                                            <SelectItem value="pending">Pending</SelectItem>
                                            <SelectItem value="confirmed">Confirmed</SelectItem>
                                            <SelectItem value="preparing">Preparing</SelectItem>
                                            <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                                            <SelectItem value="ready_for_collection">Ready for Collection</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">Order Type</label>
                                    <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Types</SelectItem>
                                            <SelectItem value="delivery">🚚 Delivery</SelectItem>
                                            <SelectItem value="collection">🏪 Collection</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">From Date</label>
                                    <Input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-2 block">To Date</label>
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                    />
                                </div>

                                <div className="md:col-span-2 lg:col-span-4">
                                    <Button variant="ghost" onClick={clearFilters} className="w-full">
                                        Clear All Filters
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {orders.length === 0 ? (
                <Card>
                    <CardContent className="text-center py-16">
                        <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">No Orders Found</h3>
                        <p className="text-gray-500">Try adjusting your search or filters</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {orders.length > 0 && (
                        <div className="flex items-center gap-2 mb-4 p-4 bg-gray-50 rounded-lg">
                            <Checkbox
                                checked={selectedOrders.length === orders.length}
                                onCheckedChange={handleSelectAll}
                            />
                            <span className="text-sm font-medium">Select All ({orders.length} orders)</span>
                        </div>
                    )}

                    <div className="grid gap-4">
                        {sortedOrders.map((order, index) => (
                            <motion.div
                                key={order.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                            >
                                <Card className={`
                                    ${isKioskAwaitingPayment(order) 
                                        ? 'border-2 border-orange-500 shadow-lg shadow-orange-200 bg-orange-50/30' 
                                        : order.status === 'pending' && order.order_source !== 'kiosk'
                                        ? 'border-2 border-red-500 shadow-lg' 
                                        : 'border border-gray-200'}
                                    ${selectedOrders.includes(order.id) ? 'ring-2 ring-orange-500' : ''}
                                `}>
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    checked={selectedOrders.includes(order.id)}
                                                    onCheckedChange={(checked) => handleSelectOrder(order.id, checked)}
                                                    className="mt-1"
                                                />
                                                <div>
                                                   <div className="flex items-center gap-2 flex-wrap">
                                                       <CardTitle className="flex items-center gap-0">
                                                           {order.order_type === 'collection' && order.order_number ? (
                                                               <span className="text-2xl font-bold text-blue-600">{order.order_number}</span>
                                                           ) : (
                                                               <>Order #{order.id.slice(-6)}</>
                                                           )}
                                                       </CardTitle>
                                                       {/* Compact badge row for source and status */}
                                                       {order.order_source === 'kiosk' && (
                                                           <Badge className="bg-indigo-100 text-indigo-800 border border-indigo-300 gap-0.5" size="sm">
                                                               🖥️ Kiosk
                                                           </Badge>
                                                       )}
                                                       <Badge className={`text-xs gap-0.5 ${order.order_type === 'collection' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`} size="sm">
                                                           {order.order_type === 'collection' ? '🏪' : order.order_type === 'takeaway' ? '🥡' : order.order_type === 'dine_in' ? '🍽️' : '🚚'}
                                                       </Badge>
                                                       {/* Kiosk: payment + order status badges */}
                                                       {order.order_source === 'kiosk' && (
                                                           <>
                                                               <Badge className={`text-xs ${
                                                                   order.payment_status === 'pending_payment' ? 'bg-orange-200 text-orange-900 border border-orange-400 animate-pulse font-bold' :
                                                                   order.payment_status === 'payment_confirmed' ? 'bg-green-100 text-green-800' :
                                                                   order.payment_status === 'paid_card' ? 'bg-green-100 text-green-800' :
                                                                   'bg-gray-100 text-gray-800'
                                                               }`} size="sm">
                                                                   {order.payment_status === 'pending_payment' ? '💳' :
                                                                    order.payment_status === 'payment_confirmed' ? '✓' :
                                                                    order.payment_status === 'paid_card' ? '💰' :
                                                                    '?'}
                                                               </Badge>
                                                               <Badge className={`text-xs ${getStatusColor(order.order_status)}`} size="sm">
                                                                   {order.order_status === 'new' ? 'New' :
                                                                    order.order_status === 'confirmed' ? 'Conf' :
                                                                    order.order_status === 'preparing' ? 'Prep' :
                                                                    order.order_status === 'ready' ? 'Ready' :
                                                                    '?'}
                                                               </Badge>
                                                           </>
                                                       )}
                                                       {/* Legacy orders: single status badge (uses canonical helper) */}
                                                       {order.order_source !== 'kiosk' && (
                                                           <Badge className={`text-xs ${getStatusColor(getOrderOperationalStatus(order))}`} size="sm">
                                                               {(() => {
                                                                   const status = getOrderOperationalStatus(order);
                                                                   const labels = {
                                                                       'pending': 'Pending', 'confirmed': 'Conf', 'preparing': 'Prep',
                                                                       'out_for_delivery': 'Delivery', 'ready_for_collection': 'Ready',
                                                                       'completed': 'Done', 'cancelled': 'Cancel'
                                                                   };
                                                                   return labels[status] || status.replace(/_/g, ' ');
                                                               })()}
                                                           </Badge>
                                                       )}
                                                   </div>
                                                   <p className="text-sm text-gray-500 mt-1">
                                                       {order.created_date ? format(new Date(order.created_date), 'MMM d, h:mm a') : '—'}
                                                   </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-bold text-gray-900">£{(order.total || 0).toFixed(2)}</p>
                                                {order.payment_method && (
                                                    <p className="text-xs text-gray-500 capitalize">
                                                        {order.payment_method.replace(/_/g, ' ')}
                                                    </p>
                                                )}
                                                {order.order_type === 'collection' && order.order_number && (
                                                    <div className="mt-2">
                                                        <img 
                                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${order.order_number}`}
                                                            alt="QR Code"
                                                            className="w-20 h-20 border-2 border-gray-200 rounded"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            {order.items.map((item, idx) => {
                                                // Format customizations for display
                                                const formatCustomizations = () => {
                                                    const lines = [];

                                                    // Handle customizations object
                                                    if (item.customizations && typeof item.customizations === 'object') {
                                                        Object.entries(item.customizations).forEach(([key, val]) => {
                                                            // Handle meal_customizations objects specially
                                                            if (key.includes('meal_customizations') && typeof val === 'object') {
                                                                Object.entries(val).forEach(([mealKey, mealVal]) => {
                                                                    let mealDisplayValue = '';
                                                                    if (Array.isArray(mealVal)) {
                                                                        const itemsWithQty = mealVal.map(optionName => {
                                                                            if (item.itemQuantities) {
                                                                                const qtyKey = Object.keys(item.itemQuantities).find(k => 
                                                                                    k.toLowerCase().includes('meal') && k.toLowerCase().includes(optionName.toLowerCase())
                                                                                );
                                                                                const qty = qtyKey ? item.itemQuantities[qtyKey] : 1;
                                                                                return qty > 1 ? `${optionName} (${qty}x)` : optionName;
                                                                            }
                                                                            return optionName;
                                                                        });
                                                                        mealDisplayValue = itemsWithQty.join(', ');
                                                                    } else {
                                                                        mealDisplayValue = String(mealVal);
                                                                    }
                                                                    
                                                                    if (mealDisplayValue) {
                                                                        // Final safety check: ensure mealDisplayValue is not an object
                                                                        if (typeof mealDisplayValue === 'object') {
                                                                            return; // Skip this customization
                                                                        }
                                                                        
                                                                        const formattedKey = mealKey
                                                                            .replace(/_/g, ' ')
                                                                            .split(' ')
                                                                            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                                                            .join(' ');
                                                                        lines.push({ key: `   ${formattedKey}`, value: mealDisplayValue });
                                                                    }
                                                                });
                                                                return;
                                                            }

                                                            let displayValue = '';
                                                            if (Array.isArray(val)) {
                                                                // Merge quantities into the array display
                                                                const itemsWithQty = val.map(optionName => {
                                                                    // Check if there's a quantity for this option
                                                                    if (item.itemQuantities) {
                                                                        const qtyKey = Object.keys(item.itemQuantities).find(k => 
                                                                            k.toLowerCase().includes(optionName.toLowerCase())
                                                                        );
                                                                        const qty = qtyKey ? item.itemQuantities[qtyKey] : 1;
                                                                        return qty > 1 ? `${optionName} (${qty}x)` : optionName;
                                                                    }
                                                                    return optionName;
                                                                });
                                                                displayValue = itemsWithQty.join(', ');
                                                            } else if (typeof val === 'object' && val !== null) {
                                                                // Handle nested objects with 'selection' property
                                                                if ('selection' in val) {
                                                                    displayValue = String(val.selection || '');
                                                                } else {
                                                                    displayValue = JSON.stringify(val);
                                                                }
                                                            } else {
                                                                displayValue = String(val);
                                                            }

                                                            if (displayValue) {
                                                                // Final safety check: ensure displayValue is not an object
                                                                if (typeof displayValue === 'object') {
                                                                    return; // Skip this customization
                                                                }
                                                                
                                                                // Format key: capitalize first letter, replace underscores with spaces
                                                                const formattedKey = key
                                                                    .replace(/_/g, ' ')
                                                                    .split(' ')
                                                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                                                    .join(' ');
                                                                
                                                                lines.push({ key: formattedKey, value: displayValue });
                                                            }
                                                        });
                                                    }

                                                    return lines;
                                                };

                                                const customizationLines = formatCustomizations();

                                                return (
                                                    <div key={idx} className="flex justify-between text-sm">
                                                        <div className="flex-1">
                                                            <span className="font-medium">{item.quantity}x {item.name}</span>

                                                            {customizationLines.length > 0 && (
                                                                <div className="text-xs text-gray-600 ml-4 mt-1 space-y-0.5 bg-gray-50 p-2 rounded">
                                                                    {customizationLines.map((line, i) => (
                                                                        <div key={i}>
                                                                            <span className="font-medium">{line.key}:</span> {line.value}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className="ml-2">£{((item.price || 0) * item.quantity).toFixed(2)}</span>
                                                    </div>
                                        );
                                            })}
                                        </div>

                                        <Separator />

                                        <div className="space-y-2 text-sm">
                                            {order.order_type === 'delivery' && order.delivery_address && (
                                                <div className="flex items-start gap-2">
                                                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                                                    <span className="text-gray-700">
                                                        {typeof order.delivery_address === 'string' && !order.delivery_address.includes('lat')
                                                            ? order.delivery_address
                                                            : order.delivery_coordinates
                                                                ? `${order.delivery_coordinates.lat}, ${order.delivery_coordinates.lng}`
                                                                : 'Address not provided'}
                                                    </span>
                                                </div>
                                            )}
                                            {order.order_type === 'collection' && (
                                                <div className="flex items-start gap-2">
                                                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                                                    <span className="text-gray-700">Customer will collect from restaurant</span>
                                                </div>
                                            )}
                                            {order.order_type === 'dine_in' && order.table_number && (
                                                <div className="flex items-start gap-2">
                                                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                                                    <span className="text-gray-700">{order.table_number}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-4 w-4 text-gray-400" />
                                                <span className="text-gray-700">{order.phone}</span>
                                            </div>
                                            {order.notes && (
                                                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                                                    <p className="text-xs font-semibold text-yellow-900">Special Instructions:</p>
                                                    <p className="text-sm text-yellow-800">{order.notes}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Live driver map for out_for_delivery orders */}
                                        {order.status === 'out_for_delivery' && (
                                            <div className="mt-2">
                                                <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse inline-block" />
                                                    Live Driver Location
                                                </p>
                                                <DriverLocationMap
                                                    driverLocation={order.driver_location}
                                                    deliveryCoords={order.delivery_coordinates}
                                                    height="180px"
                                                />
                                            </div>
                                        )}

                                        <Separator />

                                        <div className="flex gap-2 flex-wrap">
                                            {/* Kiosk counter-pay awaiting payment confirmation */}
                                            {order.order_source === 'kiosk' && order.payment_status === 'pending_payment' && (
                                                <>
                                                    {canConfirmPayment(currentUser) ? (
                                                        <>
                                                            <Button
                                                                onClick={() => confirmKioskPaymentMutation.mutate(order.id)}
                                                                disabled={confirmKioskPaymentMutation.isPending}
                                                                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                                                                title="Confirm customer paid at counter (locked to authorized roles)"
                                                            >
                                                                <BadgeCheck className="h-4 w-4 mr-2" />
                                                                {confirmKioskPaymentMutation.isPending ? 'Confirming...' : 'Confirm Payment'}
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <div className="flex-1 p-2 bg-gray-100 rounded text-xs text-gray-600 text-center">
                                                            Only managers/cashiers can confirm
                                                        </div>
                                                    )}
                                                    <Button
                                                        onClick={() => setRejectingOrder(order)}
                                                        variant="destructive"
                                                        className="flex-1"
                                                    >
                                                        <XCircle className="h-4 w-4 mr-2" />
                                                        Cancel
                                                    </Button>
                                                </>
                                            )}
                                            
                                            {/* Kiosk card-paid or counter-pay after payment confirmed: no payment button, straight to prep flow */}
                                            {order.order_source === 'kiosk' && order.payment_status !== 'pending_payment' && order.order_status === 'new' && (
                                                <>
                                                    <Button
                                                        onClick={() => handleAccept(order.id)}
                                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                                        title={order.payment_status === 'paid_card' ? 'Payment already authorized at terminal' : 'Payment confirmed by staff'}
                                                    >
                                                        <CheckCircle className="h-4 w-4 mr-2" />
                                                        Accept Order
                                                    </Button>
                                                    <Button
                                                        onClick={() => setRejectingOrder(order)}
                                                        variant="destructive"
                                                        className="flex-1"
                                                    >
                                                        <XCircle className="h-4 w-4 mr-2" />
                                                        Reject
                                                    </Button>
                                                </>
                                            )}

                                            {/* Legacy orders (non-kiosk) */}
                                            {order.order_source !== 'kiosk' && order.status === 'pending' && (
                                                <>
                                                    <Button
                                                        onClick={() => handleAccept(order.id)}
                                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                                    >
                                                        <CheckCircle className="h-4 w-4 mr-2" />
                                                        Accept Order
                                                    </Button>
                                                    <Button
                                                        onClick={() => setRejectingOrder(order)}
                                                        variant="destructive"
                                                        className="flex-1"
                                                    >
                                                        <XCircle className="h-4 w-4 mr-2" />
                                                        Reject
                                                    </Button>
                                                </>
                                            )}
                                            
                                            {/* Kiosk orders in confirmed state */}
                                            {order.order_source === 'kiosk' && order.order_status === 'confirmed' && (
                                                <>
                                                    <Button
                                                        disabled={true}
                                                        className="flex-1 bg-gray-400 hover:bg-gray-400 cursor-not-allowed"
                                                        title="Kiosk order status transitions handled server-side"
                                                    >
                                                        Start Preparing
                                                    </Button>
                                                </>
                                            )}

                                            {/* Legacy orders in confirmed state */}
                                            {order.order_source !== 'kiosk' && order.status === 'confirmed' && (
                                                <>
                                                    <Button
                                                        onClick={() => handleStatusChange(order.id, 'preparing')}
                                                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                                                    >
                                                        Start Preparing
                                                    </Button>
                                                    <Button
                                                        onClick={() => setRejectingOrder(order)}
                                                        variant="destructive"
                                                        size="sm"
                                                        title="Cancel this confirmed order"
                                                    >
                                                        Cancel
                                                    </Button>
                                                </>
                                            )}

                                            {/* Kiosk orders preparing */}
                                            {order.order_source === 'kiosk' && order.order_status === 'preparing' && (
                                                <>
                                                    <Button
                                                        disabled={true}
                                                        className="flex-1 bg-gray-400 hover:bg-gray-400 cursor-not-allowed"
                                                        title="Kiosk order status transitions handled server-side"
                                                    >
                                                        Mark Ready
                                                    </Button>
                                                </>
                                            )}

                                            {/* Legacy orders preparing */}
                                            {order.order_source !== 'kiosk' && order.status === 'preparing' && (
                                                <>
                                                    {order.order_type === 'collection' ? (
                                                        <Button
                                                            onClick={() => handleStatusChange(order.id, 'ready_for_collection')}
                                                            className="flex-1 bg-green-600 hover:bg-green-700"
                                                        >
                                                            Ready for Collection
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            {availableDrivers.length > 0 ? (
                                                                <Select onValueChange={(driverId) => assignDriverMutation.mutate({ orderId: order.id, driverId })}>
                                                                    <SelectTrigger className="flex-1">
                                                                        <SelectValue placeholder="Assign Driver & Dispatch" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {availableDrivers.map(driver => (
                                                                            <SelectItem key={driver.id} value={driver.id}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <User className="h-4 w-4" />
                                                                                    {driver.full_name} ({driver.vehicle_type})
                                                                                </div>
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            ) : (
                                                                <Button
                                                                    onClick={() => handleStatusChange(order.id, 'out_for_delivery')}
                                                                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                                                                >
                                                                    Mark as Dispatched
                                                                </Button>
                                                            )}
                                                        </>
                                                    )}
                                                </>
                                            )}

                                            {order.status === 'out_for_delivery' && (
                                                <Button
                                                    onClick={() => handleStatusChange(order.id, 'delivered')}
                                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                                >
                                                    Mark as Delivered
                                                </Button>
                                            )}

                                            {/* Kiosk ready for collection/takeaway */}
                                            {order.order_source === 'kiosk' && order.order_status === 'ready' && (
                                                <>
                                                    <Button
                                                        disabled={true}
                                                        className="flex-1 bg-gray-400 hover:bg-gray-400 cursor-not-allowed"
                                                        title="Kiosk order status transitions handled server-side"
                                                    >
                                                        {order.order_type === 'dine_in' ? 'Mark as Served' : 'Mark as Collected'}
                                                    </Button>
                                                </>
                                            )}

                                            {/* Legacy ready for collection */}
                                            {order.order_source !== 'kiosk' && order.status === 'ready_for_collection' && (
                                                <Button
                                                    onClick={() => handleStatusChange(order.id, 'collected')}
                                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                                >
                                                    Mark as Collected
                                                </Button>
                                            )}

                                            <Button
                                                onClick={() => printOrderDetails(order.id)}
                                                variant="outline"
                                                size="icon"
                                            >
                                                <Printer className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </>
            )}

            <RejectOrderDialog
                open={!!rejectingOrder}
                onClose={() => setRejectingOrder(null)}
                onReject={(reason) => handleReject(rejectingOrder.id, reason)}
                orderNumber={rejectingOrder?.id.slice(-6)}
            />
        </div>
    );
}