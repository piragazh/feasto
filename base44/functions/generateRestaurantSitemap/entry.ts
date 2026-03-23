import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get the base URL from the request
        const url = new URL(req.url);
        const baseUrl = `${url.protocol}//${url.host}`;
        
        // Fetch all restaurants
        const restaurants = await base44.asServiceRole.entities.Restaurant.list();
        
        // Build sitemap XML
        let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
        sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        
        // Add homepage
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/</loc>\n`;
        sitemap += '    <changefreq>daily</changefreq>\n';
        sitemap += '    <priority>1.0</priority>\n';
        sitemap += '  </url>\n';
        
        // Add each restaurant
        for (const restaurant of restaurants) {
            const lastmod = restaurant.updated_date || restaurant.created_date;
            
            sitemap += '  <url>\n';
            sitemap += `    <loc>${baseUrl}/restaurant?id=${restaurant.id}</loc>\n`;
            if (lastmod) {
                sitemap += `    <lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>\n`;
            }
            sitemap += '    <changefreq>weekly</changefreq>\n';
            sitemap += '    <priority>0.8</priority>\n';
            sitemap += '  </url>\n';
            
            // Add Google Menu page for each restaurant
            sitemap += '  <url>\n';
            sitemap += `    <loc>${baseUrl}/googlemenu?id=${restaurant.id}</loc>\n`;
            if (lastmod) {
                sitemap += `    <lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>\n`;
            }
            sitemap += '    <changefreq>weekly</changefreq>\n';
            sitemap += '    <priority>0.7</priority>\n';
            sitemap += '  </url>\n';
        }
        
        sitemap += '</urlset>';
        
        return new Response(sitemap, {
            status: 200,
            headers: {
                'Content-Type': 'application/xml',
                'Cache-Control': 'public, max-age=3600'
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});