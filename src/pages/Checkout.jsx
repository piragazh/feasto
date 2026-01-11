// ============================================
// CHECKOUT PAGE - Handles order placement and payment
// ============================================
// This page manages the entire checkout process including:
// - Guest and authenticated user checkout
// - Address and contact information collection
// - Payment method selection (Cash, Card via Stripe)
// - Order validation and submission
// - Delivery zone checking

import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client'; // SDK to interact with backend
import { useNavigate, Link } from 'react-router-dom'; // Navigation tools
import { createPageUrl } from '@/utils'; // Helper to create page URLs
import { calculateDeliveryDetails } from '@/components/checkout/DeliveryZoneCalculator'; // Check delivery zones
import { Button } from "@/components/ui/button"; // UI Components
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, MapPin, Phone, FileText, Loader2, CheckCircle, User } from 'lucide-react'; // Icons
import CouponInput from '@/components/checkout/CouponInput'; // Coupon application component
import PromotionCodeInput from '@/components/checkout/PromotionCodeInput'; // Promotion code application
import PaymentMethods from '@/components/checkout/PaymentMethods'; // Payment selection component
import ScheduleOrderSection from '@/components/checkout/ScheduleOrderSection'; // Schedule future orders
import GroupOrderSection from '@/components/checkout/GroupOrderSection'; // Group order functionality
import LocationPicker from '@/components/location/LocationPicker'; // Address autocomplete
import { motion } from 'framer-motion'; // Animations
import { toast } from 'sonner'; // Toast notifications
import { loadStripe } from '@stripe/stripe-js'; // Stripe payment integration
import { Elements } from '@stripe/react-stripe-js';
import StripePaymentForm from '@/components/checkout/StripePaymentForm';

// Initialize Stripe - fetch public key from backend
let stripePromise = null;
const initializeStripe = async () => {
    if (stripePromise) return stripePromise;
    
    try {
        const response = await base44.functions.invoke('getStripePublicKey');
        if (response?.data?.publicKey) {
            console.log('✅ Stripe public key loaded:', response.data.publicKey.substring(0, 20) + '...');
            stripePromise = loadStripe(response.data.publicKey);
            return stripePromise;
        } else {
            console.error('❌ No public key in response');
            return null;
        }
    } catch (error) {
        console.error('❌ Failed to load Stripe key:', error);
        return null;
    }
};

