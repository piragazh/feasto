import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        const { message, conversationHistory = [], restaurantId, cartItems = [], cartTotal = 0 } = await req.json();

        if (!message) {
            return Response.json({ error: 'Message is required' }, { status: 400 });
        }

        // Fetch context in parallel
        const [orders, currentRestaurants, menuItemsRaw, promotionsRaw] = await Promise.all([
            user ? base44.entities.Order.filter({ created_by: user.email }, '-created_date', 5) : Promise.resolve([]),
            restaurantId ? base44.entities.Restaurant.filter({ id: restaurantId }) : Promise.resolve([]),
            restaurantId ? base44.entities.MenuItem.filter({ restaurant_id: restaurantId }) : Promise.resolve([]),
            restaurantId ? base44.entities.Promotion.filter({ restaurant_id: restaurantId, is_active: true }) : Promise.resolve([]),
        ]);

        const currentRestaurant = currentRestaurants[0] || null;
        const menuItems = menuItemsRaw.filter(i => i.is_available !== false);
        const promotions = promotionsRaw.filter(p => {
            const now = new Date();
            return (!p.start_date || new Date(p.start_date) <= now) && (!p.end_date || new Date(p.end_date) >= now);
        });

        // Group menu items by category
        const byCategory = {};
        menuItems.forEach(item => {
            const cat = item.category || 'Other';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(item);
        });

        // Popular / best sellers
        const bestSellers = menuItems.filter(i => i.is_popular).slice(0, 5);
        const allCategories = Object.keys(byCategory);

        // Cart context string
        const cartSummary = cartItems.length > 0
            ? cartItems.map(i => `${i.quantity}x ${i.name} (£${(i.price * i.quantity).toFixed(2)})`).join(', ')
            : 'empty';

        // Active promotions context
        const promoSummary = promotions.map(p => {
            if (p.promotion_type === 'percentage_off') return `${p.promotion_code || p.name}: ${p.discount_value}% off${p.minimum_order ? ` on orders over £${p.minimum_order}` : ''}`;
            if (p.promotion_type === 'fixed_amount_off') return `${p.promotion_code || p.name}: £${p.discount_value} off${p.minimum_order ? ` on orders over £${p.minimum_order}` : ''}`;
            if (p.promotion_type === 'free_delivery') return `${p.name}: Free delivery`;
            return `${p.name}: ${p.description || ''}`;
        }).join('\n');

        const systemPrompt = `You are a smart ordering assistant for ${currentRestaurant?.name || 'this restaurant'} — think smart waiter + sales assistant, NOT a generic chatbot.

YOUR PRIMARY GOALS:
1. Help users build their order fast
2. Upsell relevant add-ons and bundles
3. Inform users about deals and promotions proactively
4. Answer order tracking and FAQs quickly

CUSTOMER CONTEXT:
- Name: ${user?.full_name || 'Guest'}
- Current cart: ${cartSummary}
- Cart total: £${cartTotal.toFixed(2)}
${orders.length > 0 ? `- Recent order: ${orders[0].restaurant_name} (${orders[0].status}) - £${orders[0].total?.toFixed(2)}` : ''}

${currentRestaurant ? `
RESTAURANT: ${currentRestaurant.name}
- Delivery fee: £${currentRestaurant.delivery_fee?.toFixed(2) || '0.00'}
- Min order: £${currentRestaurant.minimum_order || 0}
- Delivery time: ${currentRestaurant.delivery_time || '30-45 mins'}
- Collection available: ${currentRestaurant.collection_enabled ? 'Yes' : 'No'}
- Accepts cash: ${currentRestaurant.accepts_cash_on_delivery ? 'Yes' : 'No'}
` : ''}

FULL MENU (${menuItems.length} items):
${Object.entries(byCategory).map(([cat, items]) =>
    `[${cat}]\n${items.map(i => `  ID:${i.id} | ${i.name} | £${i.price?.toFixed(2)}${i.is_popular ? ' ⭐BESTSELLER' : ''}${i.description ? ` | ${i.description.slice(0, 60)}` : ''}`).join('\n')}`
).join('\n\n')}

ACTIVE PROMOTIONS:
${promoSummary || 'None currently active'}

BEST SELLERS: ${bestSellers.map(i => `${i.name} (£${i.price?.toFixed(2)})`).join(', ') || 'Check our menu'}

BEHAVIOUR RULES:
- Keep responses SHORT (2-4 lines max). No walls of text.
- Always push toward an action: add item, view cart, checkout
- Use emojis sparingly and purposefully: 🔥🍗🍟💥
- NEVER suggest more than 3 items at once
- After user adds something, suggest ONE relevant upsell
- If cart is empty, lead with 2 best sellers
- Proactively mention promotions when relevant (e.g., "You're £X away from free delivery")
- If user seems stuck, offer "🔥 Show me best sellers" or "💥 What's the best deal?"

STRUCTURED RESPONSES:
When you want to suggest items, output them in this EXACT JSON block format (the UI will render them as cards):
<ITEMS>
[{"id":"ITEM_ID","name":"Item Name","price":5.99,"emoji":"🍗","reason":"Why you're suggesting this"}]
</ITEMS>

When you want to show quick reply buttons, output:
<ACTIONS>
["Button label 1","Button label 2","Button label 3"]
</ACTIONS>

When you detect the user wants to track an order:
<TRACK_ORDER>
{"order_id":"${orders[0]?.id || ''}","status":"${orders[0]?.status || ''}","restaurant":"${orders[0]?.restaurant_name || ''}"}
</TRACK_ORDER>

When escalation is needed (complaint, wrong order, refund dispute):
[ESCALATE]

EXAMPLES:
User: "I'm hungry" → Suggest 2-3 best sellers with item cards + actions ["Show deals", "Track order"]
User: "What's cheap?" → Show 2-3 lowest price items + mention any active promo
User: "Any deals?" → List active promotions + best bundle
User: "Add wings" → Confirm, then upsell 1 item like fries or drink
User: "Where's my order?" → Show order status from their recent order
User: "Problem with my order" → Sympathise, offer escalation to restaurant`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.slice(-8).map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: message }
        ];

        const response = await base44.integrations.Core.InvokeLLM({
            prompt: JSON.stringify(messages),
            model: 'gpt_5_mini'
        });

        // Parse structured blocks
        const itemsMatch = response.match(/<ITEMS>([\s\S]*?)<\/ITEMS>/);
        const actionsMatch = response.match(/<ACTIONS>([\s\S]*?)<\/ACTIONS>/);
        const trackMatch = response.match(/<TRACK_ORDER>([\s\S]*?)<\/TRACK_ORDER>/);
        const needsEscalation = response.includes('[ESCALATE]');

        let suggestedItems = [];
        let quickActions = [];
        let trackData = null;

        if (itemsMatch) {
            try { suggestedItems = JSON.parse(itemsMatch[1].trim()); } catch(e) {}
        }
        if (actionsMatch) {
            try { quickActions = JSON.parse(actionsMatch[1].trim()); } catch(e) {}
        }
        if (trackMatch) {
            try { trackData = JSON.parse(trackMatch[1].trim()); } catch(e) {}
        }

        // Clean response text
        let cleanResponse = response
            .replace(/<ITEMS>[\s\S]*?<\/ITEMS>/g, '')
            .replace(/<ACTIONS>[\s\S]*?<\/ACTIONS>/g, '')
            .replace(/<TRACK_ORDER>[\s\S]*?<\/TRACK_ORDER>/g, '')
            .replace('[ESCALATE]', '')
            .trim();

        // Enrich suggested items with full menu data
        if (suggestedItems.length > 0) {
            suggestedItems = suggestedItems.map(s => {
                const found = menuItems.find(m => m.id === s.id || m.name.toLowerCase() === s.name.toLowerCase());
                if (found) return { ...s, id: found.id, name: found.name, price: found.price, image_url: found.image_url, category: found.category };
                return s;
            }).filter(s => s.id);
        }

        return Response.json({
            response: cleanResponse,
            suggestedItems,
            quickActions,
            trackData,
            needsEscalation,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});