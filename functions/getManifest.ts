Deno.serve((req) => {
    try {
        const manifest = {
            name: "MealDrop",
            short_name: "MealDrop",
            description: "Order food from your favourite restaurants",
            start_url: "/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: "#f97316",
            scope: "/",
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
                manifest.start_url = "/TabletDashboard";
            }
        } catch (_) {
            // Ignore URL parsing errors, use default
        }

        const json = JSON.stringify(manifest);
        return new Response(json, {
            status: 200,
            headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' }
        });
    } catch (err) {
        const fallback = { name: "MealDrop", short_name: "MealDrop", start_url: "/", display: "standalone", icons: [] };
        return new Response(JSON.stringify(fallback), { status: 200, headers: { 'Content-Type': 'application/manifest+json' } });
    }
});