// Main Checkout Component
export default function Checkout() {
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
    
    // Discounts and Special Orders
    const [appliedCoupon, setAppliedCoupon] = useState(null); // Applied coupon details
    const [appliedPromotion, setAppliedPromotion] = useState(null); // Applied promotion details
    const [isScheduled, setIsScheduled] = useState(false); // Is this a scheduled order?
    const [scheduledFor, setScheduledFor] = useState(''); // When to deliver (if scheduled)
    const [groupOrderId, setGroupOrderId] = useState(null); // Group order session ID
    const [shareCode, setShareCode] = useState(null); // Code to share group order
    
    // Delivery Zone Information
    const [deliveryZoneInfo, setDeliveryZoneInfo] = useState(null); // Delivery availability and fees
    const [zoneCheckComplete, setZoneCheckComplete] = useState(false); // Has zone check finished?
    
    // Payment Processing (Stripe)
    const [clientSecret, setClientSecret] = useState(''); // Stripe payment intent secret
    const [showStripeForm, setShowStripeForm] = useState(false); // Show Stripe card form?
    const [paymentMethod, setPaymentMethod] = useState('card'); // Selected payment method (default: card)
    const [paymentCompleted, setPaymentCompleted] = useState(false); // Track if card payment is completed
    const [initializingPayment, setInitializingPayment] = useState(false);
    
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
        
        // Restore cart if items exist
        if (savedCart) {
            setCart(JSON.parse(savedCart)); // Convert JSON string back to array
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
    }, []); // Empty array means this runs once when component mounts

    // Check if user is authenticated or guest
    const checkAuthStatus = async () => {
        try {
            const authenticated = await base44.auth.isAuthenticated();
            setIsGuest(!authenticated); // If not authenticated, they're a guest
        } catch (e) {
            setIsGuest(true); // On error, assume guest
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

    // ============================================
    // PRICE CALCULATIONS
    // ============================================
    
    // Calculate subtotal: sum of all item prices × quantities
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Delivery fee: FREE for collection, otherwise use zone-specific or restaurant default
    const deliveryFee = orderType === 'collection' ? 0 : (deliveryZoneInfo?.deliveryFee ?? restaurant?.delivery_fee ?? 2.99);

    // Small order surcharge: if subtotal is below minimum order, add the difference (only for delivery)
    const minimumOrder = restaurant?.minimum_order || 0;
    const smallOrderSurcharge = orderType === 'delivery' && minimumOrder > 0 && subtotal < minimumOrder 
        ? (minimumOrder - subtotal) 
        : 0;

    // Discount from applied coupon or promotion (if any)
    const couponDiscount = appliedCoupon?.discount || 0;
    const promotionDiscount = appliedPromotion?.discount || 0;
    const discount = couponDiscount + promotionDiscount;

    // Final total = subtotal + delivery + surcharge - discount
    const total = subtotal + deliveryFee + smallOrderSurcharge - discount;

    // Initialize payment intent when card payment is selected and form is valid
    useEffect(() => {
        const initPayment = async () => {
            if (paymentMethod !== 'card') {
                setClientSecret('');
                setShowStripeForm(false);
                return;
            }

            if (clientSecret || initializingPayment) return;

            // Basic validation before initializing payment
            if (!formData.phone) return;
            if (orderType === 'delivery' && (!formData.door_number || !formData.delivery_address)) return;
            if (isGuest && (!formData.guest_name || !formData.guest_email)) return;

            setInitializingPayment(true);
            try {
                const stripe = await initializeStripe();
                if (!stripe) {
                    toast.error('Payment system unavailable');
                    setInitializingPayment(false);
                    return;
                }

                const response = await base44.functions.invoke('createPaymentIntent', {
                    amount: total,
                    currency: 'gbp',
                    metadata: {
                        restaurant_id: restaurantId,
                        restaurant_name: restaurantName
                    }
                });

                if (response?.data?.clientSecret) {
                    setClientSecret(response.data.clientSecret);
                    setShowStripeForm(true);
                }
            } catch (error) {
                console.error('Payment init error:', error);
                toast.error('Failed to initialize payment');
            } finally {
                setInitializingPayment(false);
            }
        };

        initPayment();
    }, [paymentMethod, formData.phone, formData.door_number, formData.delivery_address, formData.guest_name, formData.guest_email, total]);

    // ============================================
    // FORM SUBMISSION - When user clicks "Place Order"
    // ============================================
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        console.log('=== CHECKOUT SUBMIT ===');
        console.log('Payment Method:', paymentMethod);
        console.log('Payment Completed:', paymentCompleted);
        
        // CRITICAL: Block ALL submissions when card is selected
        if (paymentMethod === 'card') {
            console.log('BLOCKED: Card payment selected - form submission not allowed');
            toast.error('Please complete the card payment form below');
            return;
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

        // For delivery, door number and address are required
        if (orderType === 'delivery' && (!formData.door_number || !formData.delivery_address)) {
            console.log('BLOCKED: Delivery address missing');
            toast.error('Please provide your delivery address');
            return;
        }

        // ---- VALIDATION: UK Phone Number Format ----
        const ukPhoneRegex = /^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$/;
        if (!ukPhoneRegex.test(formData.phone.replace(/\s/g, ''))) {
            console.log('BLOCKED: Invalid phone format');
            toast.error('Please enter a valid UK phone number');
            return;
        }

        // ---- VALIDATION: Delivery Zone (only for delivery orders) ----
        if (orderType === 'delivery') {
            if (deliveryZoneInfo && !deliveryZoneInfo.available) {
                console.log('BLOCKED: Delivery not available');
                toast.error('Delivery is not available to your location');
                return;
            }
        }
        
        console.log('All validations passed, proceeding...');

        // For CASH: Create order immediately
        await createOrder();
    };

    const createOrder = async (paymentIntentId = null) => {
        // ABSOLUTE CRITICAL: Block any order creation if card payment was initiated but not completed
        if (clientSecret && !paymentIntentId) {
            toast.error('❌ Card payment was initiated. Please complete payment or refresh the page.');
            setIsSubmitting(false);
            return;
        }

        // ABSOLUTE CRITICAL: Block any order creation if card was selected without payment
        if (paymentMethod === 'card' && !paymentIntentId) {
            toast.error('❌ Payment required. Please complete card payment first.');
            setIsSubmitting(false);
            return;
        }
        
        setIsSubmitting(true);

        try {
            // CRITICAL: Determine actual payment method based on paymentIntentId presence
            const actualPaymentMethod = paymentIntentId ? 'card' : paymentMethod;
            
            // CRITICAL: If no paymentIntentId, verify it's NOT a card payment
            if (!paymentIntentId && (actualPaymentMethod === 'card' || actualPaymentMethod === 'apple_pay' || actualPaymentMethod === 'google_pay')) {
                toast.error('❌ Online payment required but not completed.');
                setIsSubmitting(false);
                return;
            }
            
            // CRITICAL: If paymentIntentId exists, this MUST be a card payment
            if (paymentIntentId) {
                // Verify payment intent is valid
                if (typeof paymentIntentId !== 'string' || paymentIntentId.length < 10) {
                    toast.error('Invalid payment verification. Please try again.');
                    setIsSubmitting(false);
                    return;
                }
            }

            // Validate cart
            if (!cart || cart.length === 0) {
                toast.error('Your cart is empty');
                setIsSubmitting(false);
                return;
            }

            // Validate restaurant
            if (!restaurantId || !restaurantName) {
                toast.error('Restaurant information missing');
                setIsSubmitting(false);
                return;
            }

            const fullAddress = orderType === 'delivery' 
                ? `${formData.door_number}, ${formData.delivery_address}`
                : restaurant?.address || 'Collection';
            
            // Generate order number for collection orders
            const orderNumber = orderType === 'collection' 
                ? `C-${Date.now().toString().slice(-6)}` 
                : null;

            const orderData = {
                order_number: orderNumber,
                restaurant_id: restaurantId,
                restaurant_name: restaurantName,
                items: cart,
                subtotal,
                delivery_fee: deliveryFee,
                small_order_surcharge: smallOrderSurcharge,
                discount: discount,
                coupon_code: appliedCoupon?.code,
                promotion_code: appliedPromotion?.promotion_code,
                total,
                payment_method: actualPaymentMethod,
                order_type: orderType,
                status: 'pending',
                delivery_address: orderType === 'delivery' ? fullAddress : restaurant?.address || 'Collection',
                delivery_coordinates: orderType === 'delivery' ? deliveryCoordinates : null,
                phone: formData.phone,
                notes: formData.notes,
                estimated_delivery: isScheduled ? 'Scheduled' : (orderType === 'collection' ? '15-20 minutes' : '30-45 minutes'),
                is_scheduled: isScheduled,
                scheduled_for: isScheduled ? scheduledFor : null,
                is_group_order: !!groupOrderId,
                group_order_id: groupOrderId,
                payment_intent_id: paymentIntentId
            };

            // Add guest info if not logged in
            if (isGuest) {
                orderData.guest_name = formData.guest_name;
                orderData.guest_email = formData.guest_email;
            }

            const newOrder = await base44.entities.Order.create(orderData);

            if (!newOrder || !newOrder.id) {
                throw new Error('Order creation failed');
            }

            // Update group order status if applicable
            if (groupOrderId) {
                try {
                    await base44.entities.GroupOrder.update(groupOrderId, { status: 'placed' });
                } catch (error) {
                    console.error('Failed to update group order:', error);
                }
            }

            // Increment coupon usage if applied
            if (appliedCoupon) {
                try {
                    await base44.entities.Coupon.update(appliedCoupon.id, {
                        usage_count: (appliedCoupon.usage_count || 0) + 1
                    });
                } catch (error) {
                    console.error('Failed to update coupon usage:', error);
                }
            }

            // Increment promotion usage and update stats if applied
            if (appliedPromotion) {
                try {
                    await base44.entities.Promotion.update(appliedPromotion.id, {
                        usage_count: (appliedPromotion.usage_count || 0) + 1,
                        total_revenue_generated: (appliedPromotion.total_revenue_generated || 0) + total,
                        total_discount_given: (appliedPromotion.total_discount_given || 0) + promotionDiscount
                    });
                } catch (error) {
                    console.error('Failed to update promotion usage:', error);
                }
            }

            // Send SMS confirmation to customer
            try {
                const orderNumber = orderType === 'collection' ? orderNumber : `#${newOrder.id.slice(-6)}`;
                const customerMessage = orderType === 'collection'
                    ? `Thank you for your order! Your collection order ${orderNumber} has been placed at ${restaurantName}. You'll receive updates via SMS. Show your order number when collecting.`
                    : `Thank you for your order! Order ${orderNumber} from ${restaurantName} has been placed. You'll receive updates as your order is prepared and dispatched.`;

                await base44.functions.invoke('sendSMS', {
                    to: formData.phone,
                    message: customerMessage
                });
            } catch (smsError) {
                // SMS failed but order still placed - don't block user
            }

            // Notify restaurant of new order
            try {
                await base44.functions.invoke('notifyRestaurantNewOrder', {
                    orderId: newOrder.id,
                    restaurantName: restaurantName
                });
            } catch (notifyError) {
                // Notification failed but order still placed
            }

            localStorage.removeItem('cart');
            localStorage.removeItem('cartRestaurantId');
            localStorage.removeItem('groupOrderId');
            localStorage.removeItem('orderType');
            setOrderPlaced(true);

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
                };

    const handleStripeSuccess = async (paymentIntentId) => {
        // Validate payment intent before proceeding
        if (!paymentIntentId || typeof paymentIntentId !== 'string') {
            toast.error('Invalid payment confirmation. Please try again.');
            setIsSubmitting(false);
            setPaymentCompleted(false);
            return;
        }
        
        // Mark payment as completed
        setPaymentCompleted(true);
        toast.success('Payment successful!');
        await createOrder(paymentIntentId);
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

    if (cart.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
                    <Link to={createPageUrl('Home')}>
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
                        <button onClick={() => {
                            if (restaurantId) {
                                navigate(createPageUrl('Restaurant') + `?id=${restaurantId}`);
                            } else {
                                navigate(createPageUrl('Home'));
                            }
                        }}>
                            <Button size="icon" variant="ghost" className="rounded-full">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </button>
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

            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="grid md:grid-cols-5 gap-8">
                    {/* Form */}
                    <div className="md:col-span-3">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {isGuest && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <User className="h-5 w-5 text-orange-500" />
                                            Your Details
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
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
                                        <div>
                                            <Label htmlFor="guest_email">Email Address *</Label>
                                            <Input
                                                id="guest_email"
                                                type="email"
                                                placeholder="john@example.com"
                                                value={formData.guest_email}
                                                onChange={(e) => setFormData({ ...formData, guest_email: e.target.value })}
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
                                    <CardContent className="space-y-3">{orderType === 'delivery' ? (
                                        <>
                                            <div>
                                                <Label htmlFor="door_number">Door Number / Flat *</Label>
                                                <Input
                                                    id="door_number"
                                                    type="text"
                                                    placeholder="e.g., 42 or Flat 5B"
                                                    value={formData.door_number}
                                                    onChange={(e) => setFormData({ ...formData, door_number: e.target.value })}
                                                    className="h-12"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor="address">Street Address *</Label>
                                                <LocationPicker
                                                    onLocationSelect={async (locationData) => {
                                                        setFormData({ ...formData, delivery_address: locationData.address });
                                                        setDeliveryCoordinates(locationData.coordinates);

                                                        if (locationData.coordinates && restaurantId) {
                                                            setZoneCheckComplete(false);
                                                            const zoneInfo = await calculateDeliveryDetails(restaurantId, locationData.coordinates);
                                                            setDeliveryZoneInfo(zoneInfo);
                                                            setZoneCheckComplete(true);
                                                        }
                                                    }}
                                                    className="[&>div]:h-12"
                                                />
                                            </div>

                                            {zoneCheckComplete && deliveryZoneInfo && (
                                                <div className={`p-3 rounded-lg border ${
                                                    deliveryZoneInfo.available 
                                                        ? 'bg-green-50 border-green-200' 
                                                        : 'bg-red-50 border-red-200'
                                                }`}>
                                                    {deliveryZoneInfo.available ? (
                                                        <div>
                                                            <p className="text-sm font-medium text-green-800">
                                                                ✓ Delivery available to {deliveryZoneInfo.zoneName}
                                                            </p>
                                                            <p className="text-xs text-green-700 mt-1">
                                                                Fee: £{deliveryZoneInfo.deliveryFee.toFixed(2)} • 
                                                                ETA: {deliveryZoneInfo.estimatedTime}
                                                            </p>
                                                            {deliveryZoneInfo.minOrderValue && (
                                                                <p className="text-xs text-green-700">
                                                                    Min order: £{deliveryZoneInfo.minOrderValue.toFixed(2)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm font-medium text-red-800">
                                                            ✗ {deliveryZoneInfo.message}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                            </>
                                            ) : null}
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
                                <CardContent>
                                    <Label htmlFor="phone">UK Mobile Number *</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        placeholder="07123 456789"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="h-12"
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Format: 07XXX XXXXXX</p>
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
                                    <Textarea
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
                            />

                            <Card>
                                <CardHeader>
                                    <CardTitle>Have a Coupon?</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <CouponInput
                                        restaurantId={restaurantId}
                                        subtotal={subtotal}
                                        onCouponApply={setAppliedCoupon}
                                    />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Have a Promotion Code?</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <PromotionCodeInput
                                        restaurantId={restaurantId}
                                        subtotal={subtotal}
                                        onPromotionApply={setAppliedPromotion}
                                    />
                                </CardContent>
                            </Card>

                            <PaymentMethods
                                selectedMethod={paymentMethod}
                                onMethodChange={(method) => {
                                    setPaymentMethod(method);
                                    setClientSecret('');
                                    setShowStripeForm(false);
                                    setPaymentCompleted(false);
                                }}
                                acceptsCash={restaurant?.accepts_cash_on_delivery !== false}
                            />

                            {(paymentMethod === 'card') && showStripeForm && clientSecret ? (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>💳 Payment Details</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {stripePromise ? (
                                            <Elements 
                                               stripe={stripePromise} 
                                               options={{ 
                                                   clientSecret,
                                                   appearance: {
                                                       theme: 'stripe'
                                                   },
                                                   loader: 'auto'
                                               }}
                                            >
                                                <StripePaymentForm
                                                    amount={total}
                                                    onSuccess={handleStripeSuccess}
                                                />
                                            </Elements>
                                        ) : (
                                            <div className="text-center py-4">
                                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-500" />
                                                <p className="text-sm text-gray-500 mt-2">Loading payment form...</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ) : (paymentMethod === 'card') && initializingPayment ? (
                                <div className="text-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-500 mb-2" />
                                    <p className="text-sm text-gray-500">Preparing payment form...</p>
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
                        <Card className="sticky top-24">
                            <CardHeader>
                                <CardTitle>Order Summary</CardTitle>
                                {restaurantName && (
                                    <p className="text-sm text-gray-500">from {restaurantName}</p>
                                )}
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {cart.map((item, idx) => (
                                    <div key={`${item.menu_item_id}-${idx}`}>
                                        <div className="flex justify-between">
                                            <div className="flex gap-2 flex-1">
                                                <span className="text-gray-500">{item.quantity}x</span>
                                                <div className="flex-1">
                                                    <span>{item.name}</span>
                                                    {item.customizations && Object.keys(item.customizations).length > 0 && (
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {Object.entries(item.customizations).map(([key, value]) => (
                                                                <div key={key}>
                                                                    {key}: {Array.isArray(value) ? value.join(', ') : value}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="font-medium">£{(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                                
                                <div className="border-t pt-4 space-y-2">
                                    <div className="flex justify-between text-gray-600">
                                        <span>Subtotal</span>
                                        <span>£{subtotal.toFixed(2)}</span>
                                    </div>
                                    {orderType === 'delivery' && (
                                        <div className="flex justify-between text-gray-600">
                                            <span>Delivery Fee</span>
                                            <span>£{deliveryFee.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {orderType === 'collection' && (
                                        <div className="flex justify-between text-green-600 font-semibold">
                                            <span>🏪 Collection Discount</span>
                                            <span>FREE</span>
                                        </div>
                                    )}
                                    {smallOrderSurcharge > 0 && (
                                        <div className="flex justify-between text-orange-600">
                                            <span>Small Order Fee</span>
                                            <span>£{smallOrderSurcharge.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {couponDiscount > 0 && (
                                        <div className="flex justify-between text-green-600">
                                            <span>Coupon ({appliedCoupon?.code})</span>
                                            <span>-£{couponDiscount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {promotionDiscount > 0 && (
                                        <div className="flex justify-between text-green-600">
                                            <span>Promotion ({appliedPromotion?.promotion_code})</span>
                                            <span>-£{promotionDiscount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                        <span>Total</span>
                                        <span>£{total.toFixed(2)}</span>
                                    </div>
                                    {smallOrderSurcharge > 0 && (
                                        <div className="text-xs text-gray-500 pt-1">
                                            * Minimum order: £{minimumOrder.toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}