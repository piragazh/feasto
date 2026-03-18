import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    const manifest = {
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
    
    try {
        const params = new URLSearchParams(req.url.split('?')[1] || '');
        const mode = params.get('mode');
        const restaurantId = params.get('restaurant_id');

        if (mode === 'tablet') {
            if (!restaurantId) {
                manifest.name = "MealDrop Tablet";
                manifest.short_name = "Tablet";
                manifest.description = "Restaurant tablet management";
                manifest.start_url = "/TabletDashboard";
                manifest.orientation = "landscape-primary";
                manifest.categories = ["productivity"];
            } else {
                const base44 = createClientFromRequest(req);
                const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
                const restaurant = restaurants?.[0];
                
                if (restaurant) {
                    manifest.name = `${restaurant.name} Tablet`;
                    manifest.short_name = restaurant.name.substring(0, 12);
                    manifest.description = `Tablet for ${restaurant.name}`;
                    manifest.start_url = `/TabletDashboard?restaurant_id=${restaurantId}`;
                    manifest.orientation = "landscape-primary";
                    manifest.theme_color = restaurant.theme_primary_color || "#f97316";
                    manifest.background_color = restaurant.theme_primary_color || "#ffffff";
                    manifest.categories = ["productivity"];
                    if (restaurant.logo_url) {
                        manifest.icons = [
                            { src: restaurant.logo_url, sizes: "192x192", type: "image/png", purpose: "any maskable" },
                            { src: restaurant.logo_url, sizes: "512x512", type: "image/png", purpose: "any maskable" }
                        ];
                    }
                }
            }
        }
    } catch (error) {
        console.error('[getManifest]', error.message);
    }

    return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' }
    });
});