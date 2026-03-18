import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    const fallbackManifest = {
        "name": "MealDrop",
        "short_name": "MealDrop",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#f97316",
        "scope": "/",
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

    try {
        const url = new URLSearchParams(req.url.split('?')[1]);
        const restaurantId = url.get('restaurant_id');
        const mode = url.get('mode');

        let manifest = { ...fallbackManifest };

        // Tablet mode
        if (mode === 'tablet' && !restaurantId) {
            manifest.name = "MealDrop Tablet";
            manifest.short_name = "Tablet";
            manifest.description = "Restaurant tablet management";
            manifest.start_url = "/TabletDashboard";
            manifest.orientation = "landscape-primary";
            manifest.categories = ["productivity"];
        }

        // Customize with restaurant if provided
        if (restaurantId) {
            try {
                const base44 = createClientFromRequest(req);
                const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
                const restaurant = restaurants?.[0];

                if (restaurant) {
                    const themeColor = restaurant.theme_primary_color || "#f97316";
                    const iconUrl = restaurant.logo_url || fallbackManifest.icons[0].src;

                    manifest.name = mode === 'dashboard' ? `${restaurant.name} Dashboard` : mode === 'pos' ? `${restaurant.name} POS` : mode === 'tablet' ? `${restaurant.name} Tablet` : restaurant.name;
                    manifest.short_name = restaurant.name.substring(0, 12);
                    manifest.description = mode === 'dashboard' ? `Manage orders for ${restaurant.name}` : mode === 'pos' ? `POS for ${restaurant.name}` : mode === 'tablet' ? `Tablet for ${restaurant.name}` : restaurant.description || `Order from ${restaurant.name}`;
                    manifest.theme_color = themeColor;
                    manifest.background_color = themeColor;

                    if (mode === 'dashboard') {
                        manifest.start_url = `/RestaurantDashboard?restaurant_id=${restaurantId}`;
                        manifest.categories = ["productivity"];
                    } else if (mode === 'pos') {
                        manifest.start_url = `/POSDashboard?restaurantId=${restaurantId}`;
                        manifest.display = "fullscreen";
                        manifest.categories = ["productivity"];
                    } else if (mode === 'tablet') {
                        manifest.start_url = `/TabletDashboard?restaurant_id=${restaurantId}`;
                        manifest.orientation = "landscape-primary";
                        manifest.categories = ["productivity"];
                    } else {
                        manifest.start_url = `/Restaurant?id=${restaurantId}`;
                        manifest.categories = ["food"];
                    }

                    manifest.icons = [
                        { "src": iconUrl, "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
                        { "src": iconUrl, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
                    ];
                }
            } catch (err) {
                console.error('[getManifest] Restaurant fetch failed:', err.message);
                // Use fallback manifest
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
        console.error('[getManifest] Critical error:', error.message);
        return new Response(JSON.stringify(fallbackManifest), {
            status: 200,
            headers: {
                'Content-Type': 'application/manifest+json',
                'Cache-Control': 'public, max-age=3600'
            }
        });
    }
});