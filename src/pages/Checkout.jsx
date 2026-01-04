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
import { ArrowLeft, MapPin, Phone, FileText, Loader2, CheckCircle } from 'lucide-react'; // Icons
import CouponInput from '@/components/checkout/CouponInput'; // Coupon application component
import PaymentMethods from '@/components/checkout/PaymentMethods'; // Payment selection component
import ScheduleOrderSection from '@/components/checkout/ScheduleOrderSection'; // Schedule future orders
import GroupOrderSection from '@/components/checkout/GroupOrderSection'; // Group order functionality
import LocationPicker from '@/components/location/LocationPicker'; // Address autocomplete
import { motion } from 'framer-motion'; // Animations
import { toast } from 'sonner'; // Toast notifications
import { loadStripe } from '@stripe/stripe-js'; // Stripe payment integration
import { Elements } from '@stripe/react-stripe-js';
import StripePaymentForm from '@/components/checkout/StripePaymentForm';

// Initialize Stripe with public key from environment variables
const stripePromise = loadStripe(import.meta.env.STRIPE_PUBLIC_KEY || '');

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
    const [paymentMethod, setPaymentMethod] = useState('cash'); // Selected payment method
    
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
            console.error(e); // Log any errors
        }
    };

    // ============================================
    // PRICE CALCULATIONS
    // ============================================
    
    // Calculate subtotal: sum of all item prices × quantities
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Delivery fee: FREE for collection, otherwise use zone-specific or restaurant default
    const deliveryFee = orderType === 'collection' ? 0 : (deliveryZoneInfo?.deliveryFee ?? restaurant?.delivery_fee ?? 2.99);
    
    // Discount from applied coupon (if any)
    const discount = appliedCoupon?.discount || 0;
    
    // Final total = subtotal + delivery - discount
    const total = subtotal + deliveryFee - discount;

    // ============================================
    // FORM SUBMISSION - When user clicks "Place Order"
    // ============================================
    const handleSubmit = async (e) => {
        e.preventDefault(); // Prevent page reload
        
        // ---- VALIDATION: Check Required Fields ----
        
        // For guest users, name and email are required
        if (isGuest && (!formData.guest_name || !formData.guest_email)) {
            toast.error('Please provide your name and email');
            return; // Stop submission
        }
        
        // Door number, address, and phone are always required
        if (!formData.door_number || !formData.delivery_address || !formData.phone) {
            toast.error('Please fill in all required fields');
            return;
        }

        // ---- VALIDATION: UK Phone Number Format ----
        // Pattern matches: 07123456789, 07123 456789, +44 7123 456789
        const ukPhoneRegex = /^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$/;
        if (!ukPhoneRegex.test(formData.phone.replace(/\s/g, ''))) {
            toast.error('Please enter a valid UK phone number');
            return;
        }

        // ---- VALIDATION: Delivery Zone ----
        // Check if delivery is available to this address
        if (deliveryZoneInfo && !deliveryZoneInfo.available) {
            toast.error('Delivery is not available to your location');
            return;
        }

        // Check if order meets minimum value for delivery zone
        if (deliveryZoneInfo?.minOrderValue && subtotal < deliveryZoneInfo.minOrderValue) {
            toast.error(`Minimum order value for this area is £${deliveryZoneInfo.minOrderValue.toFixed(2)}`);
            return;
        }

        // ---- PAYMENT PROCESSING ----
        
        // For CARD payments: Initialize Stripe payment flow
        if (paymentMethod === 'card') {
            setIsSubmitting(true); // Show loading state
            try {
                // Call backend function to create Stripe payment intent
                const response = await base44.functions.invoke('createPaymentIntent', {
                    amount: total, // Total amount in pounds
                    currency: 'gbp', // British Pounds
                    metadata: {
                        restaurant_id: restaurantId,
                        restaurant_name: restaurantName
                    }
                });

                // If successful, show Stripe payment form
                if (response.data.clientSecret) {
                    setClientSecret(response.data.clientSecret); // Store secret for Stripe
                    setShowStripeForm(true); // Display card input form
                }
            } catch (error) {
                toast.error('Failed to initialize payment. Please try again.');
            } finally {
                setIsSubmitting(false); // Hide loading state
            }
            return; // Stop here, wait for card payment
        }

        // For CASH and other methods: Create order immediately
        await createOrder();
    };

    const createOrder = async (paymentIntentId = null) => {
        setIsSubmitting(true);

        try {
            const fullAddress = `${formData.door_number}, ${formData.delivery_address}`;
            
            const orderData = {
                restaurant_id: restaurantId,
                restaurant_name: restaurantName,
                items: cart,
                subtotal,
                delivery_fee: deliveryFee,
                discount: discount,
                coupon_code: appliedCoupon?.code,
                total,
                payment_method: paymentMethod,
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

            await base44.entities.Order.create(orderData);

            // Update group order status if applicable
            if (groupOrderId) {
                await base44.entities.GroupOrder.update(groupOrderId, { status: 'placed' });
            }

            // Increment coupon usage if applied
            if (appliedCoupon) {
                await base44.entities.Coupon.update(appliedCoupon.id, {
                    usage_count: (appliedCoupon.usage_count || 0) + 1
                });
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
            toast.error('Failed to place order. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStripeSuccess = async (paymentIntentId) => {
        toast.success('Payment successful!');
        await createOrder(paymentIntentId);
    };

    const handleStripeError = (errorMessage) => {
        toast.error(errorMessage || 'Payment failed. Please try again.');
        setShowStripeForm(false);
        setClientSecret('');
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
                        <Link to={createPageUrl('Home')}>
                            <Button size="icon" variant="ghost" className="rounded-full">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
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

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <MapPin className="h-5 w-5 text-orange-500" />
                                        Delivery Address
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {orderType === 'delivery' ? (
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
                                    ) : (
                                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                            <p className="text-sm font-medium text-blue-900 mb-1">
                                                🏪 Collection Order
                                            </p>
                                            <p className="text-xs text-blue-700">
                                                Collect from: {restaurant?.address || 'Restaurant address'}
                                            </p>
                                            <p className="text-xs text-blue-700 mt-1">
                                                Ready in: 15-20 minutes
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                                </Card>

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

                            <PaymentMethods
                                selectedMethod={paymentMethod}
                                onMethodChange={setPaymentMethod}
                            />

                            {showStripeForm && clientSecret && paymentMethod === 'card' ? (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Payment Details</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <Elements stripe={stripePromise} options={{ clientSecret }}>
                                            <StripePaymentForm
                                                amount={total}
                                                onSuccess={handleStripeSuccess}
                                                onError={handleStripeError}
                                            />
                                        </Elements>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                            {paymentMethod === 'card' ? 'Initializing Payment...' : 'Placing Order...'}
                                        </>
                                    ) : (
                                        `Place Order • £${total.toFixed(2)}`
                                    )}
                                </Button>
                            )}
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
                                    <div className="flex justify-between text-gray-600">
                                        <span>{orderType === 'collection' ? 'Collection Fee' : 'Delivery Fee'}</span>
                                        <span>{orderType === 'collection' ? 'FREE' : `£${deliveryFee.toFixed(2)}`}</span>
                                    </div>
                                    {discount > 0 && (
                                        <div className="flex justify-between text-green-600">
                                            <span>Discount ({appliedCoupon?.code})</span>
                                            <span>-£{discount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                        <span>Total</span>
                                        <span>£{total.toFixed(2)}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}