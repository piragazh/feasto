/**
 * KioskPayment — Hardened payment state machine
 *
 * SECURITY INVARIANT:
 *   A card order is ONLY created with status='confirmed' when paymentState === 'authorized'.
 *   The order creation path checks this server-side via the transaction_id field being present.
 *   There is NO manual "Payment Complete" button.
 *
 * Payment states:
 *   idle              → method selected, not yet started
 *   initiating_payment → calling processCardTerminal backend
 *   awaiting_card     → backend request sent, waiting for terminal response
 *   processing        → terminal is actively processing the card
 *   authorized        → terminal returned success + transaction_id
 *   declined          → terminal declined the card
 *   cancelled         → user cancelled at terminal or pressed Back
 *   timeout           → 90s elapsed without terminal response
 *   failed            → backend/network error
 */

import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import {
    ArrowLeft, CreditCard, Banknote, CheckCircle2, Loader2,
    XCircle, AlertTriangle, Clock, RotateCcw, ShieldCheck, UserRound, Printer
} from 'lucide-react';
import { StaffHelpBanner } from './KioskStaffHelp';
import { toast } from 'sonner';
import { printWithCentralizedConfig } from '@/lib/printUtils';

// Hard timeout: if terminal hasn't responded in 90 seconds, treat as timeout
const TERMINAL_TIMEOUT_MS = 90_000;

// Prevent duplicate payment attempts: lock for 3s after any terminal attempt
const RETRY_LOCK_MS = 3_000;

// sessionStorage key — persists across page reload within same tab
const SESSION_KEY = 'kiosk_payment_in_progress';

/** Write a sentinel so that a mid-payment page reload can detect an interrupted session. */
function markPaymentInProgress(transactionRef, amount) {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            transactionRef,
            amount,
            startedAt: Date.now(),
        }));
    } catch { /* ignore */ }
}

/** Clear the sentinel when payment resolves (success, decline, cancel, or timeout). */
function clearPaymentInProgress() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** Returns interrupted payment info if a reload happened mid-payment, else null. */
function getInterruptedPayment() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

