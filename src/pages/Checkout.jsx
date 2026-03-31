// ============================================
// CHECKOUT PAGE - Handles order placement and payment
// ============================================
// This page manages the entire checkout process including:
// - Guest and authenticated user checkout
// - Address and contact information collection
// - Payment method selection (Cash, Card via Stripe)
// - Order validation and submission
// - Delivery zone checking

import React, { useState, useEffect, useRef } from 'react';
// Note: loadStripe and Stripe singleton are now in hooks/usePaymentInit.js
import { base44 } from '@/api/base44Client'; // SDK to interact with backend
import { useNavigate, Link } from 'react-router-dom'; // Navigation tools
import { createPageUrl } from '@/utils/index.ts'; // Helper to create page URLs
import { calculateDeliveryDetails } from '@/components/checkout/DeliveryZoneCalculator'; // Check delivery zones
import { Button } from "@/components/ui/button"; // UI Components
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MapPin, Phone, FileText, Loader2, CheckCircle, User } from 'lucide-react'; // Icons
import DiscountCodeInput from '@/components/checkout/DiscountCodeInput'; // Discount code application
import AvailablePromotions from '@/components/checkout/AvailablePromotions'; // Auto-apply promotions
import PaymentMethods from '@/components/checkout/PaymentMethods'; // Payment selection component
import ScheduleOrderSection from '@/components/checkout/ScheduleOrderSection'; // Schedule future orders
import GroupOrderSection from '@/components/checkout/GroupOrderSection'; // Group order functionality
import LocationPicker from '@/components/location/LocationPicker'; // Address autocomplete
import SavedAddressesSection from '@/components/checkout/SavedAddressesSection'; // Saved addresses for logged-in users
import { motion } from 'framer-motion'; // Animations
import { toast } from 'sonner'; // Toast notifications
import { Elements } from '@stripe/react-stripe-js';
import StripePaymentForm from '@/components/checkout/StripePaymentForm';
import ExpressCheckoutFlow from '@/components/checkout/ExpressCheckoutFlow';
import CheckoutOrderSummary from '@/components/checkout/CheckoutOrderSummary';
import { useSEO } from '@/lib/useSEO.js';
import { checkoutTrace } from '@/lib/checkoutTrace';
import { usePaymentInit } from '@/hooks/usePaymentInit';
import { useCreateOrder } from '@/hooks/useCreateOrder';
import { pendingPayment } from '@/lib/pendingPayment';
import { handleRecoveryResult } from '@/lib/checkoutRecovery';

