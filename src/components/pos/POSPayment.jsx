import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { DollarSign, CreditCard, AlertCircle, Trash2, WifiOff, CheckCircle, XCircle, Loader2, Monitor, FileText } from 'lucide-react';
import { toast } from 'sonner';
import NumericKeypad from './NumericKeypad';
import POSDiscountPanel from './POSDiscountPanel';
import { savePendingOrder } from './POSOfflineDB';
import { publishCustomerDisplay } from './CustomerDisplay';
import { printerService } from '@/components/restaurant/PrinterService';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const QUICK_AMOUNTS = [5, 10, 20, 50];

export default function POSPayment({ cart, cartTotal, onPaymentComplete, onBackToCart, restaurantId, restaurantName, orderType, posTheme = 'dark', discount: initialDiscount, onApplyDiscount, onRemoveDiscount, restaurant }) {
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

    const cartSubtotal = cart.reduce((s, i) => s + (i.pos_price != null ? i.pos_price : i.price) * i.quantity, 0);
    // Recompute effective total from cartSubtotal to avoid stale prop
    const effectiveTotal = discount ? Math.max(0, cartSubtotal - discount.amount) : cartSubtotal;

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

    // Terminal payment flow
    const [terminalStep, setTerminalStep] = useState(null); // null | 'waiting' | 'success' | 'failed'
    const [terminalAmount, setTerminalAmount] = useState(0);

    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, effectiveTotal - totalPaid);
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
            discount,
            total: effectiveTotal,
            remaining,
            paymentMethod: activeMethod,
        });
    }, [cart, discount, effectiveTotal, remaining, activeMethod]);

    const createOrder = async (paymentSummary) => {
        if (!restaurantId) return;
        const dominantMethod = paymentSummary.length === 1 ? paymentSummary[0].method : 'cash';
        const phoneDetails = window.__phoneOrderDetails || {};
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
            discount: discount?.amount || 0,
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
            // Save to IndexedDB for later sync
            await savePendingOrder(orderData);
            return { offline: true };
        }

        await base44.entities.Order.create(orderData);
        return { offline: false };
    };

    const printReceiptAfterPayment = async (orderData, finalPayments) => {
        const config = restaurant?.printer_config;
        // Skip silently if no bluetooth printer configured
        if (!config?.bluetooth_printer?.id) return;
        try {
            const dominantMethod = finalPayments.length === 1 ? finalPayments[0].method : 'cash';
            const hasCash = finalPayments.find(p => p.method === 'cash');
            const changeAmt = Math.max(0, finalPayments.reduce((s, p) => s + p.amount, 0) - effectiveTotal);
            const fakeOrder = {
                ...orderData,
                id: Date.now().toString(),
                created_date: new Date().toISOString(),
                payment_method: dominantMethod,
                notes: hasCash && changeAmt > 0 ? `Change: £${changeAmt.toFixed(2)}` : orderData.notes,
            };
            await printerService.printReceipt(fakeOrder, restaurant, config);
        } catch (e) {
            // silently fail — don't block payment completion
            console.warn('Auto-print failed:', e.message);
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
                toast.success(
                    `Order saved offline. Will sync when connection restores.`,
                    { icon: <WifiOff className="h-4 w-4 text-yellow-400" />, duration: 4000 }
                );
            } else if (hasCash && changeNow > 0.005) {
                toast.success(`Payment complete. Change: £${changeNow.toFixed(2)}`);
            } else {
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
                discount: discount?.amount || 0,
                total: effectiveTotal,
                status: 'confirmed',
                order_type: (() => { const p = window.__phoneOrderDetails || {}; const isPh = orderType === 'phone_collection' || orderType === 'phone_delivery'; return isPh ? (orderType === 'phone_delivery' ? 'delivery' : 'collection') : (orderType || 'collection'); })(),
                payment_method: finalPayments.length === 1 ? finalPayments[0].method : 'cash',
                notes: (() => {
                    const ph = window.__phoneOrderDetails || {};
                    const isPh = orderType === 'phone_collection' || orderType === 'phone_delivery';
                    const splitNotes = finalPayments.length > 1 ? finalPayments.map(p => `${p.method}: £${p.amount.toFixed(2)}`).join(', ') : null;
                    const changeNote = hasCash && changeNow > 0.005 ? `Change: £${changeNow.toFixed(2)}` : null;
                    return [isPh && ph.notes ? ph.notes : null, isPh && ph.collectionTime && orderType === 'phone_collection' ? `Ready in: ${ph.collectionTime}` : null, splitNotes, changeNote].filter(Boolean).join(' | ') || undefined;
                })(),
                ...(() => { const ph = window.__phoneOrderDetails || {}; const isPh = orderType === 'phone_collection' || orderType === 'phone_delivery'; return { ...(isPh && ph.phone ? { phone: ph.phone } : {}), ...(isPh && ph.name ? { guest_name: ph.name } : {}), ...(isPh && ph.address ? { delivery_address: ph.address } : {}) }; })(),
            };

            await printReceiptAfterPayment(orderDataForPrint, finalPayments);
            onPaymentComplete();
        } catch (e) {
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

        if (hasConfiguredTerminal) {
            // Terminal flow: show waiting screen
            setTerminalAmount(amount);
            setTerminalStep('waiting');
        } else {
            // No terminal configured: fallback — record card payment immediately
            addPayment('card', amount);
        }
    };

    const handleTerminalSuccess = () => {
        setTerminalStep(null);
        addPayment('card', terminalAmount);
    };

    const handleTerminalFailure = () => {
        setTerminalStep(null);
        toast.error('Card payment declined or cancelled. Please try again.');
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

                {/* Reprint button — only show if printer configured */}
                {restaurant?.printer_config?.bluetooth_printer?.id && (
                    <div className="mb-2">
                        <Button
                            size="sm"
                            onClick={async () => {
                                const config = restaurant.printer_config;
                                const orderData = {
                                    id: Date.now().toString(),
                                    created_date: new Date().toISOString(),
                                    items: cart,
                                    subtotal: cartSubtotal,
                                    delivery_fee: 0,
                                    discount: discount?.amount || 0,
                                    total: effectiveTotal,
                                    payment_method: payments.length === 1 ? payments[0].method : 'cash',
                                    order_type: orderType || 'takeaway',
                                    notes: payments.length > 1 ? payments.map(p => `${p.method}: £${p.amount.toFixed(2)}`).join(', ') : undefined,
                                };
                                try {
                                    await printerService.printReceipt(orderData, restaurant, config);
                                    toast.success('Receipt printed');
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
                        t={t}
                        isDark={isDark}
                    />
                    <div className={`${t.totalBox} p-3 rounded-xl`}>
                        <p className={`${t.totalTxt} text-xs`}>Total{discount ? ` (was £${cartSubtotal.toFixed(2)})` : ''}</p>
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
                            {QUICK_AMOUNTS.map(amt => (
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
                            {QUICK_AMOUNTS.map(amt => (
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
                            Waiting for Card Terminal
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
                                            Ask customer to tap/insert card on <strong>{cardTerminal?.reader_label || 'the terminal'}</strong>
                                        </p>
                                    </div>
                                </div>
                                <p className={`${t.subtext} text-xs text-center`}>
                                    Confirm payment once the terminal shows approved, or cancel if declined.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                        <Button onClick={handleTerminalFailure} variant="outline" className={`flex-1 ${t.cancelDlg}`}>
                            <XCircle className="h-4 w-4 mr-2 text-red-500" />
                            Declined / Cancel
                        </Button>
                        <Button onClick={handleTerminalSuccess} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Payment Approved
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}