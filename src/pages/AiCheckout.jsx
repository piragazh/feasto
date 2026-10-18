import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Loader2, Phone, AlertCircle } from 'lucide-react';

const unwrap = (res) => (res && typeof res === 'object' && 'data' in res ? res.data : res);

/**
 * Landing page for the pay link sent by an AI ordering agent (phone or chat),
 * from aiOrderingCore send_payment_link.
 *
 * Loads the basket built in the conversation (via a one-time token), puts it where
 * the normal website checkout reads it (localStorage), and hands over to Checkout.
 * Everything after that - price checks, Stripe, POS, printing - is the existing web
 * ordering flow, unchanged. aiOrderLink then links the paid order to the session.
 * Same pattern as WhatsAppCheckout.
 */
export default function AiCheckout() {
    const navigate = useNavigate();
    const [error, setError] = useState(null);

    useEffect(() => {
        const token = new URLSearchParams(window.location.search).get('t');
        if (!token) {
            setError('This link is incomplete. Please use the link from your text message again.');
            return;
        }
        (async () => {
            try {
                const res = await base44.functions.invoke('aiCheckoutCart', { token });
                const data = unwrap(res);
                if (!data?.cart?.length) throw new Error(data?.error || 'Your basket is empty.');

                try {
                    localStorage.setItem('cart', JSON.stringify(data.cart));
                    localStorage.setItem('cartRestaurantId', data.restaurant_id);
                    localStorage.setItem('cartRestaurantName', data.restaurant_name || '');
                    localStorage.setItem('orderType', data.order_type || 'delivery');
                    if (data.delivery_address) localStorage.setItem('userAddress', data.delivery_address);
                    localStorage.removeItem('groupOrderId');
                    localStorage.removeItem('appliedPromotions');
                } catch {
                    throw new Error('Your browser blocked storage. Please open this link in Chrome or Safari.');
                }

                navigate(createPageUrl('Checkout'), { replace: true });
            } catch (e) {
                const msg = e?.response?.data?.error || e?.data?.error || e?.message;
                setError(msg || 'This payment link is invalid or has expired.');
            }
        })();
    }, [navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border p-6 text-center">
                {!error ? (
                    <>
                        <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-4" />
                        <h1 className="text-lg font-semibold text-gray-900">Loading your order…</h1>
                        <p className="text-sm text-gray-500 mt-1">Taking you to secure payment.</p>
                    </>
                ) : (
                    <>
                        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-4" />
                        <h1 className="text-lg font-semibold text-gray-900">Couldn't open your order</h1>
                        <p className="text-sm text-gray-600 mt-2">{error}</p>
                        <p className="text-sm text-gray-500 mt-4 flex items-center justify-center gap-1.5">
                            <Phone className="h-4 w-4 text-orange-500" />
                            Call the restaurant again for a new link.
                        </p>
                        <Button variant="outline" className="mt-5 w-full" onClick={() => navigate(createPageUrl('Home'))}>
                            Go to homepage
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