// Main Checkout Component
export default function Checkout() {
    useSEO({ title: 'Checkout', noindex: true });
    const navigate = useNavigate(); // Used to redirect after order placement
    
    // ============================================
    // STATE MANAGEMENT - Storing component data
    // ============================================
    
    // Cart and Restaurant Information
    const [cart, setCart] = useState([]); // Items in shopping cart
    const [restaurantId, setRestaurantId] = useState(null); // ID of restaurant being ordered from
    const [restaurantName, setRestaurantName] = useState(''); // Name of restaurant
    const [restaurant, setRestaurant] = useState(null); // Full restaurant object
    const [orderType, setOrderType] = useState('delivery'); // 'delivery' or 'collection'
    
    // Order Status
    const [isSubmitting, setIsSubmitting] = useState(false); // True when submitting order
    const [orderPlaced, setOrderPlaced] = useState(false); // True when order successfully placed

    // Recovery state — detects interrupted payments on page reload
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoveryError, setRecoveryError] = useState(null);
    
    // Discounts and Special Orders
    const [appliedCoupons, setAppliedCoupons] = useState([]); // Applied coupons array
    const [appliedPromotions, setAppliedPromotions] = useState([]); // Applied promotions array
    const [isScheduled, setIsScheduled] = useState(false); // Is this a scheduled order?
    const [scheduledFor, setScheduledFor] = useState(''); // When to deliver (if scheduled)
    const [groupOrderId, setGroupOrderId] = useState(null); // Group order session ID
    const [shareCode, setShareCode] = useState(null); // Code to share group order
    
    // Delivery Zone Information
    const [deliveryZoneInfo, setDeliveryZoneInfo] = useState(null); // Delivery availability and fees
    const [zoneCheckComplete, setZoneCheckComplete] = useState(false); // Has zone check finished?
    
    // Payment Processing
    const [paymentMethod, setPaymentMethod] = useState(''); // Selected payment method (no default)
    const [paymentCompleted, setPaymentCompleted] = useState(false); // Track if card payment is completed
    const [showCashConfirmation, setShowCashConfirmation] = useState(false); // Cash payment confirmation
    // NOTE: idempotencyKey is now managed inside usePaymentInit as a rotating session key.
    // Use getSessionKey() from the hook instead of a static mount-time value.
    const [checkoutTraceId] = useState(() => {
        const id = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        checkoutTrace.reset(id);
        console.log(`[CHECKOUT_TRACE] trace=${id} step=checkout_mounted`);
        return id;
    });
    const [traceError, setTraceError] = useState(null); // Dev-facing error detail
    // Atomic guard: prevents Express Checkout onConfirm from firing twice
    const expressConfirmFiredRef = useRef(false);
    
    // Atomic guard: single source of truth for payment success handling (supersedes paymentCompleted state)
    const paymentSuccessHandledRef = useRef(false);
    
    // FIX #1: Top-level cross-path guard — prevents Express + card paths both firing handleStripeSuccess
    // AUDIT FIX: Explicitly initialize to false so first check `=== true` is not `undefined === true`
    const anyPaymentPathInFlightRef = useRef(false);
    
    // Form Data - Customer Information
    const [formData, setFormData] = useState({
        guest_name: '', // Name (for guest checkout)
        guest_email: '', // Email (for guest checkout)
        door_number: '', // Door/flat number
        delivery_address: '', // Street address
        phone: '', // Contact phone number
        notes: '' // Special delivery instructions
    });
    const [deliveryCoordinates, setDeliveryCoordinates] = useState(null); // GPS coordinates for delivery
    
    // User Authentication Status
    const [isGuest, setIsGuest] = useState(false); // Is user checking out as guest?
    const [emailChecked, setEmailChecked] = useState(false);
    const [emailExists, setEmailExists] = useState(false);
    const [checkingEmail, setCheckingEmail] = useState(false);
    const [savePhone, setSavePhone] = useState(true);
    const [saveAddress, setSaveAddress] = useState(true);
    const [addressLabel, setAddressLabel] = useState('Home');
    const [setAsDefault, setSetAsDefault] = useState(false);
    const [isExistingAddress, setIsExistingAddress] = useState(false);
    const [isExistingPhone, setIsExistingPhone] = useState(false);
    const [user, setUser] = useState(null);
    const [showManualAddressEntry, setShowManualAddressEntry] = useState(false);
    const [pointsPerPound, setPointsPerPound] = useState(1);

    // ============================================
    // INITIALIZATION - Runs when page loads
    // ============================================
    useEffect(() => {
        // Check if user is logged in or guest
        checkAuthStatus();
        
        // Load saved data from browser storage (localStorage)
        const savedCart = localStorage.getItem('cart'); // Shopping cart items
        const savedRestaurantId = localStorage.getItem('cartRestaurantId'); // Restaurant ID
        const savedRestaurantName = localStorage.getItem('cartRestaurantName'); // Restaurant name
        const savedGroupOrderId = localStorage.getItem('groupOrderId'); // Group order session
        const savedAddress = localStorage.getItem('userAddress'); // Previously used address
        const savedCoords = localStorage.getItem('userCoordinates'); // Address GPS coordinates
        const savedOrderType = localStorage.getItem('orderType') || 'delivery'; // Order type
        
        // Restore cart if items exist — guarded against corrupted localStorage
        if (savedCart) {
            try {
                const parsed = JSON.parse(savedCart);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setCart(parsed);
                } else {
                    localStorage.removeItem('cart');
                }
            } catch (e) {
                console.warn('[Checkout] Corrupted cart data in localStorage, clearing:', e.message);
                localStorage.removeItem('cart');
                localStorage.removeItem('cartRestaurantId');
                localStorage.removeItem('cartRestaurantName');
            }
        }
        
        // Restore restaurant info
        if (savedRestaurantId) {
            setRestaurantId(savedRestaurantId);
            loadRestaurantName(savedRestaurantId); // Fetch full restaurant details
        }
        
        // Restore group order session
        if (savedGroupOrderId) {
            setGroupOrderId(savedGroupOrderId);
        }
        
        // Restore previously entered address
        if (savedAddress) {
            setFormData(prev => ({ ...prev, delivery_address: savedAddress }));
        }
        
        // Restore address coordinates
        if (savedCoords) {
            setDeliveryCoordinates(JSON.parse(savedCoords));
        }

        // Restore order type
        setOrderType(savedOrderType);

        // Restore applied promotions from cart drawer
        const savedPromotions = localStorage.getItem('appliedPromotions');
        if (savedPromotions) {
            setAppliedPromotions(JSON.parse(savedPromotions));
        }
    }, []); // Only on mount

    // Auto-detect BOGO promotions from cart items
    useEffect(() => {
        if (cart.length === 0) return;

        const bogoPromotions = [];
        cart.forEach(item => {
            if (item.promotion_type === 'buy_one_get_one') {
                const freeItems = Math.floor(item.quantity / 2);
                if (freeItems > 0) {
                    const discount = item.price * freeItems;
                    bogoPromotions.push({
                        id: `${item.menu_item_id}_bogo`,
                        name: item.promotion_name || 'Buy 1 Get 1 Free',
                        promotion_type: 'buy_one_get_one',
                        discount: discount,
                        is_automatic: true
                    });
                }
            } else if (item.promotion_type === 'buy_two_get_one') {
                const freeItems = Math.floor(item.quantity / 3);
                if (freeItems > 0) {
                    const discount = item.price * freeItems;
                    bogoPromotions.push({
                        id: `${item.menu_item_id}_b2g1`,
                        name: item.promotion_name || 'Buy 2 Get 1 Free',
                        promotion_type: 'buy_two_get_one',
                        discount: discount,
                        is_automatic: true
                    });
                }
            }
        });

        setAppliedPromotions(prev => {
            const filtered = prev.filter(p => !p.is_automatic);
            return bogoPromotions.length > 0 ? [...filtered, ...bogoPromotions] : filtered;
        });
    }, [cart]);

    // Auto-enable scheduling if restaurant is closed (runs on mount/restaurant change)
    useEffect(() => {
        if (!restaurant || isScheduled) return;
        
        const now = new Date();
        const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
        
        let hours;
        if (orderType === 'collection' && restaurant.collection_hours) {
            hours = restaurant.collection_hours[dayName];
        } else if (orderType === 'delivery' && restaurant.delivery_hours) {
            hours = restaurant.delivery_hours[dayName];
        } else {
            hours = restaurant.opening_hours?.[dayName];
        }

        // If no specific hours configured but restaurant is marked open, don't auto-schedule
        if (!hours && restaurant.is_open) return;

        if (!hours || hours.closed || !hours.open || !hours.close) {
            // Restaurant is closed today, find next opening time
            for (let i = 1; i <= 7; i++) {
                const nextDay = new Date(now);
                nextDay.setDate(nextDay.getDate() + i);
                const nextDayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][nextDay.getDay()];
                
                let nextHours;
                if (orderType === 'collection' && restaurant.collection_hours) {
                    nextHours = restaurant.collection_hours[nextDayName];
                } else if (orderType === 'delivery' && restaurant.delivery_hours) {
                    nextHours = restaurant.delivery_hours[nextDayName];
                } else {
                    nextHours = restaurant.opening_hours?.[nextDayName];
                }

                if (nextHours && !nextHours.closed && nextHours.open && nextHours.close) {
                    const [hour, min] = nextHours.open.split(':').map(Number);
                    nextDay.setHours(hour, min, 0, 0);
                    setScheduledFor(nextDay.toISOString().slice(0, 16));
                    setIsScheduled(true);
                    toast.info('Restaurant is closed - order will be delivered when they open');
                    break;
                }
            }
        } else {
            // Check if currently outside opening hours
            const [openHour, openMin] = hours.open.split(':').map(Number);
            const [closeHour, closeMin] = hours.close.split(':').map(Number);
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const openTime = openHour * 60 + openMin;
            const closeTime = closeHour * 60 + closeMin;

            // Handle overnight restaurants (e.g., 22:00–02:00)
            const isOpen = closeTime > openTime
                ? currentTime >= openTime && currentTime < closeTime
                : currentTime >= openTime || currentTime < closeTime;

            if (!isOpen) {
                // Currently closed, schedule for next opening
                const scheduleTime = new Date(now);
                if (currentTime < openTime && closeTime > openTime) {
                    // Before opening today
                    scheduleTime.setHours(openHour, openMin, 0, 0);
                } else {
                    // After closing — find next open day
                    let scheduled = false;
                    for (let i = 1; i <= 7; i++) {
                        const nextDay = new Date(now);
                        nextDay.setDate(nextDay.getDate() + i);
                        const nextDayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][nextDay.getDay()];
                        let nextHours;
                        if (orderType === 'collection' && restaurant.collection_hours) {
                            nextHours = restaurant.collection_hours[nextDayName];
                        } else if (orderType === 'delivery' && restaurant.delivery_hours) {
                            nextHours = restaurant.delivery_hours[nextDayName];
                        } else {
                            nextHours = restaurant.opening_hours?.[nextDayName];
                        }
                        if (nextHours && !nextHours.closed && nextHours.open) {
                            const [h, m] = nextHours.open.split(':').map(Number);
                            nextDay.setHours(h, m, 0, 0);
                            setScheduledFor(nextDay.toISOString().slice(0, 16));
                            setIsScheduled(true);
                            toast.info('Restaurant is closed - order will be delivered when they open');
                            scheduled = true;
                            break;
                        }
                    }
                    if (!scheduled) return;
                    return; // already set above
                }
                setScheduledFor(scheduleTime.toISOString().slice(0, 16));
                setIsScheduled(true);
                toast.info('Restaurant is closed - order will be delivered when they open');
            }
        }
    }, [restaurant, orderType]);

    // Load loyalty points per pound setting once on mount
    useEffect(() => {
        base44.entities.SystemSettings.filter({ setting_key: 'loyalty_points_per_pound' })
            .then(results => {
                if (results?.[0]?.setting_value) setPointsPerPound(parseFloat(results[0].setting_value) || 1);
            })
            .catch(() => {});
    }, []);

    // ── Recovery: detect interrupted payments on page reload ──────────────────
    // If a pending payment was persisted (PI succeeded but browser closed before
    // order creation confirmed), attempt to recover it automatically.
    // FIX #7: Pass user context to pendingPayment.read() for user binding validation
    // AUDIT FIX: Guard on user state — recovery needs user to be resolved first (null = still loading)
    useEffect(() => {
        if (user === null && !isGuest) return; // Wait: user not yet resolved (loading)
        const detectRecovery = async () => {
            const pending = await pendingPayment.read(user);
            if (!pending) return;

            // Skip if already terminal (max attempts exhausted, refunded, etc.)
            if (!pendingPayment.isReplayable()) {
                console.log('[Checkout] Pending payment not replayable — clearing');
                pendingPayment.clear();
                return;
            }

            console.log('[Checkout] Detected pending payment pi=', pending.paymentIntentId, 'savedAt=', pending.savedAt);
            checkoutTrace.log('recovery_detected', { piId: pending.paymentIntentId, savedAt: pending.savedAt });

            setIsRecovering(true);

            base44.functions.invoke('recoverPayment', {
                paymentIntentId: pending.paymentIntentId,
                idempotencyKey: pending.idempotencyKey,
                orderData: pending.orderData,
            }).then(response => {
                const result = response?.data;
                console.log('[Checkout] Recovery result:', result?.status, result?.order_id);
                checkoutTrace.log('recovery_result', { status: result?.status, orderId: result?.order_id });

                const { orderPlaced: didRecover, recoveryError: errMsg } = handleRecoveryResult(result);
                if (didRecover) {
                    setOrderPlaced(true);
                    toast.success('Your previous order has been confirmed!');
                    setTimeout(() => navigate(createPageUrl('Orders')), 2000);
                } else if (errMsg) {
                    setRecoveryError(errMsg);
                }
            }).catch(async (err) => {
                console.error('[Checkout] Recovery request failed:', err.message);
                checkoutTrace.error('recovery_request_failed', { error: err.message });

                // Before marking terminal, check if order was created despite network error
                try {
                    const currentPending = await pendingPayment.read(user);
                    if (currentPending?.idempotencyKey) {
                        const maybeOrders = await base44.entities.Order.filter({ idempotency_key: currentPending.idempotencyKey });
                        if (maybeOrders?.length > 0) {
                            console.log('[Checkout] Order found via idempotency check despite network error — clearing pending');
                            pendingPayment.clear();
                            setOrderPlaced(true);
                            toast.success('Your order has been confirmed!');
                            setTimeout(() => navigate(createPageUrl('Orders')), 2000);
                            setIsRecovering(false);
                            return;
                        }
                    }
                } catch (lookupErr) {
                    console.warn('[Checkout] Idempotency lookup failed (non-fatal):', lookupErr.message);
                }

                // Non-terminal network error — count attempt, cap retries
                const canRetry = pendingPayment.recordAttempt();
                if (!canRetry) {
                    pendingPayment.setTerminalStatus('terminal_manual_review');
                    setRecoveryError('We could not verify your previous payment after multiple attempts. Please check your orders page or contact support.');
                } else {
                    setRecoveryError('Could not verify your previous payment. Please check your orders or contact support.');
                }
            }).finally(() => {
                setIsRecovering(false);
            });
            };

            detectRecovery();
            }, [user, isGuest]);

    // Check if user is authenticated or guest
    const checkAuthStatus = async () => {
        try {
            const authenticated = await base44.auth.isAuthenticated();
            setIsGuest(!authenticated); // If not authenticated, they're a guest
            
            // Load user data if authenticated
            if (authenticated) {
                try {
                    const userData = await base44.auth.me();
                    setUser(userData);
                    
                    // Pre-fill phone if saved
                    if (userData.phone) {
                        setFormData(prev => ({ ...prev, phone: userData.phone }));
                        setIsExistingPhone(true);
                    }
                    // Pre-fill default or first saved address if available
                    if (userData.saved_addresses && userData.saved_addresses.length > 0) {
                        const defaultAddress = userData.saved_addresses.find(addr => addr.is_default) || userData.saved_addresses[0];
                        setFormData(prev => ({
                            ...prev,
                            delivery_address: defaultAddress.address || '',
                            door_number: defaultAddress.door_number || ''
                        }));
                        if (defaultAddress.coordinates) {
                            setDeliveryCoordinates(defaultAddress.coordinates);
                        }
                        setIsExistingAddress(true);
                        setShowManualAddressEntry(false);
                    } else {
                        setShowManualAddressEntry(true);
                    }
                } catch (error) {
                    console.error('Failed to load user data:', error);
                }
            }
        } catch (e) {
            setIsGuest(true); // On error, assume guest
        }
    };

    const checkEmailExists = async (email) => {
        if (!email || !email.includes('@')) return;
        
        setCheckingEmail(true);
        try {
            // LOW-3 FIX: Removed dead code that always set emailExists to false.
            // The check was never implemented. For now, assume emails are always unique at checkout.
            setEmailExists(false);
            setEmailChecked(true);
        } catch (error) {
            setEmailExists(false);
            setEmailChecked(false);
        } finally {
            setCheckingEmail(false);
        }
    };

    const handleEmailBlur = () => {
        if (formData.guest_email && !emailChecked) {
            checkEmailExists(formData.guest_email);
        }
    };

    // Fetch restaurant details from database
    const loadRestaurantName = async (id) => {
        try {
            // Query database for restaurant with matching ID
            const restaurants = await base44.entities.Restaurant.filter({ id });
            if (restaurants[0]) {
                setRestaurantName(restaurants[0].name); // Store name
                setRestaurant(restaurants[0]); // Store full restaurant object
            }
        } catch (e) {
            // Restaurant not found - continue without name
        }
    };

    // Re-run zone check when restaurantId or deliveryCoordinates change (handles async load race with saved address)
    useEffect(() => {
        if (!restaurantId || !deliveryCoordinates?.lat || !deliveryCoordinates?.lng) return;
        // AUDIT FIX: Run zone check for delivery orders only
        if (orderType !== 'delivery') return;

        let cancelled = false;
        setZoneCheckComplete(false);

        const runZoneCheck = async () => {
            try {
                const zoneInfo = await calculateDeliveryDetails(restaurantId, deliveryCoordinates);
                if (!cancelled) setDeliveryZoneInfo(zoneInfo);
            } catch (error) {
                console.error('Zone check failed:', error);
            } finally {
                if (!cancelled) setZoneCheckComplete(true);
            }
        };

        runZoneCheck();
        return () => { cancelled = true; };
    }, [restaurantId, deliveryCoordinates, orderType]);

    // ============================================
    // PRICE CALCULATIONS
    // ============================================
    
    // Calculate subtotal: sum of all item prices × quantities
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Tiered delivery logic (only applied when no delivery zone override)
    const tiered = restaurant?.tiered_delivery;
    const standardFee = restaurant?.delivery_fee ?? 0;
    const standardMin = restaurant?.minimum_order ?? 0;

    const zoneAvailable = deliveryZoneInfo?.available === true;
    const zoneMinimum = zoneAvailable ? (deliveryZoneInfo.minimumOrder || 0) : 0;
    const zoneFee = zoneAvailable && deliveryZoneInfo.deliveryFee != null ? deliveryZoneInfo.deliveryFee : null;

    // Base delivery fee and minimum — zone always wins
    let deliveryFee = orderType === 'collection' ? 0 : (zoneFee ?? standardFee);
    let minimumOrder = 0;

    if (orderType === 'delivery') {
        if (zoneAvailable) {
            // Zone found: apply tiered pricing on top of zone minimum
            const effectiveMinimum = zoneMinimum;
            if (tiered?.enabled && (tiered.lower_minimum ?? 0) > 0) {
                const lowerMin = tiered.lower_minimum;
                const lowerFee = tiered.lower_minimum_fee ?? 0;
                if (subtotal < lowerMin) {
                    minimumOrder = lowerMin;
                } else if (subtotal < effectiveMinimum) {
                    deliveryFee = lowerFee;
                    minimumOrder = effectiveMinimum;
                } else {
                    minimumOrder = effectiveMinimum;
                }
            } else {
                minimumOrder = effectiveMinimum;
            }
            } else {
            // No zone (or outside zone) — no tiered pricing, use standard minimum
            minimumOrder = standardMin;
            }
            }
            // MED-8 FIX: Fetch small_order_surcharge from restaurant config instead of hardcoding to 0
            // This allows restaurants to configure surcharges per their business logic
            const smallOrderSurcharge = restaurant?.small_order_surcharge ?? 0;

    // Discount from applied coupons and promotions
    // MED-4 FIX: Use integer (pence) arithmetic to avoid floating point drift
    // e.g. 10.01 + 1.99 - 2.00 in floats = 10.000000000000002
    const couponDiscountPence = appliedCoupons.reduce((sum, c) => sum + Math.round((c.discount || 0) * 100), 0);
    const promotionDiscountPence = appliedPromotions.reduce((sum, p) => sum + Math.round((p.discount || 0) * 100), 0);
    const discount = (couponDiscountPence + promotionDiscountPence) / 100;

    // Final total: all arithmetic in pence, then convert back to pounds
    const subtotalPence = Math.round(subtotal * 100);
    const deliveryFeePence = Math.round(deliveryFee * 100);
    const surcharge = Math.round(smallOrderSurcharge * 100);
    const discountPence = couponDiscountPence + promotionDiscountPence;
    const total = Math.max(0, (subtotalPence + deliveryFeePence + surcharge - discountPence)) / 100;

    const {
        clientSecret,
        showStripeForm,
        initializingPayment,
        stripeLoadedPromise,
        resetPaymentState: resetStripePaymentState,
        getSessionKey,
    } = usePaymentInit({
        paymentMethod,
        total,
        cart,
        restaurantId,
        restaurant,
        orderType,
        formData,
        isGuest,
        isExistingAddress,
        deliveryCoordinates,
        deliveryZoneInfo,
        zoneCheckComplete,
        isScheduled,
        scheduledFor,
        subtotal,
        deliveryFee,
        discount,
        smallOrderSurcharge,
    });

    const resetPaymentState = () => {
        resetStripePaymentState();
        setPaymentCompleted(false);
        paymentSuccessHandledRef.current = false;
        expressConfirmFiredRef.current = false;
        anyPaymentPathInFlightRef.current = false;
    };

    // CRIT-2 FIX: createOrder extracted to useCreateOrder hook — locked session key is now
    // enforced as required for card payments to prevent idempotency mismatches.
    const { createOrder } = useCreateOrder({
        cart, restaurantId, restaurantName, restaurant,
        orderType, isGuest, formData, isExistingAddress,
        deliveryCoordinates, deliveryFee, smallOrderSurcharge,
        subtotal, discount, total, isScheduled, scheduledFor,
        appliedCoupons, appliedPromotions, groupOrderId,
        clientSecret, paymentMethod,
        user, savePhone, saveAddress, addressLabel, setAsDefault,
        isExistingPhone, pointsPerPound,
        setIsSubmitting, setOrderPlaced, setTraceError, setUser,
    });

    // ============================================
    // FORM SUBMISSION - When user clicks "Place Order"
    // ============================================
    // Check if restaurant is currently closed and auto-enable scheduling
    const checkRestaurantStatus = () => {
        if (!restaurant) return false;

        const now = new Date();
        const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];

        let hours;
        if (orderType === 'collection' && restaurant.collection_hours) {
            hours = restaurant.collection_hours[dayName];
        } else if (orderType === 'delivery' && restaurant.delivery_hours) {
            hours = restaurant.delivery_hours[dayName];
        } else {
            hours = restaurant.opening_hours?.[dayName];
        }

        // If no specific hours but restaurant is marked as open, assume it's available
        if (!hours && restaurant.is_open) return false;
        if (!hours || hours.closed) return true;

        // Validate hours object has required fields
        if (!hours.open || !hours.close) return false;

        const [openHour, openMin] = hours.open.split(':').map(Number);
        const [closeHour, closeMin] = hours.close.split(':').map(Number);
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const openTime = openHour * 60 + openMin;
        const closeTime = closeHour * 60 + closeMin;

        // MED-1 FIX: Handle overnight restaurants (e.g., 22:00–02:00)
        const isOpen = closeTime > openTime
            ? currentTime >= openTime && currentTime < closeTime  // same-day: 09:00–17:00
            : currentTime >= openTime || currentTime < closeTime;  // overnight: 22:00–02:00
        return !isOpen;
    };

    // Get earliest available time for auto-scheduling
    const getEarliestScheduleTime = () => {
        if (!restaurant) return '';
        
        const now = new Date();
        const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
        
        let hours;
        if (orderType === 'collection' && restaurant.collection_hours) {
            hours = restaurant.collection_hours[dayName];
        } else if (orderType === 'delivery' && restaurant.delivery_hours) {
            hours = restaurant.delivery_hours[dayName];
        } else {
            hours = restaurant.opening_hours?.[dayName];
        }

        if (!hours || hours.closed) {
            for (let i = 1; i <= 7; i++) {
                const nextDay = new Date(now);
                nextDay.setDate(nextDay.getDate() + i);
                const nextDayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][nextDay.getDay()];
                
                let nextHours;
                if (orderType === 'collection' && restaurant.collection_hours) {
                    nextHours = restaurant.collection_hours[nextDayName];
                } else if (orderType === 'delivery' && restaurant.delivery_hours) {
                    nextHours = restaurant.delivery_hours[nextDayName];
                } else {
                    nextHours = restaurant.opening_hours?.[nextDayName];
                }

                if (nextHours && !nextHours.closed) {
                    const [hour, min] = nextHours.open.split(':').map(Number);
                    nextDay.setHours(hour, min, 0, 0);
                    return nextDay.toISOString().slice(0, 16);
                }
            }
            return '';
        }

        const [openHour, openMin] = hours.open.split(':').map(Number);
        const [closeHour, closeMin] = hours.close.split(':').map(Number);
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const openTime = openHour * 60 + openMin;
        const closeTime = closeHour * 60 + closeMin;

        // MED-1 FIX: Determine if restaurant is currently open (handles overnight)
        const isOpen = closeTime > openTime
            ? currentTime >= openTime && currentTime < closeTime  // same-day: 09:00–17:00
            : currentTime >= openTime || currentTime < closeTime;  // overnight: 22:00–02:00

        const scheduleTime = new Date(now);
        if (isOpen) {
            // Currently open - no scheduling needed (shouldn't reach here)
            return '';
        } else if (currentTime < openTime && closeTime > openTime) {
            // Before opening today (same-day restaurant) - schedule for today's opening
            scheduleTime.setHours(openHour, openMin, 0, 0);
        } else {
            // After closing today - find next open day
            for (let i = 1; i <= 7; i++) {
                const nextDay = new Date(now);
                nextDay.setDate(nextDay.getDate() + i);
                const nextDayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][nextDay.getDay()];
                let nextHours;
                if (orderType === 'collection' && restaurant.collection_hours) {
                    nextHours = restaurant.collection_hours[nextDayName];
                } else if (orderType === 'delivery' && restaurant.delivery_hours) {
                    nextHours = restaurant.delivery_hours[nextDayName];
                } else {
                    nextHours = restaurant.opening_hours?.[nextDayName];
                }
                if (nextHours && !nextHours.closed) {
                    const [h, m] = nextHours.open.split(':').map(Number);
                    nextDay.setHours(h, m, 0, 0);
                    return nextDay.toISOString().slice(0, 16);
                }
            }
            return '';
        }
        return scheduleTime.toISOString().slice(0, 16);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // CRITICAL: Block ALL submissions when card is selected
        if (paymentMethod === 'card') {
            if (!clientSecret) {
                toast.error('Please continue to payment first');
            } else {
                toast.error('Please complete the card payment form below');
            }
            return;
        }
        
        // CRITICAL SECURITY: Validate payment method is actually set
        if (!paymentMethod || (typeof paymentMethod !== 'string')) {
            toast.error('Please select a payment method');
            return;
        }
        
        // CRITICAL SECURITY: Check rate limiting — applies to both authenticated and guest users
        try {
            const rateLimitResponse = await base44.functions.invoke('enforceRateLimiting', {
                phone: formData.phone,
                guest_email: formData.guest_email
            });
            if (!rateLimitResponse?.data?.allowed) {
                toast.error(`Too many orders. Please wait ${rateLimitResponse?.data?.retryAfter || 60} seconds.`);
                return;
            }
        } catch (error) {
            // Non-fatal — log but don't block legitimate order
            console.error('Rate limit check failed:', error);
        }
        
        // ---- VALIDATION: Check Required Fields ----

        // For guest users, name and email are required
        if (isGuest && (!formData.guest_name || !formData.guest_email)) {
            console.log('BLOCKED: Guest name/email missing');
            toast.error('Please provide your name and email');
            return;
        }

        // Phone is always required
        if (!formData.phone) {
            console.log('BLOCKED: Phone missing');
            toast.error('Please provide your phone number');
            return;
        }

        // For delivery, address is ALWAYS required
        if (orderType === 'delivery') {
            // Check street address - strict validation
            if (!formData.delivery_address || typeof formData.delivery_address !== 'string' || formData.delivery_address.trim() === '') {
                console.log('BLOCKED: Delivery address missing or invalid');
                toast.error('Please select your delivery address');
                return;
            }

            // Only require door number for NEW addresses (not saved ones)
            if (!isExistingAddress) {
                if (!formData.door_number || typeof formData.door_number !== 'string' || formData.door_number.trim() === '') {
                    console.log('BLOCKED: Door number missing for new address');
                    toast.error('Please provide your door number (house/flat number)');
                    return;
                }
            }
            
            // Verify delivery coordinates exist
            if (!deliveryCoordinates || !deliveryCoordinates.lat || !deliveryCoordinates.lng) {
                console.log('BLOCKED: Delivery coordinates missing');
                toast.error('Please select a valid delivery address from the dropdown');
                return;
            }

            // ---- VALIDATION: Delivery Zone (for both new and existing addresses) ----
            // Check if zone check is still pending
            if (!zoneCheckComplete) {
                console.log('BLOCKED: Zone check still pending');
                toast.error('Checking delivery availability... please wait');
                return;
            }

            // CRITICAL: Check if delivery is explicitly unavailable (not just unchecked)
            if (deliveryZoneInfo?.available === false) {
                console.log('BLOCKED: Delivery not available to location');
                toast.error('Delivery is not available to your location');
                return;
            }
            
            // CRITICAL: If zone check completed but no availability info, still block
            if (zoneCheckComplete && !deliveryZoneInfo) {
                console.log('BLOCKED: Delivery availability unknown after check');
                toast.error('Unable to verify delivery to your location. Please try again.');
                return;
            }
        }

        // ---- VALIDATION: UK Phone Number Format ----
        const ukPhoneRegex = /^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$/;
        if (!ukPhoneRegex.test(formData.phone.replace(/\s/g, ''))) {
            console.log('BLOCKED: Invalid phone format');
            toast.error('Please enter a valid UK phone number');
            return;
        }
        
        // ---- VALIDATION: Restaurant must be open or order must be scheduled ----
        if (restaurant && !isScheduled) {
            const isClosed = checkRestaurantStatus();
            if (isClosed) {
                toast.error('This restaurant is currently closed. Please schedule your order for when they open.');
                const earliest = getEarliestScheduleTime();
                if (earliest) {
                    setScheduledFor(earliest);
                    setIsScheduled(true);
                }
                return;
            }
        }

        console.log('All validations passed, proceeding...');

        // For CASH: Show confirmation dialog
        if (paymentMethod === 'cash') {
            setShowCashConfirmation(true);
            return;
        }

        // For other payment methods: Create order immediately
        await createOrder();
    };

    const confirmCashOrder = async () => {
        setShowCashConfirmation(false);
        await createOrder();
    };

    // ISSUE #4 FIX: Warn users if they try to navigate away during order submission
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isSubmitting) {
                e.preventDefault();
                e.returnValue = 'Your order is being processed. Please wait.';
                return false;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isSubmitting]);

    const resetAnyPathInFlight = () => {
        anyPaymentPathInFlightRef.current = false;
    };

    const handleStripeSuccess = async (paymentIntentId) => {
        // FIX #1: Cross-path guard — blocks if Express Checkout or any other path already in-flight
        if (anyPaymentPathInFlightRef.current) {
            console.warn('[Checkout] Another payment path already in-flight — ignoring duplicate success');
            return;
        }
        anyPaymentPathInFlightRef.current = true;

        // ISSUE #4 FIX: Lock form immediately to block all back-button / double-submit races
        setIsSubmitting(true);

        // BUG-M03 FIX: Lock session key immediately to prevent rotation during payment processing
        const lockedSessionKey = getSessionKey();

        // Validate payment intent before proceeding
        if (!paymentIntentId || typeof paymentIntentId !== 'string') {
            console.error('[Checkout] Invalid payment intent ID:', paymentIntentId);
            toast.error('Invalid payment confirmation. Please try again.');
            setIsSubmitting(false);
            setPaymentCompleted(false);
            resetAnyPathInFlight();  // CRIT-3 FIX
            return;
        }

        // ── ATOMIC GUARD: Prevent duplicate order creation via ref (synchronous check) ────
        if (paymentSuccessHandledRef.current) {
            console.warn('[Checkout] payment_success_guard_blocked piId=' + paymentIntentId);
            checkoutTrace.log('payment_success_guard_blocked', { piId: paymentIntentId });
            setIsSubmitting(false);
            anyPaymentPathInFlightRef.current = false;
            return;
        }
        paymentSuccessHandledRef.current = true;
        
        checkoutTrace.log('payment_success_processing_started', { piId: paymentIntentId });
        console.log('[Checkout] ✅ Payment intent confirmed:', paymentIntentId);

        // ── DURABILITY WRITE: persist before any order creation attempt ────────
        // If the browser closes/refreshes after this line, the recovery flow on
        // next mount will detect this record and replay order creation safely.
        pendingPayment.save({
            // FIX #7: Bind to current user to prevent cross-user recovery
            paymentIntentId,
            idempotencyKey: lockedSessionKey,
            total,
            restaurantId,
            restaurantName,
            orderData: {
                restaurant_id: restaurantId,
                restaurant_name: restaurantName,
                items: cart,
                subtotal,
                delivery_fee: deliveryFee,
                small_order_surcharge: smallOrderSurcharge,
                discount,
                coupon_codes: appliedCoupons.length > 0 ? appliedCoupons.map(c => c.code) : [],
                total,
                payment_method: 'card',
                order_type: orderType,
                delivery_address: orderType === 'delivery'
                    ? (isExistingAddress ? formData.delivery_address : `${formData.door_number ? formData.door_number + ', ' : ''}${formData.delivery_address}`)
                    : (restaurant?.address || 'Collection'),
                delivery_coordinates: orderType === 'delivery' ? deliveryCoordinates : null,
                phone: formData.phone,
                notes: formData.notes,
                is_scheduled: isScheduled,
                scheduled_for: isScheduled ? scheduledFor : null,
                guest_name: formData.guest_name,
                guest_email: formData.guest_email,
                order_source: 'online',
            },
        }, user);

        // Mark payment as completed for UI only (not for concurrency guard)
        setPaymentCompleted(true);
        toast.success('Payment authorised! Creating your order...');
        
        try {
            // CRITICAL: Call createOrder() with paymentIntentId and lockedSessionKey
            // This ensures BOTH normal card entry AND express checkout converge
            // into the same secure order-creation path
            console.log('[Checkout] Initiating order creation with paymentIntentId:', paymentIntentId);
            await createOrder(paymentIntentId, lockedSessionKey);
        } catch (err) {
            // If order creation throws unexpectedly, ensure UI is not stuck
            // Reset guards only on retry-safe failures
            console.error('[Checkout] Unexpected error after payment success:', err.message);
            checkoutTrace.log('payment_success_processing_reset', { piId: paymentIntentId, reason: 'order_creation_exception' });
            toast.error('Order creation failed after payment. Please contact support with reference: ' + paymentIntentId);
            paymentSuccessHandledRef.current = false;
            setPaymentCompleted(false);
            expressConfirmFiredRef.current = false;
            resetAnyPathInFlight();
            setIsSubmitting(false);
        }
    };



    if (orderPlaced) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white rounded-3xl p-8 text-center max-w-md w-full shadow-xl"
                >
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="h-10 w-10 text-green-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Placed!</h2>
                    <p className="text-gray-500 mb-6">Your order has been confirmed and will be delivered soon.</p>
                    <div className="text-sm text-gray-400">Redirecting to your orders...</div>
                </motion.div>
            </div>
        );
    }

    // Recovery: show full-screen spinner while checking pending payment
    if (isRecovering) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-orange-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Checking your previous payment…</h2>
                    <p className="text-gray-500 text-sm">Please wait, this takes just a moment.</p>
                </div>
            </div>
        );
    }

    if (cart.length === 0 && !recoveryError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
                    <Link to={sessionStorage.getItem('customDomainRestaurantId') ? '/' : createPageUrl('Home')}>
                        <Button>Browse Restaurants</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Button
                            size="icon"
                            variant="ghost"
                            className="rounded-full"
                            onClick={() => {
                                if (restaurantId) {
                                    const isCustomDomainRestaurant = sessionStorage.getItem('customDomainRestaurantId') === restaurantId;
                                    navigate(isCustomDomainRestaurant ? '/' : createPageUrl('Restaurant') + `?id=${restaurantId}`);
                                } else {
                                    navigate(sessionStorage.getItem('customDomainRestaurantId') ? '/' : createPageUrl('Home'));
                                }
                            }}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className={`px-3 py-1.5 rounded-lg font-medium ${
                            orderType === 'delivery' 
                                ? 'bg-orange-100 text-orange-700' 
                                : 'bg-blue-100 text-blue-700'
                        }`}>
                            {orderType === 'delivery' ? '🚚 Delivery' : '🏪 Collection'}
                        </span>
                    </div>
                </div>
                </div>

            {recoveryError && (
                <div className="max-w-4xl mx-auto px-4 pt-4">
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
                        <span className="text-2xl mt-0.5">⚠️</span>
                        <div>
                            <p className="font-semibold text-amber-900 mb-1">Previous payment notice</p>
                            <p className="text-sm text-amber-800">{recoveryError}</p>
                            <div className="flex gap-3 mt-3">
                                <Link to={createPageUrl('Orders')}>
                                    <Button size="sm" variant="outline" className="h-9 border-amber-400 text-amber-800 hover:bg-amber-100">
                                        Check My Orders
                                    </Button>
                                </Link>
                                <Button size="sm" variant="ghost" className="h-9 text-amber-700" onClick={() => setRecoveryError(null)}>
                                    Dismiss
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="grid md:grid-cols-5 gap-8">
                    {/* Form */}
                    <div className="md:col-span-3">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {isGuest && (
                                <Card>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="flex items-center gap-2">
                                                <User className="h-5 w-5 text-orange-500" />
                                                Your Details
                                            </CardTitle>
                                            <Button
                                                type="button"
                                                variant="link"
                                                onClick={() => base44.auth.redirectToLogin(window.location.href)}
                                                className="text-orange-500 hover:text-orange-600 text-sm h-auto p-0"
                                            >
                                                Already registered? Sign in
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div>
                                            <Label htmlFor="guest_email">Email Address *</Label>
                                            <Input
                                                id="guest_email"
                                                type="email"
                                                placeholder="john@example.com"
                                                value={formData.guest_email}
                                                onChange={(e) => {
                                                    setFormData({ ...formData, guest_email: e.target.value });
                                                    setEmailChecked(false);
                                                    setEmailExists(false);
                                                }}
                                                onBlur={handleEmailBlur}
                                                className="h-12"
                                                required
                                            />
                                            {checkingEmail && (
                                                <p className="text-xs text-gray-500 mt-1">Checking...</p>
                                            )}
                                            {emailChecked && emailExists && (
                                                <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                                    <p className="text-sm text-orange-800 mb-2">This email is already registered!</p>
                                                    <Button
                                                        type="button"
                                                        onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                                                        size="sm"
                                                        className="bg-orange-500 hover:bg-orange-600 text-white h-9"
                                                    >
                                                        Sign in to continue
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <Label htmlFor="guest_name">Full Name *</Label>
                                            <Input
                                                id="guest_name"
                                                type="text"
                                                placeholder="John Smith"
                                                value={formData.guest_name}
                                                onChange={(e) => setFormData({ ...formData, guest_name: e.target.value })}
                                                className="h-12"
                                                required
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {orderType === 'delivery' && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <MapPin className="h-5 w-5 text-orange-500" />
                                            Delivery Address
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {/* Saved Addresses Section */}
                                        {!isGuest && !showManualAddressEntry && (
                                            <>
                                                <SavedAddressesSection 
                                                    savedAddresses={user?.saved_addresses || []}
                                                    onAddressSelect={async (address) => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            delivery_address: address.address || '',
                                                            door_number: address.door_number || '',
                                                            notes: address.instructions || ''
                                                        }));
                                                        setIsExistingAddress(true);

                                                        let coords = address.coordinates;

                                                        // If no coordinates stored, geocode the address
                                                        if (!coords || !coords.lat || !coords.lng) {
                                                            try {
                                                                const response = await fetch(
                                                                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address.address || '')}&countrycodes=GB&limit=1`
                                                                );
                                                                const results = await response.json();
                                                                if (results && results.length > 0) {
                                                                            const lat = parseFloat(results[0].lat);
                                                                            const lng = parseFloat(results[0].lon);
                                                                            // Validate coordinates are within UK bounds
                                                                            if (lat >= 49.8 && lat <= 58.7 && lng >= -8.6 && lng <= 1.8) {
                                                                                coords = { lat, lng };
                                                                            } else {
                                                                                console.warn('Geocoded address outside UK');
                                                                                toast.error('Address is outside our delivery area');
                                                                                return;
                                                                            }
                                                                        }
                                                                    } catch (error) {
                                                                        console.error('Geocoding saved address failed:', error);
                                                                        toast.error('Address lookup failed. Please try again.');
                                                                    }
                                                        }

                                                        // Setting coordinates triggers the zone-check useEffect
                                                        if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
                                                            setDeliveryCoordinates(coords);
                                                            setZoneCheckComplete(false);
                                                        } else {
                                                            setDeliveryCoordinates(null);
                                                            setZoneCheckComplete(false);
                                                            toast.error('Please select a valid saved address.');
                                                        }
                                                    }}
                                                />
                                                {/* Hidden fields to hold selected address values for form validation */}
                                                <input type="hidden" name="door_number" value={formData.door_number || ''} />
                                                <input type="hidden" name="delivery_address" value={formData.delivery_address || ''} />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setShowManualAddressEntry(true);
                                                        setIsExistingAddress(false);
                                                        setDeliveryCoordinates(null);
                                                        setDeliveryZoneInfo(null);
                                                        setZoneCheckComplete(false);
                                                        setFormData(prev => ({ ...prev, delivery_address: '', door_number: '' }));
                                                    }}
                                                    className="w-full"
                                                >
                                                    <MapPin className="h-4 w-4 mr-2" />
                                                    Use a Different Address
                                                </Button>
                                            </>
                                        )}
                                        
                                        {(isGuest || showManualAddressEntry) && (
                                            <>
                                                {!isGuest && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setShowManualAddressEntry(false);
                                                            // Reload default address
                                                            if (user?.saved_addresses?.length > 0) {
                                                                const defaultAddress = user.saved_addresses.find(addr => addr.is_default) || user.saved_addresses[0];
                                                                setFormData(prev => ({
                                                                    ...prev,
                                                                    delivery_address: defaultAddress.address || '',
                                                                    door_number: defaultAddress.door_number || ''
                                                                }));
                                                                if (defaultAddress.coordinates && Number.isFinite(defaultAddress.coordinates.lat) && Number.isFinite(defaultAddress.coordinates.lng)) {
                                                                    setDeliveryCoordinates(defaultAddress.coordinates);
                                                                    setZoneCheckComplete(false);
                                                                } else {
                                                                    setDeliveryCoordinates(null);
                                                                    setZoneCheckComplete(false);
                                                                }
                                                                setDeliveryZoneInfo(null);
                                                                setIsExistingAddress(true);
                                                            }
                                                        }}
                                                        className="w-full mb-3 text-orange-600 hover:text-orange-700"
                                                    >
                                                        ← Back to Saved Addresses
                                                    </Button>
                                                )}
                                                <div>
                                                    <Label htmlFor="door_number">Door Number / Flat *</Label>
                                                    <Input
                                                        id="door_number"
                                                        type="text"
                                                        placeholder="e.g., 42 or Flat 5B"
                                                        value={formData.door_number || ''}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, door_number: e.target.value });
                                                            setIsExistingAddress(false);
                                                        }}
                                                        className="h-12"
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor="address">Street Address *</Label>
                                                    <LocationPicker
                                                       value={formData.delivery_address}
                                                       onLocationSelect={(locationData) => {
                                                           setFormData({ ...formData, delivery_address: locationData.address });
                                                           setDeliveryCoordinates(locationData.coordinates || null);
                                                           setDeliveryZoneInfo(null);
                                                           setIsExistingAddress(false);
                                                           setZoneCheckComplete(false);
                                                       }}
                                                       className="[&>div]:h-12"
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {zoneCheckComplete && deliveryZoneInfo && deliveryZoneInfo.available !== undefined && (
                                            <div className={`p-3 rounded-lg border ${
                                                deliveryZoneInfo.available 
                                                    ? 'bg-green-50 border-green-200' 
                                                    : 'bg-red-50 border-red-200'
                                            }`}>
                                                {deliveryZoneInfo.available ? (
                                                    <div>
                                                        <p className="text-sm font-medium text-green-800">
                                                            ✓ Delivery available to {String(deliveryZoneInfo.zoneName || 'your area')}
                                                        </p>
                                                        <p className="text-xs text-green-700 mt-1">
                                                            Fee: £{Number(deliveryZoneInfo.deliveryFee || 0).toFixed(2)} • 
                                                            ETA: {String(deliveryZoneInfo.estimatedTime || '30-45 min')}
                                                        </p>
                                                        {deliveryZoneInfo.minimumOrder && (
                                                            <p className="text-xs text-green-700">
                                                                Min order: £{Number(deliveryZoneInfo.minimumOrder).toFixed(2)}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm font-medium text-red-800">
                                                        ✗ {String(deliveryZoneInfo.message || 'Delivery not available')}
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {!isGuest && !isExistingAddress && (
                                            <div className="space-y-3 pt-3 border-t">
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id="save-address"
                                                        checked={saveAddress}
                                                        onCheckedChange={setSaveAddress}
                                                    />
                                                    <label
                                                        htmlFor="save-address"
                                                        className="text-sm font-medium text-gray-700 cursor-pointer"
                                                    >
                                                        Save this address for future orders
                                                    </label>
                                                </div>
                                                {saveAddress && (
                                                    <div className="ml-6 space-y-3">
                                                        <div>
                                                            <Label htmlFor="address-label" className="text-xs">Address Type</Label>
                                                            <Select value={addressLabel} onValueChange={setAddressLabel}>
                                                                <SelectTrigger id="address-label" className="h-10">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="Home">🏠 Home</SelectItem>
                                                                    <SelectItem value="Work">💼 Work</SelectItem>
                                                                    <SelectItem value="Other">📍 Other</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id="set-default"
                                                                checked={setAsDefault}
                                                                onCheckedChange={setSetAsDefault}
                                                            />
                                                            <label
                                                                htmlFor="set-default"
                                                                className="text-xs text-gray-600 cursor-pointer"
                                                            >
                                                                Set as default address
                                                            </label>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                    </Card>
                                    )}

                            {orderType === 'collection' && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            🏪 Collection Details
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="p-4 bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-200 rounded-xl space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                                                    <span className="text-xl">🏪</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-green-900">FREE Collection</p>
                                                    <p className="text-xs text-green-700">No delivery fee!</p>
                                                </div>
                                            </div>
                                            <div className="space-y-2 pl-1">
                                                <p className="text-xs text-gray-700 flex items-start gap-2">
                                                    <span className="text-sm">📍</span>
                                                    <span><strong>Pick up from:</strong><br/>{restaurant?.address || 'Restaurant address'}</span>
                                                </p>
                                                <p className="text-xs text-gray-700 flex items-center gap-2">
                                                    <span className="text-sm">⏱️</span>
                                                    <span><strong>Ready in:</strong> 15-20 minutes</span>
                                                </p>
                                                <p className="text-xs text-gray-700 flex items-start gap-2">
                                                    <span className="text-sm">📱</span>
                                                    <span>You'll receive an order number with QR code via SMS</span>
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Phone className="h-5 w-5 text-orange-500" />
                                        Contact Number
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div>
                                        <Label htmlFor="phone">UK Mobile Number *</Label>
                                        <Input
                                            id="phone"
                                            type="tel"
                                            placeholder="07123 456789"
                                            value={formData.phone}
                                            onChange={(e) => {
                                                setFormData({ ...formData, phone: e.target.value });
                                                // Check if it's different from saved phone
                                                if (user?.phone && e.target.value !== user.phone) {
                                                    setIsExistingPhone(false);
                                                } else if (user?.phone && e.target.value === user.phone) {
                                                    setIsExistingPhone(true);
                                                }
                                            }}
                                            className="h-12"
                                            required
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Format: 07XXX XXXXXX</p>
                                    </div>
                                    {!isGuest && !isExistingPhone && (
                                        <div className="flex items-center space-x-2 pt-2">
                                            <Checkbox
                                                id="save-phone"
                                                checked={savePhone}
                                                onCheckedChange={setSavePhone}
                                            />
                                            <label
                                                htmlFor="save-phone"
                                                className="text-sm text-gray-700 cursor-pointer"
                                            >
                                                Save this phone number for future orders
                                            </label>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-orange-500" />
                                        Special Instructions
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Label htmlFor="special_instructions" className="sr-only">Special Instructions</Label>
                                    <Textarea
                                        id="special_instructions"
                                        placeholder="Any special requests? (e.g., no onions, extra sauce)"
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        rows={3}
                                    />
                                </CardContent>
                            </Card>

                            <ScheduleOrderSection
                                isScheduled={isScheduled}
                                onScheduleToggle={setIsScheduled}
                                scheduledFor={scheduledFor}
                                onScheduleChange={setScheduledFor}
                                restaurant={restaurant}
                                orderType={orderType}
                            />

                            <AvailablePromotions
                                restaurantId={restaurantId}
                                subtotal={subtotal}
                                appliedPromotions={appliedPromotions}
                                onPromotionApply={setAppliedPromotions}
                            />

                            <Card>
                                <CardHeader>
                                    <CardTitle>Discount Code</CardTitle>
                                    <p className="text-xs text-gray-500 mt-1">Enter a coupon or promo code</p>
                                </CardHeader>
                                <CardContent>
                                    <DiscountCodeInput
                                        restaurantId={restaurantId}
                                        subtotal={subtotal}
                                        cartItems={cart}
                                        onCouponApply={(coupons) => {
                                            setAppliedCoupons(coupons);
                                            if (paymentMethod === 'card') {
                                                resetPaymentState();
                                            }
                                        }}
                                        onPromotionApply={(promotions) => {
                                            setAppliedPromotions(promotions);
                                            if (paymentMethod === 'card') {
                                                resetPaymentState();
                                            }
                                        }}
                                    />
                                </CardContent>
                            </Card>

                            {(() => {
                                // Validation checks before showing payment methods
                                const isAddressValid = () => {
                                    if (orderType === 'delivery') {
                                        if (!formData.delivery_address || !formData.phone) return false;
                                        if (!isExistingAddress && !formData.door_number) return false;
                                        if (!deliveryCoordinates?.lat || !deliveryCoordinates?.lng) return false;
                                        if (!zoneCheckComplete || (deliveryZoneInfo && deliveryZoneInfo.available === false)) return false;
                                        return true;
                                    }
                                    return !!formData.phone;
                                };

                                if (!isAddressValid()) {
                                    return (
                                        <Card className="bg-orange-50 border-orange-200">
                                            <CardContent className="pt-6">
                                                <div className="flex items-start gap-3">
                                                    <div className="text-2xl">⚠️</div>
                                                    <div>
                                                        <p className="font-semibold text-orange-900 mb-1">Complete your delivery details first</p>
                                                        <p className="text-sm text-orange-800">
                                                            {orderType === 'delivery' ? (
                                                                deliveryZoneInfo?.available === false 
                                                                    ? 'Please select an address within our delivery zone'
                                                                    : 'Please enter a valid delivery address'
                                                            ) : (
                                                                'Please enter your phone number'
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                }

                                return (
                                    <PaymentMethods
                                        selectedMethod={paymentMethod}
                                        onMethodChange={(method) => {
                                            checkoutTrace.log('payment_method_selected', { method, prev: paymentMethod });
                                            setPaymentMethod(method);
                                            setTraceError(null);
                                            resetPaymentState();
                                        }}
                                        acceptsCash={restaurant?.accepts_cash_on_delivery !== false}
                                    />
                                );
                            })()}

                            {(paymentMethod === 'card') && showStripeForm && clientSecret ? (
                                <div className="space-y-6">
                                    {stripeLoadedPromise ? (
                                        <>
                                            {/* Express Checkout (wallets) — own Elements wrapper */}
                                            <Elements
                                                key={`express_${clientSecret}`}
                                                stripe={stripeLoadedPromise}
                                                options={{ clientSecret, appearance: { theme: 'stripe' } }}
                                            >
                                                <ExpressCheckoutFlow
                                                    amount={total}
                                                    clientSecret={clientSecret}
                                                    onSuccess={handleStripeSuccess}
                                                    onError={(error) => {
                                                        toast.error(String(error || 'Wallet payment failed'));
                                                    }}
                                                />
                                            </Elements>

                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 border-t border-gray-300"></div>
                                                <span className="text-xs text-gray-500 font-medium">OR PAY BY CARD</span>
                                                <div className="flex-1 border-t border-gray-300"></div>
                                            </div>

                                            {/* Card payment — own Elements wrapper */}
                                            <Card>
                                                <CardHeader>
                                                    <CardTitle>💳 Card Payment</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <Elements
                                                        key={`card_${clientSecret}`}
                                                        stripe={stripeLoadedPromise}
                                                        options={{ clientSecret, appearance: { theme: 'stripe' }, loader: 'auto' }}
                                                    >
                                                        <StripePaymentForm
                                                            amount={total}
                                                            clientSecret={clientSecret}
                                                            onSuccess={handleStripeSuccess}
                                                            expressConfirmFiredRef={expressConfirmFiredRef}
                                                            sessionKeyAtFormRender={getSessionKey()}
                                                            getSessionKey={getSessionKey}
                                                        />
                                                    </Elements>
                                                </CardContent>
                                            </Card>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Preparing payment form...
                                        </div>
                                    )}
                                </div>
                            ) : paymentMethod === 'cash' ? (
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                            Placing Order...
                                        </>
                                    ) : (
                                        `Place Order • £${total.toFixed(2)}`
                                    )}
                                </Button>
                            ) : null}
                        </form>
                    </div>

                    {/* Order Summary */}
                    <div className="md:col-span-2">
                        <CheckoutOrderSummary
                            cart={cart}
                            restaurantName={restaurantName}
                            subtotal={subtotal}
                            orderType={orderType}
                            deliveryFee={deliveryFee}
                            zoneAvailable={zoneAvailable}
                            tiered={tiered}
                            zoneMinimum={zoneMinimum}
                            smallOrderSurcharge={smallOrderSurcharge}
                            discount={discount}
                            appliedCoupons={appliedCoupons}
                            appliedPromotions={appliedPromotions}
                            total={total}
                            minimumOrder={minimumOrder}
                            restaurant={restaurant}
                            pointsPerPound={pointsPerPound}
                        />
                    </div>
                </div>
            </div>

            {/* Cash Confirmation Dialog */}
            {showCashConfirmation && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
                    >
                        <div className="text-center">
                            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl">💵</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                Confirm Cash Payment
                            </h3>
                            <p className="text-gray-600 mb-2">
                                You'll pay <span className="font-bold text-orange-500">£{total.toFixed(2)}</span> in cash when your order arrives.
                            </p>
                            <p className="text-sm text-gray-500 mb-6">
                                Please have the exact amount ready or small change.
                            </p>
                            <div className="space-y-2">
                                <Button
                                    onClick={confirmCashOrder}
                                    disabled={isSubmitting}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                            Placing Order...
                                        </>
                                    ) : (
                                        'Confirm Order'
                                    )}
                                </Button>
                                <Button
                                    onClick={() => setShowCashConfirmation(false)}
                                    variant="outline"
                                    disabled={isSubmitting}
                                    className="w-full h-12"
                                >
                                    Go Back
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}