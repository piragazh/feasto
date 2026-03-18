Deno.serve((req) => {
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

    return new Response(JSON.stringify(manifest), {
        status: 200,
        headers: { 'Content-Type': 'application/manifest+json' }
    });
});