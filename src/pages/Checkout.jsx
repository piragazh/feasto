import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { calculateDeliveryDetails } from '@/components/checkout/DeliveryZoneCalculator';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, MapPin, Phone, FileText, Loader2, CheckCircle } from 'lucide-react';
import CouponInput from '@/components/checkout/CouponInput';
import PaymentMethods from '@/components/checkout/PaymentMethods';
import ScheduleOrderSection from '@/components/checkout/ScheduleOrderSection';
import GroupOrderSection from '@/components/checkout/GroupOrderSection';
import LocationPicker from '@/components/location/LocationPicker';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import StripePaymentForm from '@/components/checkout/StripePaymentForm';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

export default function Checkout() {
    const navigate = useNavigate();
    const [cart, setCart] = useState([]);
    const [restaurantId, setRestaurantId] = useState(null);
    const [restaurantName, setRestaurantName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [orderPlaced, setOrderPlaced] = useState(false);
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledFor, setScheduledFor] = useState('');
    const [groupOrderId, setGroupOrderId] = useState(null);
    const [shareCode, setShareCode] = useState(null);
    const [deliveryZoneInfo, setDeliveryZoneInfo] = useState(null);
    const [zoneCheckComplete, setZoneCheckComplete] = useState(false);
    const [restaurant, setRestaurant] = useState(null);
    const [clientSecret, setClientSecret] = useState('');
    const [showStripeForm, setShowStripeForm] = useState(false);
    
    const [formData, setFormData] = useState({
        delivery_address: '',
        phone: '',
        notes: ''
    });
    const [deliveryCoordinates, setDeliveryCoordinates] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('cash');

    useEffect(() => {
        const savedCart = localStorage.getItem('cart');
        const savedRestaurantId = localStorage.getItem('cartRestaurantId');
        const savedRestaurantName = localStorage.getItem('cartRestaurantName');
        const savedGroupOrderId = localStorage.getItem('groupOrderId');
        const savedAddress = localStorage.getItem('userAddress');
        const savedCoords = localStorage.getItem('userCoordinates');
        
        if (savedCart) {
            setCart(JSON.parse(savedCart));
        }
        if (savedRestaurantId) {
            setRestaurantId(savedRestaurantId);
            loadRestaurantName(savedRestaurantId);
        }
        if (savedGroupOrderId) {
            setGroupOrderId(savedGroupOrderId);
        }
        if (savedAddress) {
            setFormData(prev => ({ ...prev, delivery_address: savedAddress }));
        }
        if (savedCoords) {
            setDeliveryCoordinates(JSON.parse(savedCoords));
        }
    }, []);

    const loadRestaurantName = async (id) => {
        try {
            const restaurants = await base44.entities.Restaurant.filter({ id });
            if (restaurants[0]) {
                setRestaurantName(restaurants[0].name);
                setRestaurant(restaurants[0]);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = deliveryZoneInfo?.deliveryFee ?? restaurant?.delivery_fee ?? 2.99;
    const discount = appliedCoupon?.discount || 0;
    const total = subtotal + deliveryFee - discount;

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.delivery_address || !formData.phone) {
            toast.error('Please fill in all required fields');
            return;
        }

        if (deliveryZoneInfo && !deliveryZoneInfo.available) {
            toast.error('Delivery is not available to your location');
            return;
        }

        if (deliveryZoneInfo?.minOrderValue && subtotal < deliveryZoneInfo.minOrderValue) {
            toast.error(`Minimum order value for this area is £${deliveryZoneInfo.minOrderValue.toFixed(2)}`);
            return;
        }

        // If card payment, create payment intent and show Stripe form
        if (paymentMethod === 'card') {
            setIsSubmitting(true);
            try {
                const response = await base44.functions.invoke('createPaymentIntent', {
                    amount: total,
                    currency: 'gbp',
                    metadata: {
                        restaurant_id: restaurantId,
                        restaurant_name: restaurantName
                    }
                });

                if (response.data.clientSecret) {
                    setClientSecret(response.data.clientSecret);
                    setShowStripeForm(true);
                }
            } catch (error) {
                toast.error('Failed to initialize payment. Please try again.');
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        // For cash and other methods, proceed with regular order creation
        await createOrder();
    };

    const createOrder = async (paymentIntentId = null) => {
        setIsSubmitting(true);

        try {
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
                status: 'pending',
                delivery_address: formData.delivery_address,
                delivery_coordinates: deliveryCoordinates,
                phone: formData.phone,
                notes: formData.notes,
                estimated_delivery: isScheduled ? 'Scheduled' : '30-45 minutes',
                is_scheduled: isScheduled,
                scheduled_for: isScheduled ? scheduledFor : null,
                is_group_order: !!groupOrderId,
                group_order_id: groupOrderId,
                payment_intent_id: paymentIntentId
            };

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
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
                    <Link to={createPageUrl('Home')}>
                        <Button size="icon" variant="ghost" className="rounded-full">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <h1 className="text-xl font-bold text-gray-900">Checkout</h1>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="grid md:grid-cols-5 gap-8">
                    {/* Form */}
                    <div className="md:col-span-3">
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <MapPin className="h-5 w-5 text-orange-500" />
                                        Delivery Address
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
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
                                    <Input
                                        type="tel"
                                        placeholder="Your phone number"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="h-12"
                                        required
                                    />
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
                                        <span>Delivery Fee</span>
                                        <span>£{deliveryFee.toFixed(2)}</span>
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