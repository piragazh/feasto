const fallbackManifest = {
    name: "MealDrop",
    short_name: "MealDrop",
    description: "Order food from your favourite restaurants",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f97316",
    scope: "/",
    categories: ["food"],
    icons: [
        { src: "https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
};

Deno.serve(async (req) => {
    let manifest = { ...fallbackManifest };
    
    try {
        const params = new URLSearchParams(req.url.split('?')[1] || '');
        const restaurantId = params.get('restaurant_id');
        const mode = params.get('mode');

        if (mode === 'tablet' && !restaurantId) {
            manifest = {
                ...fallbackManifest,
                name: "MealDrop Tablet",
                short_name: "Tablet",
                description: "Restaurant tablet management",
                start_url: "/TabletDashboard",
                orientation: "landscape-primary",
                categories: ["productivity"]
            };
        } else if (restaurantId) {
            try {
                const { createClientFromRequest } = await import('npm:@base44/sdk@0.8.21');
                const base44 = createClientFromRequest(req);
                const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
                const restaurant = restaurants?.[0];

                if (restaurant) {
                    const themeColor = restaurant.theme_primary_color || "#f97316";
                    const iconUrl = restaurant.logo_url || fallbackManifest.icons[0].src;

                    manifest.theme_color = themeColor;
                    manifest.background_color = themeColor;
                    manifest.icons = [
                        { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
                        { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" }
                    ];

                    if (mode === 'dashboard') {
                        manifest.name = `${restaurant.name} Dashboard`;
                        manifest.short_name = restaurant.name.substring(0, 12);
                        manifest.description = `Manage orders for ${restaurant.name}`;
                        manifest.start_url = `/RestaurantDashboard?restaurant_id=${restaurantId}`;
                        manifest.categories = ["productivity"];
                    } else if (mode === 'pos') {
                        manifest.name = `${restaurant.name} POS`;
                        manifest.short_name = restaurant.name.substring(0, 9);
                        manifest.description = `POS for ${restaurant.name}`;
                        manifest.start_url = `/POSDashboard?restaurantId=${restaurantId}`;
                        manifest.display = "fullscreen";
                        manifest.categories = ["productivity"];
                    } else if (mode === 'tablet') {
                        manifest.name = `${restaurant.name} Tablet`;
                        manifest.short_name = restaurant.name.substring(0, 12);
                        manifest.description = `Tablet for ${restaurant.name}`;
                        manifest.start_url = `/TabletDashboard?restaurant_id=${restaurantId}`;
                        manifest.orientation = "landscape-primary";
                        manifest.categories = ["productivity"];
                    } else {
                        manifest.name = restaurant.name;
                        manifest.short_name = restaurant.name.substring(0, 12);
                        manifest.description = restaurant.description || `Order from ${restaurant.name}`;
                        manifest.start_url = `/Restaurant?id=${restaurantId}`;
                        manifest.categories = ["food"];
                    }
                }
            } catch (err) {
                console.error('[getManifest] Restaurant error:', err.message);
            }
        }
    } catch (err) {
        console.error('[getManifest] Parse error:', err.message);
    }

    return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' }
    });
});