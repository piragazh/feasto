import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star, Clock, Bike, ArrowLeft, ShoppingBag, MapPin, Info } from 'lucide-react';
import MenuItemCard from '@/components/restaurant/MenuItemCard';
import CartDrawer from '@/components/cart/CartDrawer';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function Restaurant() {
    const urlParams = new URLSearchParams(window.location.search);
    const restaurantId = urlParams.get('id');
    
    const [cart, setCart] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState('all');

    // Load cart from localStorage
    useEffect(() => {
        const savedCart = localStorage.getItem('cart');
        const savedRestaurantId = localStorage.getItem('cartRestaurantId');
        if (savedCart && savedRestaurantId === restaurantId) {
            setCart(JSON.parse(savedCart));
        }
    }, [restaurantId]);

    // Save cart to localStorage
    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(cart));
        if (restaurantId) {
            localStorage.setItem('cartRestaurantId', restaurantId);
        }
    }, [cart, restaurantId]);

    const { data: restaurant, isLoading: restaurantLoading } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
        enabled: !!restaurantId,
    });

    const { data: menuItems = [], isLoading: menuLoading } = useQuery({
        queryKey: ['menuItems', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const categories = ['all', ...new Set(menuItems.map(item => item.category).filter(Boolean))];

    const filteredItems = activeCategory === 'all' 
        ? menuItems 
        : menuItems.filter(item => item.category === activeCategory);

    const addToCart = (item) => {
        setCart(prev => {
            const existing = prev.find(i => i.menu_item_id === item.id);
            if (existing) {
                return prev.map(i => 
                    i.menu_item_id === item.id 
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

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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

    if (!restaurant) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
        <div className="min-h-screen bg-gray-50 pb-24">
            {/* Hero */}
            <div className="relative h-72 md:h-80">
                <img
                    src={restaurant.image_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200'}
                    alt={restaurant.name}
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                
                <div className="absolute top-4 left-4">
                    <Link to={createPageUrl('Home')}>
                        <Button size="icon" variant="secondary" className="rounded-full bg-white/90 hover:bg-white">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                </div>
                
                <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="max-w-4xl mx-auto">
                        <Badge className="bg-white/90 text-gray-800 mb-3">{restaurant.cuisine_type}</Badge>
                        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{restaurant.name}</h1>
                        <div className="flex flex-wrap items-center gap-4 text-white/90">
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
                                <span>{restaurant.delivery_fee ? `$${restaurant.delivery_fee.toFixed(2)} delivery` : 'Free delivery'}</span>
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
                                <span>Min. order ${restaurant.minimum_order}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Menu */}
            <div className="max-w-4xl mx-auto px-4 py-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Menu</h2>
                
                {categories.length > 1 && (
                    <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mb-6">
                        <TabsList className="bg-gray-100 p-1 h-auto flex-wrap">
                            {categories.map(cat => (
                                <TabsTrigger
                                    key={cat}
                                    value={cat}
                                    className="capitalize data-[state=active]:bg-white data-[state=active]:shadow-sm"
                                >
                                    {cat}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                )}

                {menuLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3, 4].map(i => (
                            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                        ))}
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">No items in this category</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredItems.map(item => (
                            <MenuItemCard key={item.id} item={item} onAddToCart={addToCart} />
                        ))}
                    </div>
                )}
            </div>

            {/* Floating Cart Button */}
            {cart.length > 0 && (
                <motion.div
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t shadow-lg"
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
                            <span>${cartTotal.toFixed(2)}</span>
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
                restaurantName={restaurant.name}
            />
        </div>
    );
}