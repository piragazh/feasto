import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { DollarSign, CreditCard, AlertCircle, Trash2, WifiOff, CheckCircle, XCircle, Loader2, Monitor, FileText, Tag, Printer } from 'lucide-react';
import { toast } from 'sonner';
import NumericKeypad from './NumericKeypad';
import POSDiscountPanel from './POSDiscountPanel';
import ApplyPromotionDialog from './ApplyPromotionDialog';
import { savePendingOrder } from './POSOfflineDB';
import { publishCustomerDisplay } from './CustomerDisplay';
import { printWithCentralizedConfig, hasPrinterForChannel, openCashDrawer } from '@/lib/printUtils';
import { isNetworkError } from '@/lib/networkStatus';
import { playSuccess, playError, playAlert } from '@/lib/posSound';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Quick-cash denominations, generated from the amount still owed.
 *
 * A fixed [5, 10, 20, 50] list is wrong most of the time: on an £8.99 bill the
 * £5 button cannot cover it, and on a £62 bill every button is useless. Cashiers
 * then fall back to the keypad, which is slower and more error-prone during a rush.
 *
 * What staff are actually handed is a small number of realistic notes, so we
 * offer: the next round pound up, then the realistic UK notes above the total,
 * de-duplicated and capped at four. Every option is >= the amount owed, so no
 * button can produce a short payment.
 */
const UK_NOTES = [5, 10, 20, 50];

export function quickCashOptions(owed) {
    if (!(owed > 0)) return UK_NOTES;
    const opts = [];

    // Next whole pound (e.g. £8.99 -> £9) - the commonest "here's the coins" case
    const nextPound = Math.ceil(owed);
    if (nextPound > owed) opts.push(nextPound);

    // Next multiple of 5 (e.g. £8.99 -> £10, £62 -> £65)
    const nextFive = Math.ceil(owed / 5) * 5;
    if (nextFive > owed) opts.push(nextFive);

    // Realistic notes above the total
    for (const note of UK_NOTES) {
        if (note > owed) opts.push(note);
    }

    // Pad with progressively rounder figures so we always fill the four slots -
    // an exact total like £10.00 or £47.00 otherwise yields only one or two
    // buttons and leaves dead space in the grid.
    for (const step of [10, 20, 50, 100]) {
        const rounded = Math.ceil(owed / step) * step;
        if (rounded > owed) opts.push(rounded);
        opts.push(rounded + step);
    }

    return [...new Set(opts)].filter(v => v > owed).sort((a, b) => a - b).slice(0, 4);
}

