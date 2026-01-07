import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star, Clock, Bike, ArrowLeft, ShoppingBag, MapPin, Info, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import MenuItemCard from '@/components/restaurant/MenuItemCard';
import ItemCustomizationModal from '@/components/restaurant/ItemCustomizationModal';
import MealDealCard from '@/components/restaurant/MealDealCard';
import CategoryDealCustomizationModal from '@/components/restaurant/CategoryDealCustomizationModal';
import CartDrawer from '@/components/cart/CartDrawer';
import ImageGallery from '@/components/restaurant/ImageGallery';
import OpeningHours from '@/components/restaurant/OpeningHours';
import SpecialOffers from '@/components/restaurant/SpecialOffers';
import PopularItems from '@/components/restaurant/PopularItems';
import ReviewsSection from '@/components/restaurant/ReviewsSection';
import RestaurantInfoDialog from '@/components/restaurant/RestaurantInfoDialog';
import ActivePromotionsBanner from '@/components/restaurant/ActivePromotionsBanner';
import RestaurantProfileSection from '@/components/restaurant/RestaurantProfileSection';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Restaurant() {
    const navigate = useNavigate();
    const urlParams = new URLSearchParams(window.location.search);
    const restaurantId = urlParams.get('id');
    
    const [cart, setCart] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState('all');
    const [customizationModalOpen, setCustomizationModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [categoryDealModalOpen, setCategoryDealModalOpen] = useState(false);
    const [selectedDeal, setSelectedDeal] = useState(null);
    const [menuSearchQuery, setMenuSearchQuery] = useState('');
    const [orderType, setOrderType] = useState('delivery'); // 'delivery' or 'collection'
    const [showTimeWarning, setShowTimeWarning] = useState(false);
    const [timeWarningMessage, setTimeWarningMessage] = useState('');
    const [activeCategoryScroll, setActiveCategoryScroll] = useState('');
    const [showInfoDialog, setShowInfoDialog] = useState(false);
    const [showCartConflictDialog, setShowCartConflictDialog] = useState(false);
    const [previousCartData, setPreviousCartData] = useState(null);

    // Load cart from localStorage with error handling
    useEffect(() => {
        try {
            const savedCart = localStorage.getItem('cart');
            const savedRestaurantId = localStorage.getItem('cartRestaurantId');
            const savedRestaurantName = localStorage.getItem('cartRestaurantName');
            
            if (savedCart && savedRestaurantId) {
                const parsedCart = JSON.parse(savedCart);
                if (Array.isArray(parsedCart) && parsedCart.length > 0) {
                    if (savedRestaurantId === restaurantId) {
                        // Same restaurant - load cart
                        setCart(parsedCart);
                    } else {
                        // Different restaurant - show conflict dialog
                        setPreviousCartData({
                            cart: parsedCart,
                            restaurantName: savedRestaurantName || 'another restaurant'
                        });
                        setShowCartConflictDialog(true);
                    }
                }
            }
        } catch (error) {
            localStorage.removeItem('cart');
            toast.error('Cart data corrupted. Starting fresh.');
        }
    }, [restaurantId]);

    // Save cart to localStorage with error handling
    useEffect(() => {
        try {
            if (cart.length > 0) {
                localStorage.setItem('cart', JSON.stringify(cart));
                if (restaurantId) {
                    localStorage.setItem('cartRestaurantId', restaurantId);
                }
            }
        } catch (error) {
            toast.error('Unable to save cart. Storage may be full.');
        }
    }, [cart, restaurantId]);

    const handleKeepOldCart = () => {
        setShowCartConflictDialog(false);
        navigate(createPageUrl('Home'));
    };

    const handleStartNewCart = () => {
        clearCart();
        setShowCartConflictDialog(false);
        toast.success('Started new cart');
    };

    const { data: restaurant, isLoading: restaurantLoading, error: restaurantError } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            if (!restaurantId) {
                throw new Error('No restaurant ID provided');
            }
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            if (!restaurants || restaurants.length === 0) {
                throw new Error('Restaurant not found');
            }
            return restaurants[0];
        },
        enabled: !!restaurantId,
        retry: 2,
    });

    const { data: menuItems = [], isLoading: menuLoading } = useQuery({
        queryKey: ['menuItems', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: mealDeals = [], isLoading: dealsLoading } = useQuery({
        queryKey: ['mealDeals', restaurantId],
        queryFn: () => base44.entities.MealDeal.filter({ restaurant_id: restaurantId, is_active: true }),
        enabled: !!restaurantId,
    });

    const categories = React.useMemo(() => {
        const cats = [...new Set(menuItems.map(item => item.category).filter(Boolean))].sort();
        return cats;
    }, [menuItems]);

    const categoryRefs = React.useRef({});

    const itemsByCategory = React.useMemo(() => {
        let items = menuItems;
        
        if (menuSearchQuery) {
            items = items.filter(item => 
                item.name?.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
                item.description?.toLowerCase().includes(menuSearchQuery.toLowerCase())
            );
        }
        
        const grouped = {};
        items.forEach(item => {
            const cat = item.category || 'Other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });
        
        return grouped;
    }, [menuItems, menuSearchQuery]);

    const categoryNavRef = React.useRef(null);
    const [showLeftArrow, setShowLeftArrow] = React.useState(false);
    const [showRightArrow, setShowRightArrow] = React.useState(false);

    const scrollToCategory = (category) => {
        const element = categoryRefs.current[category];
        if (element) {
            element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start'
            });
        }
    };

    const scrollCategories = (direction) => {
        if (categoryNavRef.current) {
            const scrollAmount = 200;
            categoryNavRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    const checkScrollButtons = () => {
        if (categoryNavRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = categoryNavRef.current;
            setShowLeftArrow(scrollLeft > 0);
            setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5);
        }
    };

    // Auto-scroll category nav to show active category
    useEffect(() => {
        if (activeCategoryScroll && categoryNavRef.current) {
            const activeButton = categoryNavRef.current.querySelector(`[data-category="${activeCategoryScroll}"]`);
            if (activeButton) {
                activeButton.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'nearest',
                    inline: 'center'
                });
            }
        }
    }, [activeCategoryScroll]);

    useEffect(() => {
        checkScrollButtons();
        const nav = categoryNavRef.current;
        if (nav) {
            nav.addEventListener('scroll', checkScrollButtons);
            window.addEventListener('resize', checkScrollButtons);
            return () => {
                nav.removeEventListener('scroll', checkScrollButtons);
                window.removeEventListener('resize', checkScrollButtons);
            };
        }
    }, [categories]);

    // Scroll spy - update active category based on scroll position
    useEffect(() => {
        const handleScroll = () => {
            const scrollPosition = window.scrollY + 180;
            
            for (const category of Object.keys(categoryRefs.current).sort()) {
                const element = categoryRefs.current[category];
                if (element) {
                    const offsetTop = element.offsetTop;
                    const offsetBottom = offsetTop + element.offsetHeight;
                    
                    if (scrollPosition >= offsetTop && scrollPosition < offsetBottom) {
                        setActiveCategoryScroll(category);
                        break;
                    }
                }
            }
        };

        window.addEventListener('scroll', handleScroll);
        handleScroll(); // Initial check
        
        return () => window.removeEventListener('scroll', handleScroll);
    }, [itemsByCategory]);

    const handleItemClick = (item) => {
        // If item has customizations, open modal; otherwise add directly
        if (item.customization_options?.length > 0) {
            setSelectedItem(item);
            setCustomizationModalOpen(true);
        } else {
            addToCartDirect(item);
        }
    };

    const addToCartDirect = (item) => {
        try {
            if (!item || !item.id || !item.name || item.price == null) {
                toast.error('Invalid item data');
                return;
            }

            if (item.is_available === false) {
                toast.error(`${item.name} is currently unavailable`);
                return;
            }

            setCart(prev => {
                const existing = prev.find(i => i.menu_item_id === item.id && !i.customizations);
                if (existing) {
                    return prev.map(i => 
                        i.menu_item_id === item.id && !i.customizations
                            ? { ...i, quantity: i.quantity + 1 }
                            : i
                    );
                }
                return [...prev, {
                    menu_item_id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: 1,
                    image_url: item.image_url
                }];
            });
            toast.success(`${item.name} added to cart`);
        } catch (error) {
            toast.error('Failed to add item to cart');
        }
    };

    const addToCartWithCustomizations = (itemData) => {
        try {
            if (!itemData || !itemData.id || !itemData.name) {
                toast.error('Invalid item data');
                return;
            }

            if (itemData.quantity < 1) {
                toast.error('Quantity must be at least 1');
                return;
            }

            const customizationKey = JSON.stringify(itemData.customizations || {});
            setCart(prev => {
                const existing = prev.find(i => 
                    i.menu_item_id === itemData.id && 
                    JSON.stringify(i.customizations || {}) === customizationKey
                );
                
                if (existing) {
                    return prev.map(i => 
                        i.menu_item_id === itemData.id && 
                        JSON.stringify(i.customizations || {}) === customizationKey
                            ? { ...i, quantity: i.quantity + itemData.quantity }
                            : i
                    );
                }
                
                return [...prev, {
                    menu_item_id: itemData.id,
                    name: itemData.name,
                    price: itemData.final_price,
                    quantity: itemData.quantity,
                    image_url: itemData.image_url,
                    customizations: itemData.customizations
                }];
            });
            toast.success(`${itemData.name} added to cart`);
        } catch (error) {
            toast.error('Failed to add item to cart');
        }
    };

    const addMealDealToCart = (deal) => {
        setCart(prev => [...prev, {
            menu_item_id: `deal_${deal.id}`,
            name: deal.name,
            price: deal.deal_price,
            quantity: 1,
            image_url: deal.image_url,
            is_deal: true
        }]);
        toast.success(`${deal.name} added to cart`);
    };

    const handleCustomizeDeal = (deal) => {
        setSelectedDeal(deal);
        setCategoryDealModalOpen(true);
    };

    const addCategoryDealToCart = (dealData) => {
        setCart(prev => [...prev, {
            menu_item_id: `deal_${dealData.deal_id}_${Date.now()}`,
            name: dealData.deal_name,
            price: dealData.deal_price,
            quantity: dealData.quantity,
            image_url: selectedDeal?.image_url,
            is_deal: true,
            is_category_deal: true,
            selected_items: dealData.selected_items
        }]);
        toast.success(`${dealData.deal_name} added to cart`);
    };

    const updateQuantity = (itemId, newQuantity) => {
        if (newQuantity < 1) {
            removeFromCart(itemId);
            return;
        }
        setCart(prev => prev.map(item =>
            item.menu_item_id === itemId
                ? { ...item, quantity: newQuantity }
                : item
        ));
    };

    const removeFromCart = (itemId) => {
        setCart(prev => prev.filter(item => item.menu_item_id !== itemId));
    };

    const clearCart = () => {
        setCart([]);
        localStorage.removeItem('cart');
        localStorage.removeItem('cartRestaurantId');
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Check if restaurant is open for delivery/collection
    const checkOrderingAvailable = () => {
        if (!restaurant) return { available: true, message: '' };

        const now = new Date();
        const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
        const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

        let hours;
        if (orderType === 'collection' && restaurant.collection_hours) {
            hours = restaurant.collection_hours[dayName];
        } else if (orderType === 'delivery' && restaurant.delivery_hours) {
            hours = restaurant.delivery_hours[dayName];
        } else {
            hours = restaurant.opening_hours?.[dayName];
        }

        if (!hours || hours.closed) {
            return {
                available: false,
                message: `${orderType === 'collection' ? 'Collection' : 'Delivery'} is not available on ${dayName}s`
            };
        }

        const [openHour, openMin] = hours.open.split(':').map(Number);
        const [closeHour, closeMin] = hours.close.split(':').map(Number);
        const openTime = openHour * 60 + openMin;
        const closeTime = closeHour * 60 + closeMin;

        if (currentTime < openTime) {
            return {
                available: false,
                message: `${orderType === 'collection' ? 'Collection' : 'Delivery'} starts at ${hours.open}`
            };
        }

        if (currentTime > closeTime) {
            return {
                available: false,
                message: `${orderType === 'collection' ? 'Collection' : 'Delivery'} closed at ${hours.close}`
            };
        }

        return { available: true, message: '' };
    };

    const handleProceedToCheckout = () => {
        // Basic validation
        if (!cart || cart.length === 0) {
            toast.error('Your cart is empty');
            return;
        }

        if (!restaurant || !restaurant.name) {
            toast.error('Restaurant information unavailable');
            return;
        }

        // Save to localStorage
        try {
            localStorage.setItem('cart', JSON.stringify(cart));
            localStorage.setItem('cartRestaurantId', restaurantId);
            localStorage.setItem('orderType', orderType);
            localStorage.setItem('cartRestaurantName', restaurant.name);
        } catch (error) {
            toast.error('Unable to save cart data');
            return;
        }
        
        // Close drawer and navigate using React Router
        setCartOpen(false);
        navigate(createPageUrl('Checkout'));
    };

    if (restaurantLoading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <Skeleton className="h-72 w-full" />
                <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
                    <Skeleton className="h-10 w-1/2" />
                    <Skeleton className="h-6 w-3/4" />
                </div>
            </div>
        );
    }

    if (restaurantError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to load restaurant</h2>
                    <p className="text-gray-600 mb-4">{restaurantError.message || 'Please try again later'}</p>
                    <Link to={createPageUrl('Home')}>
                        <Button>Go Back Home</Button>
                    </Link>
                </div>
            </div>
        );
    }

    if (!restaurantLoading && !restaurant) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Restaurant not found</h2>
                    <Link to={createPageUrl('Home')}>
                        <Button>Go Back Home</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-32 md:pb-8">
            {/* Order Type Selector */}


            {/* Hero */}
            <div className="relative h-72 md:h-80">
                <img
                    src={restaurant.image_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200'}
                    alt={restaurant.name}
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                
                <div className="absolute top-4 left-4 flex gap-2 z-10">
                    <Link to={createPageUrl('Home')}>
                        <Button size="icon" variant="secondary" className="rounded-full bg-white/90 hover:bg-white shadow-lg">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <Button 
                        size="icon" 
                        variant="secondary" 
                        className="rounded-full bg-white/90 hover:bg-white shadow-lg"
                        onClick={() => setShowInfoDialog(true)}
                    >
                        <Info className="h-5 w-5" />
                    </Button>
                </div>
                
                <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-start gap-4 mb-3">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-3">
                                    <Badge className="bg-white/90 text-gray-800">{restaurant.cuisine_type}</Badge>
                                    {restaurant.special_offers && restaurant.special_offers.length > 0 && (
                                        <Badge className="bg-orange-500 text-white animate-pulse">
                                            Special Offers Available
                                        </Badge>
                                    )}
                                </div>
                                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{restaurant.name}</h1>
                            </div>
                            {restaurant.logo_url && (
                                <img 
                                    src={restaurant.logo_url} 
                                    alt={`${restaurant.name} logo`}
                                    className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover bg-white border-2 border-white/20 shadow-lg"
                                />
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-white/90 clear-both">
                            <div className="flex items-center gap-1">
                                <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                                <span className="font-semibold">{restaurant.rating?.toFixed(1) || '4.5'}</span>
                                <span>({restaurant.review_count || 0} reviews)</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                <span>{restaurant.delivery_time || '25-35 min'}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Bike className="h-4 w-4" />
                                <span>{restaurant.delivery_fee ? `£${restaurant.delivery_fee.toFixed(2)} delivery` : 'Free delivery'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Info Bar */}
            <div className="bg-white border-b">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                        {restaurant.address && (
                            <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-gray-400" />
                                <span>{restaurant.address}</span>
                            </div>
                        )}
                        {restaurant.minimum_order > 0 && (
                            <div className="flex items-center gap-2">
                                <Info className="h-4 w-4 text-gray-400" />
                                <span>Min. order £{restaurant.minimum_order}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-xs">
                            <Info className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-400">ID: {restaurant.id}</span>
                        </div>
                    </div>
                </div>
            </div>

                        <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-3">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setOrderType('delivery')}
                            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                                orderType === 'delivery'
                                    ? 'bg-orange-500 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            🚚 Delivery
                        </button>
                        {restaurant?.collection_enabled && (
                            <button
                                onClick={() => setOrderType('collection')}
                                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                                    orderType === 'collection'
                                        ? 'bg-orange-500 text-white shadow-md'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                🏪 Collection
                                {orderType === 'collection' && <span className="ml-2 text-xs">FREE</span>}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* Image Gallery */}
                {restaurant.gallery_images && restaurant.gallery_images.length > 0 && (
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Photos</h2>
                        <ImageGallery images={restaurant.gallery_images} restaurantName={restaurant.name} />
                    </div>
                )}

                {/* Special Offers */}
                {restaurant.special_offers && restaurant.special_offers.length > 0 && (
                    <div className="mb-8">
                        <SpecialOffers offers={restaurant.special_offers} />
                    </div>
                )}

                {/* Active Promotions */}
                <ActivePromotionsBanner restaurantId={restaurantId} />

                {/* Opening Hours */}
                <div className="mb-8">
                    <OpeningHours openingHours={restaurant.opening_hours} isOpen={restaurant.is_open} />
                </div>

                {/* Popular Items */}
                <PopularItems restaurantId={restaurantId} onItemClick={handleItemClick} />

                {/* Menu */}
                {/* Meal Deals Section */}
                {mealDeals.length > 0 && (
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">🔥 Meal Deals</h2>
                        <div className="space-y-4">
                            {mealDeals.map(deal => (
                                <MealDealCard 
                                    key={deal.id} 
                                    deal={deal} 
                                    onAddToCart={addMealDealToCart}
                                    onCustomize={handleCustomizeDeal}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <h2 className="text-2xl font-bold text-gray-900 mb-6">Full Menu</h2>

                {/* Menu Search */}
                <div className="mb-6 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="Search menu items..."
                        value={menuSearchQuery}
                        onChange={(e) => setMenuSearchQuery(e.target.value)}
                        className="pl-12 h-12 bg-white border-gray-200"
                    />
                </div>

                {categories.length > 0 && (
                    <div className="bg-white border rounded-xl p-3 mb-6 sticky top-[56px] md:top-[64px] z-20 shadow-md">
                        <div className="relative">
                            {showLeftArrow && (
                                <button
                                    onClick={() => scrollCategories('left')}
                                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg rounded-full p-2 hover:bg-gray-50"
                                    style={{ marginLeft: '-12px' }}
                                >
                                    <ChevronLeft className="h-5 w-5 text-gray-700" />
                                </button>
                            )}
                            <div 
                                ref={categoryNavRef}
                                className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1"
                            >
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        data-category={cat}
                                        onClick={() => scrollToCategory(cat)}
                                        className={`px-4 py-2 rounded-lg whitespace-nowrap capitalize text-sm font-medium transition-all flex-shrink-0 ${
                                            activeCategoryScroll === cat
                                                ? 'bg-orange-500 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                            {showRightArrow && (
                                <button
                                    onClick={() => scrollCategories('right')}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-lg rounded-full p-2 hover:bg-gray-50"
                                    style={{ marginRight: '-12px' }}
                                >
                                    <ChevronRight className="h-5 w-5 text-gray-700" />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {menuLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3, 4].map(i => (
                            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                        ))}
                    </div>
                ) : Object.keys(itemsByCategory).length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">No items found</p>
                    </div>
                ) : (
                    <div className="space-y-12">
                        {Object.entries(itemsByCategory).sort(([a], [b]) => a.localeCompare(b)).map(([category, items], index) => (
                            <div 
                                key={category} 
                                ref={el => categoryRefs.current[category] = el}
                                style={{ scrollMarginTop: '180px' }}
                            >
                                <h3 className="text-2xl font-bold text-gray-900 mb-4 capitalize pb-2 border-b">
                                    {category}
                                </h3>
                                <div className="space-y-2">
                                    {items.map(item => (
                                        <MenuItemCard key={item.id} item={item} onAddToCart={handleItemClick} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <ItemCustomizationModal
                    item={selectedItem}
                    open={customizationModalOpen}
                    onClose={() => {
                        setCustomizationModalOpen(false);
                        setSelectedItem(null);
                    }}
                    onAddToCart={addToCartWithCustomizations}
                />

                <CategoryDealCustomizationModal
                    deal={selectedDeal}
                    menuItems={menuItems}
                    open={categoryDealModalOpen}
                    onClose={() => {
                        setCategoryDealModalOpen(false);
                        setSelectedDeal(null);
                    }}
                    onAddToCart={addCategoryDealToCart}
                />

                {/* Profile Section (About Us, Story, Awards, Social) */}
                <div className="mt-12">
                    <RestaurantProfileSection restaurant={restaurant} />
                </div>

                {/* Reviews Section */}
                <div className="mt-12">
                    <ReviewsSection restaurantId={restaurantId} />
                </div>
                </div>

            {/* Floating Cart Button */}
            {cart.length > 0 && (
                <motion.div
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    className="fixed bottom-0 left-0 right-0 p-4 pb-20 md:pb-4 bg-white border-t shadow-lg z-40"
                >
                    <div className="max-w-4xl mx-auto">
                        <Button
                            onClick={() => setCartOpen(true)}
                            className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl text-lg flex items-center justify-between px-6"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-white/20 rounded-full px-3 py-1">
                                    <span>{cartItemCount}</span>
                                </div>
                                <span>View Cart</span>
                            </div>
                            <span>£{cartTotal.toFixed(2)}</span>
                        </Button>
                    </div>
                </motion.div>
            )}

            <CartDrawer
                open={cartOpen}
                onOpenChange={setCartOpen}
                cart={cart}
                updateQuantity={updateQuantity}
                removeFromCart={removeFromCart}
                clearCart={clearCart}
                restaurantName={restaurant.name}
                restaurantId={restaurantId}
                orderType={orderType}
                onOrderTypeChange={setOrderType}
                onProceedToCheckout={handleProceedToCheckout}
                collectionEnabled={restaurant.collection_enabled}
                restaurant={restaurant}
                />

                <RestaurantInfoDialog
                open={showInfoDialog}
                onClose={() => setShowInfoDialog(false)}
                restaurant={restaurant}
                />

                {/* Time Warning Dialog */}
            {showTimeWarning && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
                    >
                        <div className="text-center">
                            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Clock className="h-8 w-8 text-orange-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                {orderType === 'collection' ? 'Collection' : 'Delivery'} Unavailable
                            </h3>
                            <p className="text-gray-600 mb-6">{timeWarningMessage}</p>
                            <Button
                                onClick={() => setShowTimeWarning(false)}
                                className="w-full bg-orange-500 hover:bg-orange-600"
                            >
                                Got it
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Cart Conflict Dialog */}
            {showCartConflictDialog && previousCartData && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl"
                    >
                        <div className="text-center">
                            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <ShoppingBag className="h-8 w-8 text-orange-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                Replace cart?
                            </h3>
                            <p className="text-gray-600 mb-6">
                                You have {previousCartData.cart.length} item{previousCartData.cart.length !== 1 ? 's' : ''} from {previousCartData.restaurantName}. 
                                Starting a new order will clear your current cart.
                            </p>
                            <div className="space-y-2">
                                <Button
                                    onClick={handleStartNewCart}
                                    className="w-full bg-orange-500 hover:bg-orange-600"
                                >
                                    Start New Order
                                </Button>
                                <Button
                                    onClick={handleKeepOldCart}
                                    variant="outline"
                                    className="w-full"
                                >
                                    Keep Current Cart
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}