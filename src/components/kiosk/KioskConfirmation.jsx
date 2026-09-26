import React, { useEffect, useState } from 'react';
import { CheckCircle, Printer, Banknote, Camera, ArrowRight } from 'lucide-react';

/**
 * What the customer sees after ordering at the kiosk.
 *
 * TWO DIFFERENT SITUATIONS, SO TWO DIFFERENT SCREENS
 *
 *  Paid by card: the order is complete and cooking. A success screen is right.
 *
 *  Pay at the counter: the order is NOT complete. It will not be cooked until
 *  paid, and it is cancelled if nobody pays within the restaurant's limit. The
 *  old screen opened with a green tick and "Order Placed!", which reads as
 *  finished - a customer could sit down to wait and lose their order. This one
 *  leads with what they still have to do.
 *
 * NO PRINTER
 *  The kiosk may have no receipt printer, in which case this screen is the
 *  customer's ONLY record of their number. So the number dominates, the amount
 *  to pay sits right beside it, the screen stays up longer, and the customer is
 *  told they can photograph it.
 */
export default function KioskConfirmation({ order, orderType, restaurant, onDone, printerFailed = false, paymentMethod }) {
    const payAtCounter = paymentMethod === 'pay_at_counter';
    // Longer when this screen is their only record and they have somewhere to go.
    const [countdown, setCountdown] = useState(payAtCounter ? 45 : 30);
    const orderNum = order?.order_number || order?.id?.slice(-4).toUpperCase();
    const total = Number(order?.total || 0);

    useEffect(() => {
        const t = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) { clearInterval(t); onDone(); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, []);

    // A missing printer is only worth mentioning if the kiosk expected one.
    // With printing switched off, this screen is simply the record.
    const expectedReceipt = restaurant?.kiosk_config?.auto_print_receipt !== false;
    const noReceipt = !expectedReceipt || printerFailed;

    if (payAtCounter) {
        return (
            <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 py-10 text-center">
                <div className="w-24 h-24 rounded-full bg-accent-500/15 border-2 border-accent-500/40 flex items-center justify-center mb-6">
                    <Banknote className="h-12 w-12 text-accent-400" />
                </div>

                <h1 className="text-white text-4xl md:text-5xl font-black mb-2 tracking-tight">Almost done</h1>
                <p className="text-gray-300 text-xl md:text-2xl mb-8">Now pay at the counter</p>

                {/* The number and the amount, together - this is what the
                    customer takes to the till. */}
                <div className="bg-gray-900 border-2 border-accent-500/40 rounded-3xl px-10 md:px-16 py-8 mb-6 w-full max-w-lg">
                    <p className="text-gray-400 text-sm md:text-base uppercase tracking-[0.2em] font-semibold mb-1">Your order number</p>
                    <p className="text-white font-black text-8xl md:text-9xl tracking-tight tabular-nums leading-none my-2">{orderNum}</p>
                    <div className="mt-5 pt-5 border-t border-white/10 flex items-baseline justify-center gap-3">
                        <span className="text-gray-400 text-lg">To pay</span>
                        <span className="text-accent-400 font-black text-5xl tabular-nums">&pound;{total.toFixed(2)}</span>
                    </div>
                </div>

                {/* What happens next, in the order it happens. */}
                <ol className="w-full max-w-lg space-y-3 mb-6 text-left">
                    {[
                        'Go to the counter',
                        `Give them your number: ${orderNum}`,
                        'We start cooking as soon as you pay',
                    ].map((step, i) => (
                        <li key={i} className="flex items-center gap-4 bg-gray-900/70 rounded-2xl px-5 py-4">
                            <span className="h-9 w-9 rounded-full bg-accent-500 text-white font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <span className="text-white text-lg font-semibold">{step}</span>
                        </li>
                    ))}
                </ol>

                {noReceipt && (
                    <p className="flex items-center gap-2 text-gray-400 text-base mb-8">
                        <Camera className="h-5 w-5" />
                        No receipt is printed &mdash; take a photo of this screen if it helps.
                    </p>
                )}

                <button
                    onClick={onDone}
                    className="bg-accent-500 hover:bg-accent-600 text-white font-bold px-12 py-5 rounded-2xl text-xl transition-all active:scale-95 flex items-center gap-2"
                >
                    I&rsquo;ve got my number <ArrowRight className="h-5 w-5" />
                </button>
                <p className="text-gray-600 text-sm mt-4">
                    This screen closes in <span className="text-gray-400 font-bold tabular-nums">{countdown}s</span>
                </p>
            </div>
        );
    }

    // ── Paid by card: the order is complete ────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 py-10 text-center">
            <div className="relative mb-8">
                <div className="w-32 h-32 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                    <CheckCircle className="h-16 w-16 text-green-400" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-green-500/20 animate-ping" />
            </div>

            <h1 className="text-white text-4xl md:text-5xl font-black mb-3 tracking-tight">Thank you!</h1>
            <p className="text-gray-300 text-xl mb-8 max-w-md">
                {orderType === 'dine_in'
                    ? 'Your food will be brought to your table.'
                    : 'Your order is being prepared. We\u2019ll call your number when it\u2019s ready.'}
            </p>

            <div className="bg-gray-900 border border-white/[0.06] rounded-3xl px-12 py-8 mb-6">
                <p className="text-gray-400 text-sm uppercase tracking-[0.2em] font-semibold mb-2">Your order number</p>
                <p className="text-accent-400 font-black text-8xl tracking-tight tabular-nums leading-none">{orderNum}</p>
            </div>

            {printerFailed && expectedReceipt && (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 mb-6 max-w-sm w-full">
                    <Printer className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                    <p className="text-yellow-300 text-sm text-left">The receipt couldn&rsquo;t print. Please note your order number.</p>
                </div>
            )}

            <button
                onClick={onDone}
                className="bg-accent-500 hover:bg-accent-600 text-white font-bold px-12 py-4 rounded-2xl text-lg transition-all active:scale-95"
            >
                Start new order
            </button>
            <p className="text-gray-600 text-sm mt-4">
                Returning to home in <span className="text-gray-400 font-bold tabular-nums">{countdown}s</span>
            </p>
        </div>
    );
}