export default function POSPayment({ cart, cartTotal, onPaymentComplete, onBackToCart, restaurantId, restaurantName, orderType, posTheme = 'dark', discount: initialDiscount, onApplyDiscount, onRemoveDiscount, restaurant, skipOrderCreation = false, existingOrderIds = null, phoneDetails = {} }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel:    isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        right:    isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        text:     isDark ? 'text-white' : 'text-gray-900',
        subtext:  isDark ? 'text-gray-300' : 'text-gray-600',
        divider:  isDark ? 'border-white/[0.06]' : 'border-gray-200',
        row:      isDark ? 'bg-white/[0.05]' : 'bg-gray-100',
        inactBtn: isDark ? 'bg-white/5 hover:bg-white/10 text-gray-200 border border-white/[0.08]' : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300',
        backBtn:  isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-900',
        cancelBtn:isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-800',
        dialog:   isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        dialogTxt:isDark ? 'text-white' : 'text-gray-900',
        dialogDesc:isDark ? 'text-gray-400' : 'text-gray-600',
        cancelDlg:isDark ? 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/[0.08]' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300',
        totalBox: isDark ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200',
        totalTxt: isDark ? 'text-blue-300' : 'text-blue-600',
        totalAmt: isDark ? 'text-white' : 'text-blue-900',
        owedBox:  isDark ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-50 border border-red-200',
        owedTxt:  isDark ? 'text-red-300' : 'text-red-600',
        owedAmt:  isDark ? 'text-white' : 'text-red-900',
        changeBox:isDark ? 'bg-green-500/10 border border-green-500/30' : 'bg-green-50 border border-green-200',
        changeTxt:isDark ? 'text-green-300' : 'text-green-600',
        changeAmt:isDark ? 'text-white' : 'text-green-900',
        cashBtn:  'bg-green-600 hover:bg-green-500 text-white',
        cardBtn:  'bg-blue-600 hover:bg-blue-500 text-white',
        cardBtn2: isDark ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200',
    };
    // Local discount state — initialised from prop (set in cart), can be changed on payment screen too
    const [discount, setDiscount] = useState(initialDiscount || null);
    const handleApplyDiscount = (d) => { setDiscount(d); if (onApplyDiscount) onApplyDiscount(d); };
    const handleRemoveDiscount = () => { setDiscount(null); if (onRemoveDiscount) onRemoveDiscount(); };

    // Coupon state — separate from manual discount; validated server-side via posValidateCoupon
    // POLICY: coupon and manual discount are mutually exclusive.
    // OFFLINE: Coupons are blocked offline to prevent bypass of limit enforcement
    const [coupon, setCoupon] = useState(null);
    const [couponDialogOpen, setCouponDialogOpen] = useState(false);
    const isOffline = !navigator.onLine;
    const handleApplyCoupon = (result) => {
        // Applying a coupon clears any active manual discount
        if (discount) {
            handleRemoveDiscount();
        }
        setCoupon(result);
    };
    const handleRemoveCoupon = () => setCoupon(null);

    const cartSubtotal = cart.reduce((s, i) => s + (i.pos_price != null ? i.pos_price : i.price) * i.quantity, 0);
    // Recompute effective total from cartSubtotal to avoid stale prop
    // Both manual discount and coupon discount are applied
    const couponDiscountAmount = coupon?.discount_amount || 0;
    const manualDiscountAmount = discount?.amount || 0;
    const effectiveTotal = Math.max(0, cartSubtotal - manualDiscountAmount - couponDiscountAmount);

    // Card terminal config from restaurant
    const cardTerminal = restaurant?.printer_config?.card_terminal;
    const hasConfiguredTerminal = !!(cardTerminal?.reader_label || cardTerminal?.reader_id);

    // Split payment: array of { method, amount }
    const [payments, setPayments] = useState([]);
    const [activeMethod, setActiveMethod] = useState(null); // 'cash' | 'card' | null
    const [rawValue, setRawValue] = useState('');
    const [showCashConfirm, setShowCashConfirm] = useState(false);
    const [showCashUnderConfirm, setShowCashUnderConfirm] = useState(false);
    const [showCardConfirm, setShowCardConfirm] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    // Success state — holds the last completed order data so the Reprint
    // Receipt button can re-trigger printing without re-running createOrder.
    const [completedOrder, setCompletedOrder] = useState(null);
    const [reprinting, setReprinting] = useState(false);

    // Terminal payment flow
    const [terminalStep, setTerminalStep] = useState(null); // null | 'waiting' | 'success' | 'failed'
    const [terminalAmount, setTerminalAmount] = useState(0);
    const [terminalTransactionRef, setTerminalTransactionRef] = useState('');
    const [terminalError, setTerminalError] = useState('');
    const terminalCancelRef = useRef(false);

    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, effectiveTotal - totalPaid);
    // Denominations recalculate as the amount owed changes (split payments, part-cash).
    const quickCash = quickCashOptions(remaining);
    const change = totalPaid - effectiveTotal;
    const numericInput = rawValue === '' ? 0 : parseInt(rawValue, 10) / 100;

    // Sync to customer display whenever relevant state changes
    React.useEffect(() => {
        publishCustomerDisplay({
            status: cart.length > 0 ? 'order' : 'idle',
            restaurantName,
            logoUrl: restaurant?.logo_url,
            items: cart,
            subtotal: cartSubtotal,
            discount: (manualDiscountAmount > 0 || couponDiscountAmount > 0)
                ? { amount: manualDiscountAmount + couponDiscountAmount }
                : null,
            total: effectiveTotal,
            remaining,
            paymentMethod: activeMethod,
        });
    }, [cart, discount, coupon, effectiveTotal, remaining, activeMethod]);

    const createOrder = async (paymentSummary) => {
        if (!restaurantId || skipOrderCreation) return { offline: false, skipped: true };
        const dominantMethod = paymentSummary.length === 1 ? paymentSummary[0].method : 'cash';
        const isPhoneOrder = orderType === 'phone_collection' || orderType === 'phone_delivery';
        const splitNotes = paymentSummary.length > 1
            ? paymentSummary.map(p => `${p.method}: £${p.amount.toFixed(2)}`).join(', ')
            : undefined;
        const orderNotes = [
            isPhoneOrder && phoneDetails.notes ? phoneDetails.notes : null,
            isPhoneOrder && phoneDetails.collectionTime && orderType === 'phone_collection' ? `Ready in: ${phoneDetails.collectionTime}` : null,
            splitNotes,
        ].filter(Boolean).join(' | ') || undefined;

        const orderData = {
            restaurant_id: restaurantId,
            restaurant_name: restaurantName || 'POS Order',
            items: cart.map(item => ({
                menu_item_id: item.menu_item_id || item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                customizations: item.customizations || {}
            })),
            subtotal: cartSubtotal,
            delivery_fee: 0,
            // Manual discount — server re-validates in posCreateOrder
            discount: discount?.amount || 0,
            discount_reason_code: discount?.reason_code || undefined,
            // Coupon — server re-validates + increments usage_count in posCreateOrder
            coupon_code: coupon?.coupon_code || undefined,
            total: effectiveTotal,
            status: 'confirmed',
            order_type: isPhoneOrder ? (orderType === 'phone_delivery' ? 'delivery' : 'collection') : (orderType || 'collection'),
            payment_method: dominantMethod,
            notes: orderNotes,
            ...(isPhoneOrder && phoneDetails.phone ? { phone: phoneDetails.phone } : {}),
            ...(isPhoneOrder && phoneDetails.name ? { guest_name: phoneDetails.name } : {}),
            ...(isPhoneOrder && phoneDetails.address ? { delivery_address: phoneDetails.address } : {}),
        };

        if (!navigator.onLine) {
            // Save to IndexedDB for later sync (offline path — coupon limits won't be enforced until sync)
            await savePendingOrder(orderData);
            return { offline: true };
        }

        // Route through posCreateOrder — server validates coupon, writes coupon_code, increments usage_count
        //
        // CRITICAL: navigator.onLine only reports whether a network interface is
        // up — it is `true` when the restaurant's WiFi is fine but the internet
        // (or our backend) is unreachable, which is the most common real-world
        // failure. Without this catch, the invoke throws, the payment aborts, and
        // the order is LOST after cash has already been taken. Any network-level
        // failure therefore falls back to the offline queue rather than losing
        // the sale; it will sync (idempotently, via offline_id) on reconnect.
        try {
            await base44.functions.invoke('posCreateOrder', orderData);
            return { offline: false };
        } catch (err) {
            if (isNetworkError(err)) {
                console.warn('[POS-PAYMENT] Backend unreachable despite navigator.onLine — queueing order offline:', err?.message || err);
                await savePendingOrder(orderData);
                return { offline: true, degraded: true };
            }
            // A genuine server-side rejection (validation, auth, tenant check) is
            // NOT a connectivity problem — surface it rather than silently
            // queueing an order the server has already refused.
            throw err;
        }
    };

    const printReceiptAfterPayment = async (orderData, finalPayments) => {
        try {
            const dominantMethod = finalPayments.length === 1 ? finalPayments[0].method : 'cash';
            const hasCash = finalPayments.find(p => p.method === 'cash');
            const changeAmt = Math.max(0, finalPayments.reduce((s, p) => s + p.amount, 0) - effectiveTotal);
            // Cash tendered / change are passed as real fields rather than being
            // stuffed into the notes string, so the receipt builder can lay them
            // out properly (and so kitchen tickets can ignore them).
            const cashTendered = finalPayments
                .filter(p => p.method === 'cash')
                .reduce((sum, p) => sum + (p.amount || 0), 0);
            const printOrder = {
                ...orderData,
                id: existingOrderIds?.[0] || Date.now().toString(),
                created_date: new Date().toISOString(),
                payment_method: dominantMethod,
                cash_tendered: hasCash ? cashTendered : 0,
                change_due: hasCash ? changeAmt : 0,
                notes: orderData.notes,
            };
            const result = await printWithCentralizedConfig(printOrder, restaurant, 'pos_order');
            if (result.printed.length === 0) {
                console.error('[POS-PRINT] Receipt auto-print failed after payment:', result.failed, { restaurantId, orderTotal: effectiveTotal });
                toast.error('Receipt did not print — use Reprint button to retry', { duration: 6000 });
            }
            return result;
        } catch (e) {
            console.error('[POS-PRINT] Receipt auto-print failed after payment:', e?.message || e, { restaurantId, orderTotal: effectiveTotal });
            toast.error('Receipt did not print — use Reprint button to retry', { duration: 6000 });
            return { printed: [], failed: [e?.message || 'error'] };
        }
    };

    // Reprint the last completed order's receipt — one-tap retry from the
    // payment success view. Reuses the same centralized print dispatch.
    const handleReprintReceipt = async () => {
        if (!completedOrder) return;
        setReprinting(true);
        try {
            const result = await printWithCentralizedConfig(completedOrder, restaurant, 'pos_order');
            if (result.printed.length > 0) {
                toast.success('Receipt reprinted');
            } else {
                toast.error('Reprint failed — check printer connection', { duration: 6000 });
            }
        } catch (e) {
            toast.error('Reprint failed: ' + (e?.message || 'unknown error'));
        } finally {
            setReprinting(false);
        }
    };

    const completePayment = async (finalPayments) => {
        setIsProcessing(true);
        try {
            const result = await createOrder(finalPayments);
            const hasCash = finalPayments.find(p => p.method === 'cash');
            const totalPaidNow = finalPayments.reduce((s, p) => s + p.amount, 0);
            const changeNow = Math.max(0, totalPaidNow - effectiveTotal);

            if (result?.offline) {
                playAlert();
                toast.success(
                    `Order saved offline. Will sync when connection restores.`,
                    { icon: <WifiOff className="h-4 w-4 text-yellow-400" />, duration: 4000 }
                );
            } else if (hasCash && changeNow > 0.005) {
                playSuccess();
                toast.success(`Payment complete. Change: £${changeNow.toFixed(2)}`);
            } else {
                playSuccess();
                toast.success('Payment complete');
            }
            publishCustomerDisplay({
                status: 'paid',
                restaurantName,
                change: changeNow,
            });

                    // Reuse the same shape that createOrder builds — no duplication
            const orderDataForPrint = {
                restaurant_id: restaurantId,
                restaurant_name: restaurantName || 'POS Order',
                items: cart.map(i => ({ menu_item_id: i.menu_item_id || i.id, name: i.name, price: i.price, quantity: i.quantity, customizations: i.customizations || {} })),
                subtotal: cartSubtotal,
                delivery_fee: 0,
                discount: manualDiscountAmount + couponDiscountAmount,
                coupon_code: coupon?.coupon_code || undefined,
                total: effectiveTotal,
                status: 'confirmed',
                order_type: (() => { const isPh = orderType === 'phone_collection' || orderType === 'phone_delivery'; return isPh ? (orderType === 'phone_delivery' ? 'delivery' : 'collection') : (orderType || 'collection'); })(),
                payment_method: finalPayments.length === 1 ? finalPayments[0].method : 'cash',
                notes: (() => {
                    const isPh = orderType === 'phone_collection' || orderType === 'phone_delivery';
                    const splitNotes = finalPayments.length > 1 ? finalPayments.map(p => `${p.method}: £${p.amount.toFixed(2)}`).join(', ') : null;
                    const changeNote = hasCash && changeNow > 0.005 ? `Change: £${changeNow.toFixed(2)}` : null;
                    return [isPh && phoneDetails.notes ? phoneDetails.notes : null, isPh && phoneDetails.collectionTime && orderType === 'phone_collection' ? `Ready in: ${phoneDetails.collectionTime}` : null, splitNotes, changeNote].filter(Boolean).join(' | ') || undefined;
                })(),
                ...(() => { const isPh = orderType === 'phone_collection' || orderType === 'phone_delivery'; return { ...(isPh && phoneDetails.phone ? { phone: phoneDetails.phone } : {}), ...(isPh && phoneDetails.name ? { guest_name: phoneDetails.name } : {}), ...(isPh && phoneDetails.address ? { delivery_address: phoneDetails.address } : {}) }; })(),
            };

            await printReceiptAfterPayment(orderDataForPrint, finalPayments);
            // Open cash drawer after the receipt prints (via QZ Tray if available)
            if (hasCash) {
                try { await openCashDrawer(restaurant); } catch (e) { console.warn('[POS] Cash drawer open failed:', e.message); }
            }
            // Store the completed order so the success view can offer a Reprint
            // button — staff can retry printing in one tap if the auto-print failed.
            // Include the cash fields so a Reprint reproduces the ORIGINAL receipt
            // exactly, change line included - a reprint that silently drops the
            // change is worse than no reprint when a customer is querying it.
            setCompletedOrder({
                ...orderDataForPrint,
                cash_tendered: hasCash ? finalPayments.filter(p => p.method === 'cash').reduce((s, p) => s + (p.amount || 0), 0) : 0,
                change_due: hasCash ? changeNow : 0,
            });
            // If no printer is configured, skip the success view and complete immediately
            // (no reprint possible, so no point showing the button).
            if (!hasPrinterForChannel(restaurant, 'pos_order')) {
                onPaymentComplete();
            }
        } catch (e) {
            playError();
            toast.error('Payment failed: ' + (e?.message || 'Unknown error'));
        } finally {
            setIsProcessing(false);
        }
    };

    // Add a payment entry
    const addPayment = (method, amount) => {
        if (amount <= 0) return;
        const allPayments = [...payments, { method, amount }];
        setPayments(allPayments);
        setActiveMethod(null);
        setRawValue('');

        const newTotalPaid = allPayments.reduce((s, p) => s + p.amount, 0);
        if (newTotalPaid >= effectiveTotal) {
            // Auto complete
            completePayment(allPayments);
        }
    };

    const removePayment = (idx) => {
        setPayments(prev => prev.filter((_, i) => i !== idx));
    };

    // Cash quick button — always pre-fill keypad and show confirm dialog
    const handleQuickCash = (amount) => {
        setActiveMethod('cash');
        setRawValue(String(Math.round(amount * 100)));
        setShowCashConfirm(true);
    };

    const handleCashConfirm = () => {
        if (numericInput <= 0) {
            toast.error('Enter an amount');
            return;
        }
        // Warn if cash given is less than amount owed
        if (numericInput < remaining - 0.001) {
            setShowCashUnderConfirm(true);
            return;
        }
        // Confirm full/over cash payment
        setShowCashConfirm(true);
    };

    // Card confirm — route through terminal if configured
    const processCard = async () => {
        const amount = numericInput > 0 ? numericInput : remaining;
        setShowCardConfirm(false);
        terminalCancelRef.current = false;

        if (hasConfiguredTerminal) {
            setTerminalAmount(amount);
            const txnRef = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            setTerminalTransactionRef(txnRef);
            setTerminalError('');
            setTerminalStep('waiting');
            await sendToTerminal(amount, txnRef);
        } else {
            addPayment('card', amount);
        }
    };

    const sendToTerminal = async (amount, txnRef) => {
        try {
            const response = await base44.functions.invoke('processCardTerminal', {
                restaurantId,
                amount,
                terminalConfig: cardTerminal,
                transactionRef: txnRef
            });
            if (terminalCancelRef.current) return; // User cancelled while waiting
            if (response.data?.success) {
                handleTerminalSuccess();
            } else {
                setTerminalError(response.data?.error || 'Transaction failed');
                setTerminalStep('failed');
            }
        } catch (error) {
            if (terminalCancelRef.current) return;
            setTerminalError('Failed to communicate with terminal: ' + (error.message || 'Unknown error'));
            setTerminalStep('failed');
        }
    };

    const handleTerminalSuccess = () => {
        setTerminalStep('success');
        setTimeout(() => {
            setTerminalStep(null);
            addPayment('card', terminalAmount);
            toast.success(`Card payment approved (Ref: ${terminalTransactionRef})`);
        }, 1500);
    };

    const handleTerminalFailure = () => {
        setTerminalStep(null);
        toast.error(terminalError || 'Card payment declined. Please try again.');
    };

    const handleTerminalRetry = async () => {
        setTerminalError('');
        setTerminalStep('waiting');
        await sendToTerminal(terminalAmount, terminalTransactionRef);
    };

    if (cart.length === 0) {
        return (
            <div className={`flex items-center justify-center h-64 ${t.panel} rounded-lg border`}>
                <p className={`${t.subtext} text-lg`}>No items to pay for</p>
            </div>
        );
    }

    return (
        <div className={`grid grid-cols-2 gap-4 h-full ${t.bg}`}>
            {/* LEFT: Summary */}
            <div className={`${t.panel} rounded-lg border p-4 flex flex-col`}>
                <div className="flex justify-between items-center mb-3">
                    <h2 className={`${t.text} font-bold text-lg`}>Order Summary</h2>
                    {onBackToCart && (
                        <Button onClick={onBackToCart} size="sm" className={`${t.backBtn} h-8 px-3 text-sm`}>
                            ← Back
                        </Button>
                    )}
                </div>

                <div className="space-y-1 flex-1 overflow-y-auto mb-3">
                    {cart.map(item => (
                        <div key={item.id} className={`flex justify-between ${t.subtext} text-sm`}>
                            <span>{item.quantity}x {item.name}</span>
                            <span>£{((item.pos_price != null ? item.pos_price : item.price) * item.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                </div>

                {/* Reprint button — only show if a POS printer is configured */}
                {hasPrinterForChannel(restaurant, 'pos_order') && (
                    <div className="mb-2">
                        <Button
                            size="sm"
                            onClick={async () => {
                                const orderData = {
                                    id: Date.now().toString(),
                                    created_date: new Date().toISOString(),
                                    items: cart,
                                    subtotal: cartSubtotal,
                                    delivery_fee: 0,
                                    discount: manualDiscountAmount + couponDiscountAmount,
                                    total: effectiveTotal,
                                    payment_method: payments.length === 1 ? payments[0].method : 'cash',
                                    order_type: orderType || 'takeaway',
                                    notes: payments.length > 1 ? payments.map(p => `${p.method}: £${p.amount.toFixed(2)}`).join(', ') : undefined,
                                };
                                try {
                                    const result = await printWithCentralizedConfig(orderData, restaurant, 'pos_order');
                                    if (result.printed.length > 0) {
                                        toast.success(`Printed via ${result.printed.map(p => p.name).join(', ')}`);
                                    } else {
                                        toast.error(result.failed[0]?.error || 'No printer available');
                                    }
                                } catch (e) {
                                    toast.error('Print failed: ' + e.message);
                                }
                            }}
                            className={`w-full h-9 text-xs font-semibold ${t.inactBtn}`}
                        >
                            <FileText className="h-3.5 w-3.5 mr-1.5" /> Print Receipt
                        </Button>
                    </div>
                )}

                {/* Totals */}
                <div className={`border-t ${t.divider} pt-3 space-y-2`}>
                    <POSDiscountPanel
                        cartSubtotal={cartSubtotal}
                        discount={discount}
                        onApply={handleApplyDiscount}
                        onRemove={handleRemoveDiscount}
                        restaurantId={restaurantId}
                        t={t}
                        isDark={isDark}
                        couponActive={!!coupon}
                        isOffline={isOffline}
                    />

                    {/* Coupon section — server-validated, mutually exclusive with manual discount */}
                    {coupon ? (
                        <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${isDark ? 'bg-green-500/10 border border-green-500/30' : 'bg-green-50 border border-green-200'}`}>
                            <div className="flex items-center gap-2">
                                <Tag className="h-3.5 w-3.5 text-green-500" />
                                <span className={`text-xs font-semibold ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                                    {coupon.coupon_code}
                                </span>
                                <span className={`text-xs ${isDark ? 'text-green-300' : 'text-green-600'}`}>
                                    −£{coupon.discount_amount.toFixed(2)}
                                </span>
                            </div>
                            <button onClick={handleRemoveCoupon} className="text-red-400 hover:text-red-300 transition-colors">
                                <XCircle className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ) : discount ? (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${isDark ? 'bg-white/5 border-white/[0.08] text-gray-500' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                            <span>Manual discount applied — remove it to add a coupon</span>
                        </div>
                    ) : isOffline ? (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${isDark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-600'}`}>
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span>Coupons unavailable offline. Full price applies.</span>
                        </div>
                    ) : (
                        <button
                            onClick={() => setCouponDialogOpen(true)}
                            className={`w-full flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold border transition-colors ${
                                isDark
                                    ? 'bg-white/5 hover:bg-white/10 border-white/[0.08] text-gray-400 hover:text-orange-400'
                                    : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-500 hover:text-orange-500'
                            }`}
                        >
                            <Tag className="h-3.5 w-3.5" />
                            Add Coupon
                        </button>
                    )}

                    <div className={`${t.totalBox} p-3 rounded-xl`}>
                        <p className={`${t.totalTxt} text-xs`}>
                            Total{(manualDiscountAmount > 0 || couponDiscountAmount > 0) ? ` (was £${cartSubtotal.toFixed(2)})` : ''}
                        </p>
                        <p className={`${t.totalAmt} text-3xl font-bold`}>£{effectiveTotal.toFixed(2)}</p>
                    </div>

                    {payments.length > 0 && (
                        <>
                            <div className="space-y-1">
                                {payments.map((p, i) => (
                                    <div key={i} className={`flex items-center justify-between ${t.row} rounded px-3 py-1.5`}>
                                        <span className={`${t.subtext} text-sm capitalize`}>{p.method}</span>
                                        <span className={`${t.text} text-sm font-semibold`}>£{p.amount.toFixed(2)}</span>
                                        <button onClick={() => removePayment(i)} className="text-red-400 hover:text-red-300 ml-2">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {remaining > 0 ? (
                                <div className={`${t.owedBox} p-2.5 rounded-xl`}>
                                    <p className={`${t.owedTxt} text-xs`}>Still owed</p>
                                    <p className={`${t.owedAmt} text-2xl font-bold`}>£{remaining.toFixed(2)}</p>
                                </div>
                            ) : (
                                <div className={`${t.changeBox} p-2.5 rounded-xl`}>
                                    <p className={`${t.changeTxt} text-xs`}>Change</p>
                                    <p className={`${t.changeAmt} text-2xl font-bold`}>£{Math.max(0, totalPaid - effectiveTotal).toFixed(2)}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* RIGHT: Payment */}
            <div className={`${t.right} rounded-lg border p-4 flex flex-col overflow-y-auto`}>
                {/* Method buttons */}
                {!activeMethod && (
                    <>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <Button onClick={() => setActiveMethod('cash')}
                                className={`h-14 text-lg font-bold ${t.cashBtn}`}>
                                <DollarSign className="h-5 w-5 mr-1" /> Cash
                            </Button>
                            <Button onClick={() => setActiveMethod('card')}
                                className={`h-14 text-lg font-bold ${t.cardBtn}`}>
                                <CreditCard className="h-5 w-5 mr-1" /> Card
                            </Button>
                        </div>

                        <p className={`${t.subtext} text-xs mb-2`}>Quick cash</p>
                        <div className="grid grid-cols-4 gap-2 mb-4">
                            {quickCash.map(amt => (
                                <Button key={amt} onClick={() => handleQuickCash(amt)} className={`h-10 text-base font-bold ${t.inactBtn}`}>
                                    £{amt}
                                </Button>
                            ))}
                        </div>

                        <Button onClick={() => {
                            const pence = Math.round(remaining * 100);
                            setRawValue(pence > 0 ? String(pence) : '');
                            setActiveMethod('cash');
                            setShowCashConfirm(true);
                        }} className={`w-full h-10 text-sm font-bold ${t.inactBtn} mb-3`}>
                            Exact Cash (£{remaining.toFixed(2)})
                        </Button>

                        <Button onClick={() => {
                            setRawValue(String(Math.round(remaining * 100)));
                            setActiveMethod('card');
                            setShowCardConfirm(true);
                        }} className={`w-full h-10 text-sm font-bold ${t.cardBtn}`}>
                            Charge £{remaining.toFixed(2)} to Card
                        </Button>
                    </>
                )}

                {/* Cash keypad */}
                {activeMethod === 'cash' && (
                    <div className="flex flex-col gap-2">
                        <p className="text-green-500 text-sm font-semibold">Cash payment — enter amount</p>
                        <div className="grid grid-cols-4 gap-1.5 mb-1">
                            {quickCash.map(amt => (
                                <Button key={amt} onClick={() => setRawValue(String(amt * 100))}
                                    className={`h-9 text-sm font-bold ${numericInput === amt ? 'bg-green-600 text-white border-green-600' : t.inactBtn}`}>
                                    £{amt}
                                </Button>
                            ))}
                        </div>
                        <NumericKeypad rawValue={rawValue} onRawChange={setRawValue} onComplete={handleCashConfirm} />
                        <Button onClick={() => { setActiveMethod(null); setRawValue(''); }} className={`w-full h-9 text-sm ${t.cancelBtn} mt-1`}>
                            Cancel
                        </Button>
                    </div>
                )}

                {/* Card — ask amount or full */}
                {activeMethod === 'card' && (
                    <div className="flex flex-col gap-3">
                        <p className="text-blue-500 text-sm font-semibold">Card payment</p>
                        <div className="grid grid-cols-2 gap-3">
                            <Button onClick={() => { setRawValue(String(Math.round(remaining * 100))); setShowCardConfirm(true); }}
                                className={`h-14 text-sm font-bold ${t.cardBtn}`}>
                                Full remaining<br/>£{remaining.toFixed(2)}
                            </Button>
                            <Button onClick={() => setShowCardConfirm(true)} disabled={numericInput <= 0}
                                className={`h-14 text-sm font-bold ${t.cardBtn2}`}>
                                Custom amount<br/>{numericInput > 0 ? `£${numericInput.toFixed(2)}` : '(enter below)'}
                            </Button>
                        </div>
                        <NumericKeypad rawValue={rawValue} onRawChange={setRawValue} onComplete={() => setShowCardConfirm(true)} />
                        <Button onClick={() => { setActiveMethod(null); setRawValue(''); }} className={`w-full h-9 text-sm ${t.cancelBtn}`}>
                            Cancel
                        </Button>
                    </div>
                )}
            </div>

            {/* Cash confirm dialog */}
            <AlertDialog open={showCashConfirm} onOpenChange={setShowCashConfirm}>
                <AlertDialogContent className={`${t.dialog} border`}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className={`${t.dialogTxt} flex items-center gap-2`}>
                            <AlertCircle className="h-5 w-5 text-green-500" />
                            Confirm Cash Payment
                        </AlertDialogTitle>
                        <AlertDialogDescription className={t.dialogDesc}>
                            Process cash payment of £{numericInput.toFixed(2)}?
                            {numericInput > remaining + 0.001 && (
                                <span className="block mt-1 font-semibold text-orange-400">
                                    Change due: £{(numericInput - remaining).toFixed(2)}
                                </span>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className={t.cancelDlg}>Go Back</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { setShowCashConfirm(false); addPayment('cash', numericInput); }} className="bg-green-600 hover:bg-green-700 text-white">
                            Process £{numericInput.toFixed(2)}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Cash under-amount confirm dialog */}
            <AlertDialog open={showCashUnderConfirm} onOpenChange={setShowCashUnderConfirm}>
                <AlertDialogContent className={`${t.dialog} border`}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className={`${t.dialogTxt} flex items-center gap-2`}>
                            <AlertCircle className="h-5 w-5 text-orange-400" />
                            Cash Under Total
                        </AlertDialogTitle>
                        <AlertDialogDescription className={t.dialogDesc}>
                            You entered £{numericInput.toFixed(2)} but £{remaining.toFixed(2)} is still owed. Accept as partial payment?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className={t.cancelDlg}>Go Back</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { setShowCashUnderConfirm(false); addPayment('cash', numericInput); }} className="bg-orange-500 hover:bg-orange-600 text-white">
                            Accept Partial
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Card Confirm Dialog */}
            <AlertDialog open={showCardConfirm} onOpenChange={setShowCardConfirm}>
                <AlertDialogContent className={`${t.dialog} border`}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className={`${t.dialogTxt} flex items-center gap-2`}>
                            <AlertCircle className="h-5 w-5 text-blue-500" />
                            {hasConfiguredTerminal ? 'Send to Card Terminal?' : 'Confirm Card Payment'}
                        </AlertDialogTitle>
                        <AlertDialogDescription className={t.dialogDesc}>
                            {hasConfiguredTerminal ? (
                                <>
                                    Send <strong>£{(numericInput > 0 ? numericInput : remaining).toFixed(2)}</strong> to terminal <strong>{cardTerminal.reader_label || cardTerminal.reader_id}</strong>? The customer will tap/insert their card on the terminal.
                                </>
                            ) : (
                                <>Process card payment for £{(numericInput > 0 ? numericInput : remaining).toFixed(2)}?</>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className={t.cancelDlg}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={processCard} disabled={isProcessing}
                            className="bg-blue-600 hover:bg-blue-700 text-white">
                            {hasConfiguredTerminal ? `Send £${(numericInput > 0 ? numericInput : remaining).toFixed(2)} to Terminal` : (isProcessing ? 'Processing...' : 'Confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Terminal waiting screen */}
            <AlertDialog open={terminalStep === 'waiting'}>
                <AlertDialogContent className={`${t.dialog} border`}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className={`${t.dialogTxt} flex items-center gap-2`}>
                            <Monitor className="h-5 w-5 text-blue-400" />
                            Sending to Card Terminal
                        </AlertDialogTitle>
                        <AlertDialogDescription className={t.dialogDesc} asChild>
                            <div className="space-y-4">
                                <div className="flex flex-col items-center py-6 gap-4">
                                    <div className="relative">
                                        <div className="w-20 h-20 rounded-full bg-blue-500/10 border-2 border-blue-500/30 flex items-center justify-center">
                                            <CreditCard className="h-9 w-9 text-blue-400" />
                                        </div>
                                        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                                    </div>
                                    <div className="text-center">
                                        <p className={`text-2xl font-bold ${t.text}`}>£{terminalAmount.toFixed(2)}</p>
                                        <p className={`${t.subtext} text-sm mt-1`}>
                                            Processing on <strong>{cardTerminal?.reader_label || 'the terminal'}</strong>
                                        </p>
                                    </div>
                                </div>
                                <p className={`${t.subtext} text-xs text-center`}>
                                    Customer should tap or insert their card.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button
                            onClick={() => {
                                terminalCancelRef.current = true;
                                setTerminalStep(null);
                                setActiveMethod(null);
                                toast.info('Card payment cancelled');
                            }}
                            variant="outline"
                            className={`flex-1 ${t.cancelDlg}`}
                        >
                            Cancel
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Terminal success screen */}
            <AlertDialog open={terminalStep === 'success'}>
                <AlertDialogContent className={`${isDark ? 'bg-[#151720] border-green-500/30' : 'bg-white border-green-200'} border`}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className={`${t.dialogTxt} flex items-center gap-2`}>
                            <CheckCircle className="h-6 w-6 text-green-500" />
                            Payment Approved
                        </AlertDialogTitle>
                        <AlertDialogDescription className={t.dialogDesc} asChild>
                            <div className="space-y-3">
                                <div className="text-center py-4">
                                    <p className={`text-3xl font-bold text-green-500`}>£{terminalAmount.toFixed(2)}</p>
                                    <p className={`${t.subtext} text-sm mt-2`}>Transaction approved</p>
                                    <p className={`${t.subtext} text-xs mt-1 font-mono`}>{terminalTransactionRef}</p>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                </AlertDialogContent>
            </AlertDialog>

            {/* Coupon picker dialog — disabled offline */}
            {!isOffline && (
                <ApplyPromotionDialog
                    open={couponDialogOpen}
                    onClose={() => setCouponDialogOpen(false)}
                    onApplyCoupon={handleApplyCoupon}
                    restaurantId={restaurantId}
                    cartSubtotal={cartSubtotal}
                    customerPhone={phoneDetails?.phone || null}
                    customerEmail={null}
                    hasManualDiscount={!!discount}
                    posTheme={posTheme}
                />
            )}

            {/* Terminal failed screen */}
            <AlertDialog open={terminalStep === 'failed'}>
                <AlertDialogContent className={`${isDark ? 'bg-[#151720] border-red-500/30' : 'bg-white border-red-200'} border`}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className={`${t.dialogTxt} flex items-center gap-2`}>
                            <XCircle className="h-6 w-6 text-red-500" />
                            Transaction Failed
                        </AlertDialogTitle>
                        <AlertDialogDescription className={t.dialogDesc} asChild>
                            <div className="space-y-4">
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                                    <p className="text-red-400 text-sm font-medium">{terminalError || 'Card was declined'}</p>
                                </div>
                                <p className={`${t.subtext} text-xs`}>Try another payment method or card.</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                        <Button onClick={() => { setTerminalStep(null); setActiveMethod(null); }} variant="outline" className={`flex-1 ${t.cancelDlg}`}>
                            Back to Methods
                        </Button>
                        <Button onClick={handleTerminalRetry} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
                            Retry
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Payment success view — Reprint Receipt + New Order */}
            {completedOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className={`${t.dialog} border rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl`}>
                        <div className="w-16 h-16 rounded-full bg-green-500/15 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="h-9 w-9 text-green-500" />
                        </div>
                        <h3 className={`${t.text} text-xl font-bold mb-1`}>Payment Complete</h3>
                        <p className={`${t.subtext} text-sm mb-6`}>
                            £{effectiveTotal.toFixed(2)} — {completedOrder.payment_method || 'paid'}
                        </p>
                        <div className="flex flex-col gap-2">
                            <Button
                                onClick={handleReprintReceipt}
                                disabled={reprinting}
                                variant="outline"
                                className={`w-full h-11 ${t.cancelDlg}`}
                            >
                                {reprinting ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Printer className="h-4 w-4 mr-2" />
                                )}
                                Reprint Receipt
                            </Button>
                            <Button
                                onClick={() => { setCompletedOrder(null); onPaymentComplete(); }}
                                className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white"
                            >
                                New Order
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}