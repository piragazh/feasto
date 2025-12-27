import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, MapPin, Phone, FileText, Loader2, CheckCircle } from 'lucide-react';
import CouponInput from '@/components/checkout/CouponInput';
import PaymentMethods from '@/components/checkout/PaymentMethods';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Checkout() {
    const navigate = useNavigate();
    const [cart, setCart] = useState([]);
    const [restaurantId, setRestaurantId] = useState(null);
    const [restaurantName, setRestaurantName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [orderPlaced, setOrderPlaced] = useState(false);
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    
    const [formData, setFormData] = useState({
        delivery_address: '',
        phone: '',
        notes: ''
    });
    const [paymentMethod, setPaymentMethod] = useState('cash');

    useEffect(() => {
        const savedCart = localStorage.getItem('cart');
        const savedRestaurantId = localStorage.getItem('cartRestaurantId');
        const savedRestaurantName = localStorage.getItem('cartRestaurantName');
        
        if (savedCart) {
            setCart(JSON.parse(savedCart));
        }
        if (savedRestaurantId) {
            setRestaurantId(savedRestaurantId);
            loadRestaurantName(savedRestaurantId);
        }
    }, []);

    const loadRestaurantName = async (id) => {
        try {
            const restaurants = await base44.entities.Restaurant.filter({ id });
            if (restaurants[0]) {
                setRestaurantName(restaurants[0].name);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = 2.99;
    const discount = appliedCoupon?.discount || 0;
    const total = subtotal + deliveryFee - discount;

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.delivery_address || !formData.phone) {
            toast.error('Please fill in all required fields');
            return;
        }

        setIsSubmitting(true);

        try {
            await base44.entities.Order.create({
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
                phone: formData.phone,
                notes: formData.notes,
                estimated_delivery: '30-45 minutes'
            });

            // Increment coupon usage if applied
            if (appliedCoupon) {
                await base44.entities.Coupon.update(appliedCoupon.id, {
                    usage_count: (appliedCoupon.usage_count || 0) + 1
                });
            }

            localStorage.removeItem('cart');
            localStorage.removeItem('cartRestaurantId');
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
                                <CardContent>
                                    <Input
                                        placeholder="Enter your full delivery address"
                                        value={formData.delivery_address}
                                        onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                                        className="h-12"
                                        required
                                    />
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
                                    `Place Order • $${total.toFixed(2)}`
                                )}
                            </Button>
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
                                            <span className="font-medium">${(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                                
                                <div className="border-t pt-4 space-y-2">
                                    <div className="flex justify-between text-gray-600">
                                        <span>Subtotal</span>
                                        <span>${subtotal.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-600">
                                        <span>Delivery Fee</span>
                                        <span>${deliveryFee.toFixed(2)}</span>
                                    </div>
                                    {discount > 0 && (
                                        <div className="flex justify-between text-green-600">
                                            <span>Discount ({appliedCoupon?.code})</span>
                                            <span>-${discount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                        <span>Total</span>
                                        <span>${total.toFixed(2)}</span>
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