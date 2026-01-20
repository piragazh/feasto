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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MapPin, Phone, FileText, Loader2, CheckCircle, User } from 'lucide-react'; // Icons
import DiscountCodeInput from '@/components/checkout/DiscountCodeInput'; // Discount code application
import PaymentMethods from '@/components/checkout/PaymentMethods'; // Payment selection component
import ScheduleOrderSection from '@/components/checkout/ScheduleOrderSection'; // Schedule future orders
import GroupOrderSection from '@/components/checkout/GroupOrderSection'; // Group order functionality
import LocationPicker from '@/components/location/LocationPicker'; // Address autocomplete
import SavedAddressesSection from '@/components/checkout/SavedAddressesSection'; // Saved addresses for logged-in users
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
    const [appliedCoupons, setAppliedCoupons] = useState([]); // Applied coupons array
    const [appliedPromotions, setAppliedPromotions] = useState([]); // Applied promotions array
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
    const [paymentMethod, setPaymentMethod] = useState(''); // Selected payment method (no default)
    const [paymentCompleted, setPaymentCompleted] = useState(false); // Track if card payment is completed
    const [initializingPayment, setInitializingPayment] = useState(false);
    const [showCashConfirmation, setShowCashConfirmation] = useState(false); // Cash payment confirmation
    
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

        if (!hours || hours.closed) {
            // Restaurant is closed, find next opening time
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
                    setScheduledFor(nextDay.toISOString().slice(0, 16));
                    setIsScheduled(true);
                    toast.info('Restaurant is closed - order will be delivered when they open');
                    break;
                }
            }
        } else {
            // Check if currently closed (between closing and opening)
            const [openHour, openMin] = hours.open.split(':').map(Number);
            const [closeHour, closeMin] = hours.close.split(':').map(Number);
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const openTime = openHour * 60 + openMin;
            const closeTime = closeHour * 60 + closeMin;

            if (currentTime >= closeTime || currentTime < openTime) {
                // Currently closed, schedule for opening
                const scheduleTime = new Date(now);
                if (currentTime < openTime) {
                    scheduleTime.setHours(openHour, openMin, 0, 0);
                } else {
                    scheduleTime.setDate(scheduleTime.getDate() + 1);
                    scheduleTime.setHours(openHour, openMin, 0, 0);
                }
                setScheduledFor(scheduleTime.toISOString().slice(0, 16));
                setIsScheduled(true);
                toast.info('Restaurant is closed - order will be delivered when they open');
            }
        }
    }, [restaurant, orderType]);

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
            const users = await base44.entities.User.filter({ email: email.toLowerCase() });
            setEmailExists(users && users.length > 0);
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

    // ============================================
    // PRICE CALCULATIONS
    // ============================================
    
    // Calculate subtotal: sum of all item prices × quantities
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Delivery fee: FREE for collection, otherwise use zone-specific or restaurant default
    const deliveryFee = orderType === 'collection' ? 0 : (deliveryZoneInfo?.deliveryFee ?? restaurant?.delivery_fee ?? 2.99);

    // Small order surcharge: if subtotal is below minimum order, add the difference (only for delivery)
    // Use zone-specific minimum order if available, otherwise fall back to restaurant setting
    const minimumOrder = orderType === 'delivery' && deliveryZoneInfo?.minimumOrder 
        ? deliveryZoneInfo.minimumOrder 
        : (restaurant?.minimum_order || 0);
    const smallOrderSurcharge = orderType === 'delivery' && minimumOrder > 0 && subtotal < minimumOrder 
        ? (minimumOrder - subtotal) 
        : 0;

    // Discount from applied coupons and promotions
    const couponDiscount = appliedCoupons.reduce((sum, c) => sum + (c.discount || 0), 0);
    const promotionDiscount = appliedPromotions.reduce((sum, p) => sum + (p.discount || 0), 0);
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

            // ✅ COMPREHENSIVE VALIDATION - Block payment until ALL checks pass
            
            // Guest checkout validation
            if (isGuest && (!formData.guest_name || !formData.guest_email)) return;
            
            // Phone always required
            if (!formData.phone) return;
            
            // Delivery address validation
            if (orderType === 'delivery') {
                // Address must be present and valid string
                if (!formData.delivery_address || typeof formData.delivery_address !== 'string' || formData.delivery_address.trim() === '') return;
                
                // Door number required for new addresses only
                if (!isExistingAddress && (!formData.door_number || typeof formData.door_number !== 'string' || formData.door_number.trim() === '')) return;
                
                // Coordinates MUST exist
                if (!deliveryCoordinates || !deliveryCoordinates.lat || !deliveryCoordinates.lng) return;
                
                // Zone check MUST be complete
                if (!zoneCheckComplete) return;
                
                // Zone MUST be available
                if (deliveryZoneInfo && deliveryZoneInfo.available === false) return;
            }
            
            // Scheduled orders validation
            if (isScheduled && !scheduledFor) return;

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
    }, [paymentMethod, formData.phone, formData.delivery_address, formData.guest_name, formData.guest_email, total, isScheduled, scheduledFor, isExistingAddress, orderType]);

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

        if (!hours || hours.closed) return true;

        const [openHour, openMin] = hours.open.split(':').map(Number);
        const [closeHour, closeMin] = hours.close.split(':').map(Number);
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const openTime = openHour * 60 + openMin;
        const closeTime = closeHour * 60 + closeMin;

        return currentTime < openTime || currentTime >= closeTime;
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
        const scheduleTime = new Date(now);
        scheduleTime.setHours(openHour, openMin, 0, 0);
        return scheduleTime.toISOString().slice(0, 16);
    };

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

            // Check if delivery is available
            if (deliveryZoneInfo && deliveryZoneInfo.available === false) {
                console.log('BLOCKED: Delivery not available to location');
                toast.error('Delivery is not available to your location');
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
            if (!paymentIntentId && actualPaymentMethod === 'card') {
                toast.error('❌ Card payment required but not completed.');
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

            // Calculate loyalty points
            const earnLoyalty = restaurant?.loyalty_program_enabled !== false;
            const pointsMultiplier = restaurant?.loyalty_points_multiplier || 1;
            const pointsToEarn = earnLoyalty ? Math.floor(total * pointsMultiplier) : 0;

            const orderData = {
                order_number: orderNumber,
                restaurant_id: restaurantId,
                restaurant_name: restaurantName,
                loyalty_points_earned: pointsToEarn,
                items: cart,
                subtotal,
                delivery_fee: deliveryFee,
                small_order_surcharge: smallOrderSurcharge,
                discount: discount,
                coupon_codes: appliedCoupons.map(c => c.code).join(', '),
                promotion_codes: appliedPromotions.map(p => p.promotion_code || p.name).join(', '),
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

            // Save phone and address for logged-in users (if opted in)
            if (!isGuest) {
                try {
                    const userData = await base44.auth.me();
                    const updates = {};
                    
                    // Save phone if opted in and not already saved
                    if (savePhone && formData.phone && formData.phone !== userData.phone) {
                        updates.phone = formData.phone;
                    }
                    
                    // Save address for delivery orders if opted in
                    if (saveAddress && orderType === 'delivery' && formData.delivery_address && formData.door_number) {
                        const currentAddresses = userData.saved_addresses || [];
                        
                        // Check if address already exists
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
                            
                            // If setting as default, unmark all other addresses
                            let updatedAddresses = currentAddresses;
                            if (setAsDefault) {
                                updatedAddresses = currentAddresses.map(addr => ({ ...addr, is_default: false }));
                            }
                            
                            updates.saved_addresses = [...updatedAddresses, newAddress];
                        }
                    }
                    
                    // Update user if there are changes
                    if (Object.keys(updates).length > 0) {
                        await base44.auth.updateMe(updates);
                    }
                } catch (error) {
                    console.error('Failed to save user data:', error);
                }
            }

            // Update group order status if applicable
            if (groupOrderId) {
                try {
                    await base44.entities.GroupOrder.update(groupOrderId, { status: 'placed' });
                } catch (error) {
                    console.error('Failed to update group order:', error);
                }
            }

            // Increment coupon usage for all applied coupons
            for (const coupon of appliedCoupons) {
                try {
                    await base44.entities.Coupon.update(coupon.id, {
                        usage_count: (coupon.usage_count || 0) + 1
                    });
                } catch (error) {
                    console.error('Failed to update coupon usage:', error);
                }
            }

            // Increment promotion usage and update stats for all applied promotions
            for (const promo of appliedPromotions) {
                try {
                    await base44.entities.Promotion.update(promo.id, {
                        usage_count: (promo.usage_count || 0) + 1,
                        total_revenue_generated: (promo.total_revenue_generated || 0) + total,
                        total_discount_given: (promo.total_discount_given || 0) + promo.discount
                    });
                } catch (error) {
                    console.error('Failed to update promotion usage:', error);
                }
            }

            // Send SMS confirmation to customer with order details
            try {
                const orderLabel = orderType === 'collection' && newOrder.order_number
                    ? newOrder.order_number
                    : `#${newOrder.id.slice(-6)}`;
                
                // Build order summary
                const itemsList = cart.slice(0, 3).map(item => 
                    `${item.quantity}x ${item.name}`
                ).join('\n');
                
                const moreItems = cart.length > 3 ? `\n+${cart.length - 3} more items` : '';

                const customerMessage = orderType === 'collection'
                    ? `✅ ORDER CONFIRMED - ${orderLabel}\n\n${restaurantName}\n\n${itemsList}${moreItems}\n\nTotal: £${total.toFixed(2)}\n\nCOLLECTION ORDER\nReady in 15-20 min\n\nShow this number when collecting!`
                    : `✅ ORDER CONFIRMED - ${orderLabel}\n\n${restaurantName}\n\n${itemsList}${moreItems}\n\nTotal: £${total.toFixed(2)}\nPayment: ${actualPaymentMethod}\n\nYou'll receive SMS updates when your order is being prepared and dispatched.`;

                console.log('Sending customer SMS to:', formData.phone);
                const smsResult = await base44.functions.invoke('sendSMS', {
                    to: formData.phone,
                    message: customerMessage
                });
                console.log('Customer SMS result:', smsResult);
            } catch (smsError) {
                console.error('Customer SMS failed:', smsError);
                // SMS failed but order still placed - don't block user
            }

            // Notify restaurant of new order
            try {
                await base44.functions.invoke('notifyRestaurantNewOrder', {
                    orderId: newOrder.id,
                    restaurantId: restaurantId,
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
                                                        onClick={() => base44.auth.redirectToLogin(window.location.href)}
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
                                                    onAddressSelect={async (address) => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            delivery_address: address.address || '',
                                                            door_number: address.door_number || '',
                                                            notes: address.instructions || ''
                                                        }));
                                                        setIsExistingAddress(true);
                                                        setZoneCheckComplete(false);

                                                        let coords = address.coordinates;

                                                        // If no coordinates stored, geocode the address
                                                        if (!coords || !coords.lat || !coords.lng) {
                                                            try {
                                                                const response = await fetch(
                                                                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address.address || '')}&countrycodes=GB&limit=1`
                                                                );
                                                                const results = await response.json();
                                                                if (results && results.length > 0) {
                                                                    coords = {
                                                                        lat: parseFloat(results[0].lat),
                                                                        lng: parseFloat(results[0].lon)
                                                                    };
                                                                }
                                                            } catch (error) {
                                                                console.error('Geocoding saved address failed:', error);
                                                            }
                                                        }

                                                        // Set coordinates
                                                        if (coords && coords.lat && coords.lng) {
                                                            setDeliveryCoordinates(coords);

                                                            // Check delivery zone
                                                            if (restaurantId) {
                                                                try {
                                                                    const zoneInfo = await calculateDeliveryDetails(restaurantId, coords);
                                                                    setDeliveryZoneInfo(zoneInfo);
                                                                } catch (error) {
                                                                    console.error('Zone check failed:', error);
                                                                }
                                                            }
                                                        }

                                                        setZoneCheckComplete(true);
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
                                                                if (defaultAddress.coordinates) {
                                                                    setDeliveryCoordinates(defaultAddress.coordinates);
                                                                }
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
                                                        onLocationSelect={async (locationData) => {
                                                            setFormData({ ...formData, delivery_address: locationData.address });
                                                            setDeliveryCoordinates(locationData.coordinates);
                                                            setIsExistingAddress(false);

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
                                                        {deliveryZoneInfo.minOrderValue && (
                                                            <p className="text-xs text-green-700">
                                                                Min order: £{Number(deliveryZoneInfo.minOrderValue).toFixed(2)}
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
                                restaurant={restaurant}
                                orderType={orderType}
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
                                        onCouponApply={setAppliedCoupons}
                                        onPromotionApply={setAppliedPromotions}
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
                                    } else {
                                        if (!formData.phone) return false;
                                    }
                                    return true;
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
                                            setPaymentMethod(method);
                                            setClientSecret('');
                                            setShowStripeForm(false);
                                            setPaymentCompleted(false);
                                        }}
                                        acceptsCash={restaurant?.accepts_cash_on_delivery !== false}
                                    />
                                );
                            })()}

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
                                                    clientSecret={clientSecret}
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
                                                    <span>{String(item.name || '')}</span>
                                                    {item.customizations && Object.keys(item.customizations).length > 0 && (
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {Object.entries(item.customizations).map(([key, value]) => {
                                                                // Skip empty values
                                                                if (!value || (Array.isArray(value) && value.length === 0) || 
                                                                    (typeof value === 'object' && Object.keys(value).length === 0)) {
                                                                    return null;
                                                                }

                                                                let displayValue = '';
                                                                if (Array.isArray(value)) {
                                                                    displayValue = value.join(', ');
                                                                } else if (typeof value === 'object' && value !== null) {
                                                                    displayValue = JSON.stringify(value);
                                                                } else {
                                                                    displayValue = String(value);
                                                                }

                                                                // Format key: remove underscores, capitalize
                                                                const formattedKey = key
                                                                    .replace(/_/g, ' ')
                                                                    .split(' ')
                                                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                                                    .join(' ');

                                                                return (
                                                                    <div key={key}>
                                                                        {formattedKey}: {displayValue}
                                                                    </div>
                                                                );
                                                            }).filter(Boolean)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="font-medium">£{(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}</span>
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
                                    {appliedCoupons && appliedCoupons.length > 0 && appliedCoupons.map((coupon) => (
                                        <div key={coupon.id} className="flex justify-between text-green-600">
                                            <span>Coupon ({String(coupon.code || '')})</span>
                                            <span>-£{Number(coupon.discount || 0).toFixed(2)}</span>
                                        </div>
                                    ))}
                                    {appliedPromotions && appliedPromotions.length > 0 && appliedPromotions.map((promo) => (
                                        <div key={promo.id} className="flex justify-between text-purple-600">
                                            <span>Promo ({String(promo.name || '')})</span>
                                            <span>-£{Number(promo.discount || 0).toFixed(2)}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                        <span>Total</span>
                                        <span>£{total.toFixed(2)}</span>
                                    </div>
                                    {restaurant?.loyalty_program_enabled !== false && (
                                        <div className="flex justify-between text-orange-600 text-sm pt-2">
                                            <span>🎁 You'll earn</span>
                                            <span className="font-semibold">{Math.floor(total * (restaurant?.loyalty_points_multiplier || 1))} points</span>
                                        </div>
                                    )}
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