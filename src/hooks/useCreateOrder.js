/**
 * useCreateOrder — extracted from Checkout.jsx to keep that file under the 2000-line limit.
 *
 * CRIT-2 FIX: The locked session key is now REQUIRED for card payments.
 * Passing null/undefined will abort order creation to prevent idempotency mismatches
 * that could cause duplicate orders if the session key rotated after PI creation.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils/index.ts';
import { checkoutTrace } from '@/lib/checkoutTrace';
import { pendingPayment } from '@/lib/pendingPayment';

export function useCreateOrder({
    // Cart & restaurant
    cart, restaurantId, restaurantName, restaurant,
    // Order details
    orderType, isGuest, formData, isExistingAddress,
    deliveryCoordinates, deliveryFee, smallOrderSurcharge,
    subtotal, discount, total, isScheduled, scheduledFor,
    appliedCoupons, appliedPromotions, groupOrderId,
    // Computed
    clientSecret, paymentMethod,
    // User
    user, savePhone, saveAddress, addressLabel, setAsDefault,
    isExistingPhone, pointsPerPound,
    // State setters
    setIsSubmitting, setOrderPlaced, setTraceError, setUser,
}) {
    const navigate = useNavigate();

    const createOrder = useCallback(async (paymentIntentId = null, _lockedSessionKey = null) => {
        // ABSOLUTE CRITICAL: Block any order creation if card payment was initiated but not completed
        if (clientSecret && !paymentIntentId) {
            console.error('[Checkout] Order creation blocked: payment initiated but not completed');
            toast.error('❌ Card payment was initiated. Please complete payment or refresh the page.');
            setIsSubmitting(false);
            return;
        }

        // ABSOLUTE CRITICAL: Block any order creation if card was selected without payment
        if (paymentMethod === 'card' && !paymentIntentId) {
            console.error('[Checkout] Order creation blocked: card payment selected but not completed');
            toast.error('❌ Payment required. Please complete card payment first.');
            setIsSubmitting(false);
            return;
        }

        checkoutTrace.log('create_order_started', { method: paymentMethod, hasPi: !!paymentIntentId });
        console.log('[Checkout] Creating order with payment method:', paymentMethod, 'and payment intent ID:', paymentIntentId || 'none');
        setIsSubmitting(true);

        try {
            const actualPaymentMethod = paymentIntentId ? 'card' : paymentMethod;

            if (paymentIntentId && (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_'))) {
                toast.error('❌ Invalid payment verification. Please try again.');
                setIsSubmitting(false);
                return;
            }

            if (!['cash', 'card'].includes(actualPaymentMethod)) {
                toast.error('Please select a valid payment method.');
                setIsSubmitting(false);
                return;
            }

            if (!cart || cart.length === 0) {
                toast.error('Your cart is empty');
                setIsSubmitting(false);
                return;
            }

            if (!restaurantId || !restaurantName || typeof restaurantName !== 'string' || !restaurantName.trim()) {
                toast.error('Restaurant information is still loading. Please try again.');
                setIsSubmitting(false);
                return;
            }

            const validatedItems = cart.map(item => ({
                menu_item_id: item.id || item.menu_item_id,
                name: item.name || 'Unknown item',
                price: item.price || 0,
                quantity: item.quantity || 1,
                customizations: item.customizations || {},
                itemQuantities: item.itemQuantities || {}
            }));

            const sanitizeAddress = (addr) => {
                if (typeof addr !== 'string') return '';
                return String(addr).trim()
                    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                    .slice(0, 500);
            };

            const deliveryAddressString = orderType === 'delivery'
                ? (typeof formData.delivery_address === 'string' && formData.delivery_address.trim()
                    ? sanitizeAddress(formData.delivery_address)
                    : 'Address not provided')
                : '';

            const fullAddress = orderType === 'delivery'
                ? (isExistingAddress
                    ? deliveryAddressString
                    : `${formData.door_number ? formData.door_number + ', ' : ''}${deliveryAddressString}`)
                : '';

            const orderNumber = orderType === 'collection'
                ? `C-${Date.now().toString().slice(-6)}`
                : null;

            const earnLoyalty = restaurant?.loyalty_program_enabled !== false;
            const pointsMultiplier = restaurant?.loyalty_points_multiplier || 1;
            const pointsToEarn = earnLoyalty ? Math.floor(total * pointsPerPound * pointsMultiplier) : 0;

            const sanitizeInput = (input) => {
                if (!input || typeof input !== 'string') return '';
                return String(input).replace(/[<>]/g, '').slice(0, 500);
            };

            const orderData = {
                order_number: orderNumber,
                restaurant_id: restaurantId,
                restaurant_name: restaurantName,
                loyalty_points_earned: pointsToEarn,
                items: validatedItems,
                subtotal,
                delivery_fee: deliveryFee,
                small_order_surcharge: smallOrderSurcharge,
                discount,
                coupon_codes: appliedCoupons.length > 0 ? appliedCoupons.map(c => c.code) : [],
                promotion_codes: appliedPromotions.length > 0 ? appliedPromotions.map(p => p.promotion_code || p.name) : [],
                total,
                payment_method: actualPaymentMethod,
                order_type: orderType,
                status: 'pending',
                delivery_address: fullAddress,
                delivery_coordinates: orderType === 'delivery' ? deliveryCoordinates : null,
                phone: formData.phone,
                notes: sanitizeInput(formData.notes),
                estimated_delivery: isScheduled ? 'Scheduled' : (orderType === 'collection' ? '15-20 minutes' : '30-45 minutes'),
                is_scheduled: isScheduled,
                scheduled_for: isScheduled ? scheduledFor : null,
                is_group_order: !!groupOrderId,
                group_order_id: groupOrderId,
                payment_intent_id: paymentIntentId
            };

            if (isGuest) {
                orderData.guest_name = formData.guest_name;
                orderData.guest_email = formData.guest_email;
            }

            // CRIT-2 FIX: Always use the locked session key for card payments.
            // Falling back to a fresh key risks idempotency mismatch → duplicate orders.
            if (paymentIntentId && !_lockedSessionKey) {
                console.error('[Checkout] CRITICAL: card payment attempted without a locked session key — aborting to prevent duplicate order');
                toast.error('Payment session error. Please contact support with reference: ' + paymentIntentId);
                setIsSubmitting(false);
                return;
            }
            const sessionKeyToUse = paymentIntentId ? _lockedSessionKey : `ps_cash_${Date.now()}`;

            checkoutTrace.log('verify_and_create_order_started', { piId: paymentIntentId, total, orderType, sessionKey: sessionKeyToUse });
            console.log('[Checkout] Invoking verifyAndCreateOrder with paymentIntentId:', paymentIntentId, 'session_key:', sessionKeyToUse);
            const verificationResponse = await base44.functions.invoke('verifyAndCreateOrder', {
                orderData,
                paymentIntentId: paymentIntentId || null,
                idempotency_key: sessionKeyToUse
            });

            if (!verificationResponse?.data?.success) {
                const errorMsg = verificationResponse?.data?.error || 'Order creation failed';
                const refunded = verificationResponse?.data?.refunded === true;
                const code = verificationResponse?.data?.code || '';
                checkoutTrace.error('verify_and_create_order_failed', { error: errorMsg, refunded, duplicate: verificationResponse?.data?.duplicate });
                setTraceError(`ORDER_FAILED: ${errorMsg}`);
                console.error('[Checkout] Order creation failed:', errorMsg, 'Refunded:', refunded);
                if (refunded) {
                    if (code === 'ITEM_NOT_FOUND' || code === 'ITEM_UNAVAILABLE') {
                        toast.error('One or more items in your cart are no longer available. Your payment has been fully refunded. Please refresh and reorder.', { duration: 8000 });
                    } else {
                        toast.error(errorMsg + ' — Your payment has been automatically refunded.', { duration: 8000 });
                    }
                } else {
                    toast.error(errorMsg);
                }
                setIsSubmitting(false);
                return;
            }

            checkoutTrace.log('verify_and_create_order_succeeded', { orderId: verificationResponse?.data?.order_id, duplicate: verificationResponse?.data?.duplicate });
            console.log('[Checkout] ✅ Order created successfully:', verificationResponse?.data?.order_id);

            if (!verificationResponse?.data?.order_id) {
                throw new Error('Order ID not returned');
            }

            const newOrder = {
                id: verificationResponse.data.order_id,
                order_number: verificationResponse.data.order_number
            };

            localStorage.removeItem('cart');
            localStorage.removeItem('cartRestaurantId');
            localStorage.removeItem('cartRestaurantName');
            localStorage.removeItem('groupOrderId');
            localStorage.removeItem('orderType');
            localStorage.removeItem('appliedPromotions');
            localStorage.removeItem('userAddress');
            localStorage.removeItem('userCoordinates');
            pendingPayment.clear();

            window.navigator?.vibrate?.([50, 30, 50]);

            if (formData.phone) sessionStorage.setItem('guest_order_phone', formData.phone);
            if (formData.guest_email) sessionStorage.setItem('guest_order_email', formData.guest_email);

            setOrderPlaced(true);

            const backgroundTasks = [];

            if (!isGuest && user) {
                backgroundTasks.push(
                    Promise.resolve().then(() => {
                        const updates = {};
                        if (savePhone && formData.phone && formData.phone !== user.phone) {
                            updates.phone = formData.phone;
                        }
                        if (saveAddress && orderType === 'delivery' && formData.delivery_address && formData.door_number) {
                            const currentAddresses = user.saved_addresses || [];
                            const addressExists = currentAddresses.some(addr =>
                                addr.address === formData.delivery_address && addr.door_number === formData.door_number
                            );
                            if (!addressExists) {
                                const newAddress = {
                                    label: addressLabel,
                                    address: formData.delivery_address,
                                    door_number: formData.door_number,
                                    coordinates: deliveryCoordinates,
                                    instructions: formData.notes || '',
                                    is_default: setAsDefault
                                };
                                const updatedAddresses = setAsDefault
                                    ? currentAddresses.map(addr => ({ ...addr, is_default: false }))
                                    : currentAddresses;
                                updates.saved_addresses = [...updatedAddresses, newAddress];
                            }
                        }
                        if (Object.keys(updates).length > 0) {
                            return base44.auth.updateMe(updates).then(() => {
                                setUser(prev => prev ? { ...prev, ...updates } : prev);
                            });
                        }
                    }).catch(e => console.error('Failed to save user data:', e))
                );
            }

            if (groupOrderId) {
                backgroundTasks.push(
                    base44.entities.GroupOrder.update(groupOrderId, { status: 'placed' })
                        .catch(e => console.error('Failed to update group order:', e))
                );
            }

            appliedPromotions.filter(p => !p.is_automatic).forEach(promo => {
                backgroundTasks.push(
                    base44.functions.invoke('incrementPromotionUsage', {
                        promoId: promo.id,
                        orderId: newOrder.id,
                        orderTotal: total,
                        promoDiscount: promo.discount || 0,
                    }).catch(e => console.error('Failed to update promotion usage:', e))
                );
            });

            backgroundTasks.push(
                base44.functions.invoke('shouldSendOrderStatusNotification', { restaurantId, status: 'confirmed' })
                    .then(checkResult => {
                        const { shouldSendSms, shouldSendWhatsApp } = checkResult?.data || {};
                        if (!shouldSendSms && !shouldSendWhatsApp) return;
                        const orderLabel = orderType === 'collection' && newOrder.order_number
                            ? newOrder.order_number : `#${newOrder.id.slice(-6)}`;
                        const itemsList = cart.slice(0, 3).map(item => `${item.quantity}x ${item.name}`).join('\n');
                        const moreItems = cart.length > 3 ? `\n+${cart.length - 3} more items` : '';
                        const customerMessage = orderType === 'collection'
                            ? `✅ ORDER CONFIRMED - ${orderLabel}\n\n${restaurantName}\n\n${itemsList}${moreItems}\n\nTotal: £${total.toFixed(2)}\n\nCOLLECTION ORDER\nReady in 15-20 min`
                            : `✅ ORDER CONFIRMED - ${orderLabel}\n\n${restaurantName}\n\n${itemsList}${moreItems}\n\nTotal: £${total.toFixed(2)}\nPayment: ${actualPaymentMethod}`;
                        if (shouldSendWhatsApp) {
                            return base44.functions.invoke('sendWhatsAppCustomer', { to: formData.phone, message: customerMessage, orderId: newOrder.id, restaurantId, restaurantName });
                        } else {
                            return base44.functions.invoke('sendSMS', { to: formData.phone, message: customerMessage, orderId: newOrder.id, restaurantId, restaurantName });
                        }
                    }).catch(e => console.error('Customer notification failed:', e))
            );

            backgroundTasks.push(
                base44.functions.invoke('notifyRestaurantNewOrder', { orderId: newOrder.id, restaurantId, restaurantName })
                    .catch(() => {})
            );

            await Promise.allSettled(backgroundTasks);

            setTimeout(() => {
                navigate(createPageUrl('Orders'));
            }, 2000);
        } catch (error) {
            console.error('Order creation error:', error);
            const errorMessage = error?.message || 'Failed to place order. Please check your connection and try again.';
            toast.error(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart, restaurantId, restaurantName, restaurant, orderType, isGuest, formData, isExistingAddress,
        deliveryCoordinates, deliveryFee, smallOrderSurcharge, subtotal, discount, total,
        isScheduled, scheduledFor, appliedCoupons, appliedPromotions, groupOrderId,
        clientSecret, paymentMethod, user, savePhone, saveAddress, addressLabel, setAsDefault, pointsPerPound]);

    return { createOrder };
}