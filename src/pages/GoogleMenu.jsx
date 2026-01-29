import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

export default function GoogleMenu() {
    const location = useLocation();
    const restaurantId = new URLSearchParams(location.search).get('id');
    
    const [restaurant, setRestaurant] = useState(null);
    const [menuItems, setMenuItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadMenuData();
    }, [restaurantId]);

    const loadMenuData = async () => {
        try {
            if (!restaurantId) {
                setLoading(false);
                return;
            }

            // Load restaurant
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            const restaurantData = restaurants?.[0];
            setRestaurant(restaurantData);

            // Load menu items
            const items = await base44.entities.MenuItem.filter({ 
                restaurant_id: restaurantId,
                is_available: true 
            });
            setMenuItems(items || []);

            // Generate structured data for Google
            if (restaurantData && items) {
                generateStructuredData(restaurantData, items);
            }
        } catch (error) {
            console.error('Failed to load menu:', error);
        } finally {
            setLoading(false);
        }
    };

    const generateStructuredData = (restaurant, items) => {
        const structuredData = {
            "@context": "https://schema.org",
            "@type": "Restaurant",
            "name": restaurant.name,
            "description": restaurant.description,
            "image": restaurant.image_url || restaurant.logo_url,
            "address": {
                "@type": "PostalAddress",
                "streetAddress": restaurant.address
            },
            "hasMenu": {
                "@type": "Menu",
                "hasMenuSection": []
            }
        };

        // Group items by category
        const categories = {};
        items.forEach(item => {
            const category = item.category || 'Menu';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(item);
        });

        // Create menu sections
        Object.entries(categories).forEach(([category, categoryItems]) => {
            const section = {
                "@type": "MenuSection",
                "name": category,
                "hasMenuItem": categoryItems.map(item => ({
                    "@type": "MenuItem",
                    "name": item.name,
                    "description": item.description,
                    "image": item.image_url,
                    "offers": {
                        "@type": "Offer",
                        "price": item.price.toFixed(2),
                        "priceCurrency": "GBP"
                    }
                }))
            };
            structuredData.hasMenu.hasMenuSection.push(section);
        });

        // Inject structured data into page
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.text = JSON.stringify(structuredData);
        document.head.appendChild(script);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
        );
    }

    if (!restaurant) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <p className="text-gray-500">Restaurant not found</p>
            </div>
        );
    }

    // Group items by category
    const categories = {};
    menuItems.forEach(item => {
        const category = item.category || 'Menu';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(item);
    });

    return (
        <div className="min-h-screen bg-white">
            {/* Restaurant Header */}
            <div className="border-b bg-gray-50 py-8">
                <div className="max-w-4xl mx-auto px-4">
                    <div className="flex items-center gap-4">
                        {restaurant.logo_url && (
                            <img 
                                src={restaurant.logo_url} 
                                alt={restaurant.name}
                                className="w-20 h-20 rounded-lg object-cover"
                            />
                        )}
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">{restaurant.name}</h1>
                            {restaurant.description && (
                                <p className="text-gray-600 mt-1">{restaurant.description}</p>
                            )}
                            {restaurant.address && (
                                <p className="text-sm text-gray-500 mt-1">{restaurant.address}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Menu Items by Category */}
            <div className="max-w-4xl mx-auto px-4 py-8">
                {Object.entries(categories).map(([category, items]) => (
                    <div key={category} className="mb-12">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b">
                            {category}
                        </h2>
                        <div className="space-y-6">
                            {items.map((item) => (
                                <div 
                                    key={item.id} 
                                    className="flex gap-4 pb-6 border-b border-gray-200 last:border-0"
                                    itemScope 
                                    itemType="https://schema.org/MenuItem"
                                >
                                    {item.image_url && (
                                        <img 
                                            src={item.image_url}
                                            alt={item.name}
                                            className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
                                            itemProp="image"
                                        />
                                    )}
                                    <div className="flex-1">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h3 
                                                    className="text-lg font-semibold text-gray-900"
                                                    itemProp="name"
                                                >
                                                    {item.name}
                                                </h3>
                                                {item.description && (
                                                    <p 
                                                        className="text-gray-600 text-sm mt-1"
                                                        itemProp="description"
                                                    >
                                                        {item.description}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-2 mt-2">
                                                    {item.is_vegetarian && (
                                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                                            🌱 Vegetarian
                                                        </span>
                                                    )}
                                                    {item.is_spicy && (
                                                        <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                                                            🌶️ Spicy
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div 
                                                className="text-lg font-bold text-gray-900 flex-shrink-0"
                                                itemProp="offers"
                                                itemScope
                                                itemType="https://schema.org/Offer"
                                            >
                                                <span itemProp="price">£{item.price.toFixed(2)}</span>
                                                <meta itemProp="priceCurrency" content="GBP" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="border-t py-6 mt-8">
                <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500">
                    <p>{restaurant.name} - Menu</p>
                    {restaurant.phone && <p>Tel: {restaurant.phone}</p>}
                </div>
            </div>
        </div>
    );
}