import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as cheerio from 'npm:cheerio@1.0.0-rc.12';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { url } = await req.json();

        if (!url || !url.includes('just-eat.co.uk')) {
            return Response.json({ error: 'Invalid Just Eat URL' }, { status: 400 });
        }

        // Fetch the page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-GB,en;q=0.5',
            }
        });

        if (!response.ok) {
            return Response.json({ error: 'Failed to fetch page' }, { status: 400 });
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const items = [];

        // Method 1: Try to find JSON-LD structured data
        $('script[type="application/ld+json"]').each((_, element) => {
            try {
                const jsonData = JSON.parse($(element).html());
                if (jsonData.hasMenu || jsonData.menu) {
                    const menuItems = jsonData.hasMenu?.hasMenuSection || jsonData.menu?.hasMenuSection || [];
                    menuItems.forEach(section => {
                        const category = section.name || 'Main';
                        const sectionItems = section.hasMenuItem || [];
                        sectionItems.forEach(item => {
                            items.push({
                                name: item.name,
                                description: item.description || '',
                                price: parseFloat(item.offers?.price || 0),
                                category: category,
                                image_url: item.image || ''
                            });
                        });
                    });
                }
            } catch (e) {
                // Continue to next method
            }
        });

        // Method 2: Look for embedded JSON data in script tags
        if (items.length === 0) {
            $('script').each((_, element) => {
                const scriptContent = $(element).html();
                if (scriptContent && scriptContent.includes('window.__INITIAL_STATE__')) {
                    try {
                        const match = scriptContent.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/);
                        if (match) {
                            const data = JSON.parse(match[1]);
                            // Navigate the data structure to find menu items
                            const menuData = data.menu || data.restaurant?.menu || {};
                            const categories = menuData.categories || menuData.sections || [];
                            
                            categories.forEach(cat => {
                                const categoryName = cat.name || cat.title || 'Main';
                                const categoryItems = cat.items || cat.products || [];
                                
                                categoryItems.forEach(item => {
                                    items.push({
                                        name: item.name || item.title,
                                        description: item.description || '',
                                        price: parseFloat(item.price || item.displayPrice || 0),
                                        category: categoryName,
                                        image_url: item.image || item.imageUrl || ''
                                    });
                                });
                            });
                        }
                    } catch (e) {
                        // Continue to next method
                    }
                }
            });
        }

        // Method 3: Parse HTML structure directly
        if (items.length === 0) {
            $('.menuItem, .menu-item, [data-test-id*="menu-item"]').each((_, element) => {
                const $item = $(element);
                
                const name = $item.find('.itemName, .item-name, [data-test-id*="item-name"]').text().trim() ||
                             $item.find('h3, h4').first().text().trim();
                
                const priceText = $item.find('.itemPrice, .item-price, .price, [data-test-id*="price"]').text().trim();
                const price = parseFloat(priceText.replace(/[£$,]/g, ''));
                
                const description = $item.find('.itemDescription, .item-description, .description').text().trim();
                
                const category = $item.closest('[data-category], .menu-category, .category').find('h2, h3').first().text().trim() || 'Main';
                
                const imageUrl = $item.find('img').attr('src') || '';

                if (name && price > 0) {
                    items.push({
                        name,
                        description,
                        price,
                        category,
                        image_url: imageUrl.startsWith('http') ? imageUrl : ''
                    });
                }
            });
        }

        // Clean and validate items
        const validItems = items.filter(item => 
            item.name && 
            item.name.length > 0 && 
            item.price > 0 &&
            item.category
        ).map(item => ({
            name: item.name.trim(),
            description: (item.description || '').trim(),
            price: parseFloat(item.price.toFixed(2)),
            category: item.category.trim(),
            image_url: item.image_url || ''
        }));

        return Response.json({ 
            success: true, 
            items: validItems,
            count: validItems.length 
        });

    } catch (error) {
        console.error('Scraping error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});