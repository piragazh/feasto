import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const url = new URLSearchParams(req.url.split('?')[1]);
        const restaurantId = url.get('restaurant_id');

        let manifest = {
            "name": "MealDrop",
            "short_name": "MealDrop",
            "description": "Restaurant Management Dashboard",
            "start_url": "/RestaurantDashboard",
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
                manifest.name = restaurant.name;
                manifest.short_name = restaurant.name.substring(0, 12);
                manifest.description = `${restaurant.name} - Restaurant Dashboard`;
                manifest.theme_color = restaurant.theme_primary_color || "#f97316";
                
                if (restaurant.logo_url) {
                    manifest.icons = [
                        {
                            "src": restaurant.logo_url,
                            "sizes": "192x192",
                            "type": "image/png",
                            "purpose": "any maskable"
                        },
                        {
                            "src": restaurant.logo_url,
                            "sizes": "512x512",
                            "type": "image/png",
                            "purpose": "any maskable"
                        }
                    ];
                }
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