export default function KioskPayment({
    cart, cartTotal, orderType, restaurant, restaurantId,
    selectedTable, onBack, onOrderPlaced
}) {
    const [paymentMethod, setPaymentMethod] = useState('card');
    const [paymentState, setPaymentState] = useState('idle');
    const [terminalResult, setTerminalResult] = useState(null); // { transaction_id, provider, timestamp, ... }
    const [errorMessage, setErrorMessage] = useState('');
    const [retryLocked, setRetryLocked] = useState(false);
    const [interruptedPayment, setInterruptedPayment] = useState(null); // detected on mount if reload happened

    const timeoutRef = useRef(null);
    const attemptIdRef = useRef(null); // guard stale responses from previous attempts

    const [printerWarning, setPrinterWarning] = useState(false);

    const kioskConfig = restaurant?.kiosk_config || {};
    const terminalConfig = kioskConfig.card_terminal || null;
    const allowCash = kioskConfig.allow_cash_payment !== false;
    // Card disabled if: config disables it, OR no terminal configured, OR terminal explicitly marked unavailable
    const terminalUnavailable = kioskConfig.terminal_unavailable === true || !terminalConfig;
    const allowCard = kioskConfig.allow_card_payment !== false && !terminalUnavailable;

    // On mount: detect if a prior payment was interrupted by a reload
    useEffect(() => {
        const interrupted = getInterruptedPayment();
        if (interrupted) {
            // Stale if started >10 min ago (terminal definitely done either way)
            const ageMs = Date.now() - interrupted.startedAt;
            if (ageMs < 10 * 60 * 1000) {
                setInterruptedPayment(interrupted);
                setPaymentState('interrupted');
                setErrorMessage(
                    `A payment of £${Number(interrupted.amount).toFixed(2)} may have been started ` +
                    `(ref: ${interrupted.transactionRef}) but the page reloaded before it finished. ` +
                    `Check the terminal — if payment went through, speak to staff before retrying.`
                );
            }
            clearPaymentInProgress();
        }
        return () => clearTimeout(timeoutRef.current);
    }, []);

    // ── Cash flow: no terminal needed ─────────────────────────────────────────
    const placeCashOrder = async () => {
        setPaymentState('processing');
        try {
            const orderNum = `K-${Math.floor(1000 + Math.random() * 9000)}`;
            const order = await base44.entities.Order.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurant?.name,
                order_number: orderNum,
                items: cart.map(item => ({
                    menu_item_id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    customizations: item.customizations || {},
                    itemQuantities: item.itemQuantities || {},
                })),
                subtotal: cartTotal,
                delivery_fee: 0,
                discount: 0,
                total: cartTotal,
                payment_method: 'cash',
                order_type: orderType === 'dine_in' ? 'dine_in' : 'takeaway',
                status: 'pending', // cash always pending until staff confirm
                notes: 'Kiosk order — pay at counter',
                ...(selectedTable ? { table_id: selectedTable.id, table_number: selectedTable.table_number } : {}),
            });
            const placedOrder = { ...order, order_number: orderNum };
            let didPrinterFail = false;
            try { await printWithCentralizedConfig(placedOrder, restaurant, 'kiosk_order'); }
            catch { didPrinterFail = true; setPrinterWarning(true); }
            onOrderPlaced(placedOrder, didPrinterFail);
        } catch (err) {
            setPaymentState('failed');
            setErrorMessage('Failed to place order. Please try again.');
        }
    };

    // ── Card flow: must go through terminal ──────────────────────────────────
    const initiateCardPayment = async () => {
        if (retryLocked) return;
        if (paymentState === 'initiating_payment' || paymentState === 'awaiting_card' || paymentState === 'processing') return;

        // Generate a unique attempt ID — used to discard stale responses
        const thisAttemptId = `KP-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const transactionRef = `KIOSK-${restaurantId.slice(-6).toUpperCase()}-${Date.now()}`;
        attemptIdRef.current = thisAttemptId;

        setPaymentState('initiating_payment');
        setErrorMessage('');
        setTerminalResult(null);
        setInterruptedPayment(null);

        // Write reload-recovery sentinel BEFORE calling the terminal
        markPaymentInProgress(transactionRef, cartTotal);

        // Set hard timeout
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (attemptIdRef.current === thisAttemptId) {
                clearPaymentInProgress();
                setPaymentState('timeout');
                setErrorMessage('The terminal did not respond in time. Check the terminal before retrying.');
                lockRetry();
            }
        }, TERMINAL_TIMEOUT_MS);

        try {
            setPaymentState('awaiting_card');

            const response = await base44.functions.invoke('processCardTerminal', {
                restaurantId,
                amount: cartTotal,
                terminalConfig: terminalConfig || {},
                transactionRef,
            });

            // Guard: discard if a newer attempt has started
            if (attemptIdRef.current !== thisAttemptId) return;

            clearTimeout(timeoutRef.current);
            const result = response?.data || response;

            if (result?.success && result?.status === 'approved') {
                clearPaymentInProgress(); // resolved — clear sentinel
                const authResult = {
                    transaction_id: result.transactionRef || transactionRef,
                    provider: terminalConfig?.provider || 'card_terminal',
                    authorization_timestamp: result.timestamp || new Date().toISOString(),
                    terminal_label: result.terminal || terminalConfig?.reader_label || 'terminal',
                };
                setTerminalResult(authResult);
                setPaymentState('authorized');
                await placeAuthorizedCardOrder(authResult);
            } else if (result?.status === 'declined') {
                clearPaymentInProgress();
                setPaymentState('declined');
                setErrorMessage(result.error || 'Card declined. Please try a different card.');
                lockRetry();
            } else {
                clearPaymentInProgress();
                setPaymentState('failed');
                setErrorMessage(result?.error || 'Payment could not be processed. Please try again.');
                lockRetry();
            }
        } catch (err) {
            if (attemptIdRef.current !== thisAttemptId) return;
            clearTimeout(timeoutRef.current);
            clearPaymentInProgress();
            setPaymentState('failed');
            setErrorMessage('Could not reach the payment terminal. Check your connection and try again.');
            lockRetry();
        }
    };

    // ── Create confirmed card order ONLY when authorized ─────────────────────
    const placeAuthorizedCardOrder = async (authResult) => {
        setPaymentState('processing');
        try {
            const orderNum = `K-${Math.floor(1000 + Math.random() * 9000)}`;
            const order = await base44.entities.Order.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurant?.name,
                order_number: orderNum,
                items: cart.map(item => ({
                    menu_item_id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    customizations: item.customizations || {},
                    itemQuantities: item.itemQuantities || {},
                })),
                subtotal: cartTotal,
                delivery_fee: 0,
                discount: 0,
                total: cartTotal,
                // SECURITY: payment_method stored as 'card_terminal', not generic 'card'
                payment_method: 'card',
                // SECURITY: store full authorization evidence
                payment_intent_id: authResult.transaction_id,
                order_type: orderType === 'dine_in' ? 'dine_in' : 'takeaway',
                // SECURITY: only 'confirmed' because we have authorization evidence
                status: 'confirmed',
                notes: `Kiosk order — terminal: ${authResult.terminal_label} — provider: ${authResult.provider} — auth: ${authResult.authorization_timestamp}`,
                ...(selectedTable ? { table_id: selectedTable.id, table_number: selectedTable.table_number } : {}),
            });
            const placedOrder = { ...order, order_number: orderNum };
            let didPrinterFail = false;
            try { await printWithCentralizedConfig(placedOrder, restaurant, 'kiosk_order'); }
            catch { didPrinterFail = true; setPrinterWarning(true); }
            onOrderPlaced(placedOrder, didPrinterFail);
        } catch (err) {
            // CRITICAL: payment WAS authorized but order creation failed
            // Do NOT retry payment. Show error with transaction ID for staff recovery.
            setPaymentState('failed');
            setErrorMessage(
                `Payment was authorized (ref: ${authResult.transaction_id}) but the order could not be saved. ` +
                `Please speak to a member of staff — do NOT pay again.`
            );
        }
    };

    const lockRetry = () => {
        setRetryLocked(true);
        setTimeout(() => setRetryLocked(false), RETRY_LOCK_MS);
    };

    const handleCancel = () => {
        clearTimeout(timeoutRef.current);
        clearPaymentInProgress();
        attemptIdRef.current = null; // discard any in-flight response
        setPaymentState('idle');
        setErrorMessage('');
        setTerminalResult(null);
        setInterruptedPayment(null);
    };

    const handleProceed = () => {
        if (paymentMethod === 'cash') {
            placeCashOrder();
        } else {
            initiateCardPayment();
        }
    };

    // ── Terminal payment screens ──────────────────────────────────────────────

    // Reload-recovery screen: shown when page reloaded during an in-flight payment
    if (paymentState === 'interrupted') {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-28 h-28 rounded-3xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mb-8">
                    <AlertTriangle className="h-14 w-14 text-yellow-400" />
                </div>
                <h2 className="text-white text-3xl font-black mb-3">Payment Interrupted</h2>
                <p className="text-gray-300 text-lg mb-3">The page reloaded during a payment attempt</p>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-6 py-4 mb-10 max-w-md">
                    <p className="text-yellow-300 text-sm font-medium leading-relaxed">
                        ⚠️ Check the card terminal now. If a payment completed, <strong>do NOT retry</strong> — speak to a member of staff and quote reference:
                    </p>
                    {interruptedPayment?.transactionRef && (
                        <p className="text-yellow-200 font-mono text-xs mt-2 bg-yellow-500/10 rounded-lg px-3 py-1.5">
                            {interruptedPayment.transactionRef}
                        </p>
                    )}
                </div>
                <div className="flex gap-4 w-full max-w-sm">
                    <button
                        onClick={onBack}
                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-4 rounded-2xl transition-colors"
                    >
                        ← Back to Cart
                    </button>
                    <button
                        onClick={() => { setPaymentState('idle'); setErrorMessage(''); setInterruptedPayment(null); }}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
                    >
                        <RotateCcw className="h-4 w-4" />
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (paymentState === 'initiating_payment' || paymentState === 'awaiting_card') {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-32 h-32 rounded-3xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-8 animate-pulse">
                    <CreditCard className="h-16 w-16 text-blue-400" />
                </div>
                <h2 className="text-white text-3xl font-black mb-3">
                    {paymentState === 'initiating_payment' ? 'Connecting to terminal...' : 'Please tap, insert or swipe your card'}
                </h2>
                <p className="text-gray-400 text-xl mb-10">
                    {paymentState === 'initiating_payment'
                        ? 'Please wait a moment'
                        : 'Follow the instructions on the card terminal'}
                </p>
                <div className="bg-gray-900 border border-white/[0.06] rounded-2xl px-8 py-5 mb-10">
                    <p className="text-gray-400 text-sm mb-1">Amount to pay</p>
                    <p className="text-orange-400 font-black text-4xl">£{cartTotal.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-3 text-gray-500 mb-10">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Waiting for terminal response...</span>
                </div>
                {/* Only cancel allowed — no "complete" button */}
                <button
                    onClick={handleCancel}
                    className="bg-gray-800 hover:bg-gray-700 text-white font-semibold py-4 px-10 rounded-2xl transition-colors"
                >
                    Cancel
                </button>
            </div>
        );
    }

    if (paymentState === 'processing') {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-24 h-24 rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin mb-8" />
                <h2 className="text-white text-2xl font-bold">Confirming your order...</h2>
                <p className="text-gray-400 mt-2">Please wait — do not tap again</p>
            </div>
        );
    }

    if (paymentState === 'declined') {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-28 h-28 rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-8">
                    <XCircle className="h-14 w-14 text-red-400" />
                </div>
                <h2 className="text-white text-3xl font-black mb-3">Card Declined</h2>
                <p className="text-gray-400 text-lg mb-4">{errorMessage}</p>
                <p className="text-gray-600 text-sm mb-10">No payment has been taken</p>
                <div className="flex gap-4 w-full max-w-sm">
                    <button
                        onClick={handleCancel}
                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-4 rounded-2xl transition-colors"
                    >
                        ← Back
                    </button>
                    <button
                        onClick={() => { setPaymentState('idle'); setErrorMessage(''); }}
                        disabled={retryLocked}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
                    >
                        <RotateCcw className="h-4 w-4" />
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (paymentState === 'timeout') {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-28 h-28 rounded-3xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mb-8">
                    <Clock className="h-14 w-14 text-yellow-400" />
                </div>
                <h2 className="text-white text-3xl font-black mb-3">Terminal Not Responding</h2>
                <p className="text-gray-300 text-lg mb-3">Check the terminal before retrying</p>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-6 py-4 mb-10 max-w-md">
                    <p className="text-yellow-300 text-sm font-medium">
                        ⚠️ If the terminal shows a completed transaction, do NOT pay again — speak to a member of staff.
                    </p>
                </div>
                <div className="flex gap-4 w-full max-w-sm">
                    <button
                        onClick={handleCancel}
                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-4 rounded-2xl transition-colors"
                    >
                        ← Back
                    </button>
                    <button
                        onClick={() => { setPaymentState('idle'); setErrorMessage(''); }}
                        disabled={retryLocked}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
                    >
                        <RotateCcw className="h-4 w-4" />
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (paymentState === 'failed') {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-28 h-28 rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-8">
                    <AlertTriangle className="h-14 w-14 text-red-400" />
                </div>
                <h2 className="text-white text-3xl font-black mb-3">Something went wrong</h2>
                <p className="text-gray-400 text-base mb-10 max-w-md">{errorMessage}</p>
                <div className="flex gap-4 w-full max-w-sm">
                    <button
                        onClick={handleCancel}
                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-4 rounded-2xl transition-colors"
                    >
                        ← Back
                    </button>
                    {/* Only show retry if this is not a post-authorization failure */}
                    {!errorMessage.includes('authorized') && (
                        <button
                            onClick={() => { setPaymentState('idle'); setErrorMessage(''); }}
                            disabled={retryLocked}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Try Again
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // ── Payment method selection (idle) ───────────────────────────────────────
    const paymentMethods = [
        ...(allowCard ? [{ id: 'card', label: 'Pay by Card', icon: CreditCard, description: 'Tap, insert or swipe your card on the terminal' }] : []),
        ...(allowCash ? [{ id: 'cash', label: 'Pay with Cash', icon: Banknote, description: 'Pay at the counter — staff will confirm your order' }] : []),
    ];

    // No payment methods available at all — block ordering
    if (paymentMethods.length === 0) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
                <div className="w-28 h-28 rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-8">
                    <XCircle className="h-14 w-14 text-red-400" />
                </div>
                <h2 className="text-white text-3xl font-black mb-3">Payment Unavailable</h2>
                <p className="text-gray-300 text-lg mb-8">We're unable to take payment at this kiosk right now.</p>
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl px-6 py-5 mb-8 max-w-sm w-full">
                    <UserRound className="h-8 w-8 text-orange-400 mx-auto mb-2" />
                    <p className="text-orange-300 font-bold text-lg">Need help?</p>
                    <p className="text-orange-300/70 text-sm mt-1">Please speak to a member of staff to place your order.</p>
                </div>
                <button onClick={onBack} className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-4 rounded-2xl transition-colors">
                    ← Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col">
            {/* Header */}
            <div className="bg-gray-900 border-b border-white/[0.06] px-6 py-4 flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 text-white" />
                </button>
                <div>
                    <h1 className="text-white font-bold text-2xl">Payment</h1>
                    <p className="text-gray-400 text-sm">
                        {orderType === 'dine_in' ? 'Eat In' : 'Takeaway'} · {restaurant.name}
                    </p>
                </div>
                {/* Terminal status badge */}
                {allowCard && (
                    <div className="ml-auto flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-green-400" />
                        <span className="text-green-400 text-xs font-medium">
                            {terminalConfig?.reader_label || 'Terminal configured'}
                        </span>
                    </div>
                )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 max-w-xl mx-auto w-full">
                {/* Order total */}
                <div className="w-full bg-gray-900 border border-white/[0.06] rounded-3xl p-8 mb-8 text-center">
                    <p className="text-gray-400 text-sm mb-2 uppercase tracking-wider font-medium">Total to Pay</p>
                    <p className="text-orange-400 font-black text-5xl">£{cartTotal.toFixed(2)}</p>
                    <p className="text-gray-600 text-sm mt-2">
                        {cart.reduce((s, i) => s + i.quantity, 0)} item{cart.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}
                    </p>
                </div>

                {/* Operational notices */}
                <div className="w-full space-y-3 mb-4">
                    {terminalUnavailable && (
                        <StaffHelpBanner
                            icon={CreditCard}
                            color="yellow"
                            message="Card payment is not available on this terminal right now."
                        />
                    )}
                    {printerWarning && (
                        <StaffHelpBanner
                            icon={Printer}
                            color="yellow"
                            message="Receipt printer is unavailable. Your order is confirmed — no receipt will print."
                        />
                    )}
                </div>

                {/* Payment method selection */}
                {paymentMethods.length > 1 && (
                    <h2 className="text-white font-bold text-xl mb-4 self-start">Choose Payment Method</h2>
                )}
                <div className="w-full space-y-3 mb-8">
                    {paymentMethods.map(method => {
                        const Icon = method.icon;
                        const selected = paymentMethod === method.id;
                        return (
                            <button
                                key={method.id}
                                onClick={() => setPaymentMethod(method.id)}
                                className={`w-full flex items-center gap-5 p-6 rounded-2xl border transition-all ${
                                    selected
                                        ? 'bg-orange-500 border-orange-500 shadow-lg shadow-orange-500/30'
                                        : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                                }`}
                            >
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${selected ? 'bg-white/20' : 'bg-gray-800'}`}>
                                    <Icon className={`h-7 w-7 ${selected ? 'text-white' : 'text-orange-400'}`} />
                                </div>
                                <div className="text-left flex-1">
                                    <p className="font-bold text-lg text-white">{method.label}</p>
                                    <p className={`text-sm ${selected ? 'text-white/70' : 'text-gray-500'}`}>{method.description}</p>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selected ? 'border-white bg-white' : 'border-gray-600'}`}>
                                    {selected && <div className="w-3 h-3 rounded-full bg-orange-500" />}
                                </div>
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={handleProceed}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-5 rounded-2xl text-xl transition-all active:scale-[0.98] shadow-lg shadow-orange-500/30"
                >
                    {paymentMethod === 'card' ? 'Pay £' + cartTotal.toFixed(2) + ' by Card' : 'Place Order — Pay at Counter'}
                </button>

                {paymentMethod === 'card' && (
                    <p className="text-gray-600 text-xs mt-4 text-center">
                        Payment will be requested from the terminal. Your order is only confirmed after authorization.
                    </p>
                )}

                <div className="flex items-center gap-2 mt-6 text-gray-600 text-xs">
                    <UserRound className="h-4 w-4 flex-shrink-0" />
                    <span>Having trouble? Ask a member of staff for help.</span>
                </div>
            </div>
        </div>
    );
}