import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function Sitemap() {
    const [sitemap, setSitemap] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        generateSitemap();
    }, []);

    const generateSitemap = async () => {
        try {
            const baseUrl = window.location.origin;
            const restaurants = await base44.entities.Restaurant.list();

            let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
            xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

            // Homepage
            xml += '  <url>\n';
            xml += `    <loc>${baseUrl}/</loc>\n`;
            xml += '    <changefreq>daily</changefreq>\n';
            xml += '    <priority>1.0</priority>\n';
            xml += '  </url>\n';

            // Each restaurant
            for (const restaurant of restaurants) {
                const lastmod = restaurant.updated_date || restaurant.created_date;

                xml += '  <url>\n';
                xml += `    <loc>${baseUrl}/restaurant?id=${restaurant.id}</loc>\n`;
                if (lastmod) {
                    xml += `    <lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>\n`;
                }
                xml += '    <changefreq>weekly</changefreq>\n';
                xml += '    <priority>0.8</priority>\n';
                xml += '  </url>\n';

                // Google Menu
                xml += '  <url>\n';
                xml += `    <loc>${baseUrl}/googlemenu?id=${restaurant.id}</loc>\n`;
                if (lastmod) {
                    xml += `    <lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>\n`;
                }
                xml += '    <changefreq>weekly</changefreq>\n';
                xml += '    <priority>0.7</priority>\n';
                xml += '  </url>\n';
            }

            // Static pages
            const staticPages = [
                { path: '/orders', priority: '0.6' },
                { path: '/favorites', priority: '0.5' },
                { path: '/loyaltyprogram', priority: '0.6' },
                { path: '/privacypolicy', priority: '0.3' },
                { path: '/termsofservice', priority: '0.3' },
                { path: '/cookiespolicy', priority: '0.3' }
            ];

            for (const page of staticPages) {
                xml += '  <url>\n';
                xml += `    <loc>${baseUrl}${page.path}</loc>\n`;
                xml += '    <changefreq>monthly</changefreq>\n';
                xml += `    <priority>${page.priority}</priority>\n`;
                xml += '  </url>\n';
            }

            xml += '</urlset>';

            setSitemap(xml);
            setLoading(false);
        } catch (error) {
            console.error('Error generating sitemap:', error);
            setSitemap(`Error: ${error.message}`);
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-600">Generating sitemap...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-4xl mx-auto">
                <pre className="bg-white p-4 rounded-lg shadow overflow-x-auto text-xs">
                    {sitemap}
                </pre>
            </div>
        </div>
    );
}