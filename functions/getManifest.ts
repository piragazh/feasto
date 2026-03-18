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
        const url = new URL(req.url);
        const mode = url.searchParams.get('mode');
        
        if (mode === 'tablet') {
            manifest.name = "MealDrop Tablet";
            manifest.short_name = "Tablet";
            manifest.description = "Restaurant tablet management";
            manifest.start_url = "/TabletDashboard";
            manifest.orientation = "landscape-primary";
            manifest.categories = ["productivity"];
        }
    } catch (e) {
        console.error('[getManifest]', e.message);
    }

    return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' }
    });
});