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
        sitemap += `    <loc>${baseUrl}/Home</loc>\n`;
        sitemap += '    <changefreq>daily</changefreq>\n';
        sitemap += '    <priority>1.0</priority>\n';
        sitemap += '  </url>\n';
        
        // Add restaurant pages
        restaurants.forEach(restaurant => {
            sitemap += '  <url>\n';
            sitemap += `    <loc>${baseUrl}/Restaurant?id=${restaurant.id}</loc>\n`;
            sitemap += `    <lastmod>${restaurant.updated_date || restaurant.created_date}</lastmod>\n`;
            sitemap += '    <changefreq>weekly</changefreq>\n';
            sitemap += '    <priority>0.8</priority>\n';
            sitemap += '  </url>\n';
        });
        
        // Add static pages
        const staticPages = [
            { path: '/Orders', priority: '0.6', changefreq: 'daily' },
            { path: '/CustomerProfile', priority: '0.5', changefreq: 'monthly' },
            { path: '/PrivacyPolicy', priority: '0.3', changefreq: 'yearly' },
            { path: '/TermsOfService', priority: '0.3', changefreq: 'yearly' },
        ];
        
        staticPages.forEach(page => {
            sitemap += '  <url>\n';
            sitemap += `    <loc>${baseUrl}${page.path}</loc>\n`;
            sitemap += `    <changefreq>${page.changefreq}</changefreq>\n`;
            sitemap += `    <priority>${page.priority}</priority>\n`;
            sitemap += '  </url>\n';
        });
        
        sitemap += '</urlset>';
        
        return new Response(sitemap, {
            status: 200,
            headers: {
                'Content-Type': 'application/xml',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});