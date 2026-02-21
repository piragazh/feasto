import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const url = new URLSearchParams(req.url.split('?')[1]);
        const restaurantId = url.get('restaurant_id');

        const mode = url.get('mode'); // 'dashboard' for restaurant dashboard PWA

        let manifest = {
            "name": "MealDrop",
            "short_name": "MealDrop",
            "description": "Order food from your favourite restaurants",
            "start_url": "/",
            "display": "standalone",
            "background_color": "#ffffff",
            "theme_color": "#f97316",
            "orientation": "portrait-primary",
            "icons": [
                {
                    "src": "https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png",
                    "sizes": "192x192",
                    "type": "image/png",
                    "purpose": "any maskable"
                },
                {
                    "src": "https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png",
                    "sizes": "512x512",
                    "type": "image/png",
                    "purpose": "any maskable"
                }
            ]
        };

        // If restaurant ID provided, customize with restaurant details
        if (restaurantId) {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            const restaurant = restaurants?.[0];

            if (restaurant) {
                const themeColor = restaurant.theme_primary_color || "#f97316";

                if (mode === 'dashboard') {
                    // Restaurant Dashboard PWA
                    manifest.name = `${restaurant.name} Dashboard`;
                    manifest.short_name = restaurant.name.substring(0, 12);
                    manifest.description = `Manage orders and settings for ${restaurant.name}`;
                    manifest.start_url = `/RestaurantDashboard?restaurant_id=${restaurantId}`;
                    manifest.theme_color = themeColor;
                    manifest.background_color = themeColor;
                } else if (mode === 'pos') {
                    // POS PWA
                    manifest.name = `${restaurant.name} POS`;
                    manifest.short_name = `${restaurant.name.substring(0, 9)} POS`;
                    manifest.description = `Point of Sale for ${restaurant.name}`;
                    manifest.start_url = `/POSDashboard?restaurantId=${restaurantId}`;
                    manifest.display = "fullscreen";
                    manifest.theme_color = themeColor;
                    manifest.background_color = themeColor;
                } else if (mode === 'tablet') {
                    // Tablet Dashboard PWA
                    manifest.name = `${restaurant.name} Tablet`;
                    manifest.short_name = restaurant.name.substring(0, 12);
                    manifest.description = `Tablet management for ${restaurant.name}`;
                    manifest.start_url = `/TabletDashboard?restaurant_id=${restaurantId}`;
                    manifest.display = "standalone";
                    manifest.orientation = "landscape-primary";
                    manifest.theme_color = themeColor;
                    manifest.background_color = themeColor;
                } else {
                    // Customer-facing PWA for custom domain
                    manifest.name = restaurant.name;
                    manifest.short_name = restaurant.name.substring(0, 12);
                    manifest.description = restaurant.description || `Order from ${restaurant.name}`;
                    manifest.start_url = `/Restaurant?id=${restaurantId}`;
                    manifest.theme_color = themeColor;
                }
                
                const iconUrl = restaurant.logo_url || "https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png";
                manifest.icons = [
                    {
                        "src": iconUrl,
                        "sizes": "192x192",
                        "type": "image/png",
                        "purpose": "any maskable"
                    },
                    {
                        "src": iconUrl,
                        "sizes": "512x512",
                        "type": "image/png",
                        "purpose": "any maskable"
                    }
                ];
            }
        }

        return new Response(JSON.stringify(manifest), {
            status: 200,
            headers: {
                'Content-Type': 'application/manifest+json',
                'Cache-Control': 'public, max-age=3600'
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});