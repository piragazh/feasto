import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const createManifest = (data = {}) => ({
    name: data.name || "MealDrop",
    short_name: data.short_name || "MealDrop",
    description: data.description || "Order food from your favourite restaurants",
    start_url: data.start_url || "/",
    display: data.display || "standalone",
    background_color: data.background_color || "#ffffff",
    theme_color: data.theme_color || "#f97316",
    scope: "/",
    orientation: data.orientation,
    categories: data.categories || ["food"],
    icons: data.icons || [
        { src: "https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
});

Deno.serve(async (req) => {
    try {
        const params = new URLSearchParams(req.url.split('?')[1] || '');
        const restaurantId = params.get('restaurant_id');
        const mode = params.get('mode');

        let manifest = createManifest();

        if (mode === 'tablet' && !restaurantId) {
            manifest = createManifest({
                name: "MealDrop Tablet",
                short_name: "Tablet",
                description: "Restaurant tablet management",
                start_url: "/TabletDashboard",
                orientation: "landscape-primary",
                categories: ["productivity"]
            });
        }

        if (restaurantId) {
            try {
                const base44 = createClientFromRequest(req);
                const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
                const restaurant = restaurants?.[0];

                if (restaurant) {
                    const themeColor = restaurant.theme_primary_color || "#f97316";
                    const iconUrl = restaurant.logo_url || manifest.icons[0].src;
                    
                    let name, short_name, description, start_url, display, orientation, categories;

                    if (mode === 'dashboard') {
                        name = `${restaurant.name} Dashboard`;
                        short_name = restaurant.name.substring(0, 12);
                        description = `Manage orders for ${restaurant.name}`;
                        start_url = `/RestaurantDashboard?restaurant_id=${restaurantId}`;
                        display = "standalone";
                        categories = ["productivity"];
                    } else if (mode === 'pos') {
                        name = `${restaurant.name} POS`;
                        short_name = restaurant.name.substring(0, 9);
                        description = `POS for ${restaurant.name}`;
                        start_url = `/POSDashboard?restaurantId=${restaurantId}`;
                        display = "fullscreen";
                        categories = ["productivity"];
                    } else if (mode === 'tablet') {
                        name = `${restaurant.name} Tablet`;
                        short_name = restaurant.name.substring(0, 12);
                        description = `Tablet for ${restaurant.name}`;
                        start_url = `/TabletDashboard?restaurant_id=${restaurantId}`;
                        display = "standalone";
                        orientation = "landscape-primary";
                        categories = ["productivity"];
                    } else {
                        name = restaurant.name;
                        short_name = restaurant.name.substring(0, 12);
                        description = restaurant.description || `Order from ${restaurant.name}`;
                        start_url = `/Restaurant?id=${restaurantId}`;
                        display = "standalone";
                        categories = ["food"];
                    }

                    manifest = createManifest({
                        name,
                        short_name,
                        description,
                        start_url,
                        display,
                        orientation,
                        background_color: themeColor,
                        theme_color: themeColor,
                        categories,
                        icons: [
                            { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
                            { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" }
                        ]
                    });
                }
            } catch (err) {
                console.error('[getManifest] Restaurant fetch failed:', err.message);
            }
        }

        const json = JSON.stringify(manifest);
        return new Response(json, {
            status: 200,
            headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' }
        });
    } catch (error) {
        console.error('[getManifest] Error:', error.message);
        const fallback = createManifest();
        return new Response(JSON.stringify(fallback), {
            status: 200,
            headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' }
        });
    }
});