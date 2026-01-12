// ============================================
// AI CHATBOT BACKEND FUNCTION
// ============================================
// This function processes customer queries using AI and provides
// intelligent responses about orders, restaurants, and policies.
// It can automatically escalate complex issues to human support.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Main function handler - Deno processes incoming HTTP requests
Deno.serve(async (req) => {
    try {
        // ---- AUTHENTICATION ----
        // Create SDK client from the incoming request (includes user token)
        const base44 = createClientFromRequest(req);
        
        // Get the authenticated user making the request
        const user = await base44.auth.me();

        // If no user is logged in, return error
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ---- PARSE REQUEST DATA ----
        // Extract the message and conversation history from request body
        const { message, conversationHistory = [], restaurantId, currentPage } = await req.json();

        // Validate that a message was provided
        if (!message) {
            return Response.json({ error: 'Message is required' }, { status: 400 });
        }

        // ---- FETCH USER CONTEXT ----
        // Get user's recent orders to provide personalized responses
        // Parameters: filter, sort order, limit
        const orders = await base44.entities.Order.filter(
            { created_by: user.email }, // Only this user's orders
            '-created_date', // Sort by newest first (- means descending)
            10 // Limit to 10 most recent orders
        );
        
        // Get restaurant information for the user's orders
        const restaurantIds = [...new Set(orders.map(o => o.restaurant_id))]; // Unique restaurant IDs
        const restaurants = restaurantIds.length > 0 
            ? await base44.entities.Restaurant.filter({ id: { $in: restaurantIds } }) // Fetch matching restaurants
            : []; // Empty array if no orders
        
        // Get current restaurant being viewed (if any)
        let currentRestaurant = null;
        let currentRestaurantMenuItems = [];
        if (restaurantId) {
            const currentRestaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            if (currentRestaurants.length > 0) {
                currentRestaurant = currentRestaurants[0];
                // Get menu items for this restaurant
                currentRestaurantMenuItems = await base44.entities.MenuItem.filter({ restaurant_id: restaurantId });
            }
        }

        // ---- BUILD AI CONTEXT ----
        // Create a comprehensive prompt for the AI with user data and policies
        const systemPrompt = `You are a helpful customer support chatbot for MealDrop, a food delivery platform.

Your capabilities:
- Answer questions about order status, delivery times, and tracking
- Provide information about restaurant hours and menus
- Explain refund and cancellation policies
- Help with account-related questions

Current customer information:
- Email: ${user.email}
- Name: ${user.full_name}

${currentRestaurant ? `
CURRENT CONTEXT - User is viewing this restaurant:
Restaurant: ${currentRestaurant.name}
Cuisine: ${currentRestaurant.cuisine_type}
Rating: ${currentRestaurant.rating?.toFixed(1)} (${currentRestaurant.review_count || 0} reviews)
Delivery fee: £${currentRestaurant.delivery_fee?.toFixed(2)}
Delivery time: ${currentRestaurant.delivery_time}
Minimum order: £${currentRestaurant.minimum_order || 0}
Address: ${currentRestaurant.address || 'Not specified'}
${currentRestaurant.opening_hours ? `Opening hours: ${JSON.stringify(currentRestaurant.opening_hours)}` : ''}
${currentRestaurant.collection_enabled ? 'Collection available' : 'Delivery only'}

Menu items available (${currentRestaurantMenuItems.length} items):
${currentRestaurantMenuItems.slice(0, 10).map(item => `- ${item.name}: £${item.price?.toFixed(2)}${item.description ? ` - ${item.description}` : ''}${item.is_available === false ? ' (Currently unavailable)' : ''}`).join('\n')}
${currentRestaurantMenuItems.length > 10 ? `... and ${currentRestaurantMenuItems.length - 10} more items` : ''}

IMPORTANT: When answering questions about menu items, prices, opening hours, or delivery options, use the information about ${currentRestaurant.name} provided above.
` : ''}

Recent orders:
${orders.map(o => `- Order #${o.id.slice(-8)} from ${o.restaurant_name} (Status: ${o.status}, Total: £${o.total?.toFixed(2)}, Date: ${new Date(o.created_date).toLocaleDateString()})`).join('\n')}

Platform policies:
- Refunds: Available within 24 hours for orders with quality issues or non-delivery
- Delivery time: Typically 30-45 minutes, varies by restaurant and location
- Cancellation: Free cancellation before restaurant confirms (within 5 minutes)
- Customer support: Available via escalation for complex issues

Instructions:
1. Be friendly, concise, and helpful
2. Use the customer's order history to provide personalized responses
3. If the customer has a specific order issue, reference their order details
4. For complex issues requiring human intervention (refunds, disputes, account problems), suggest escalating to support
5. Always maintain a professional and empathetic tone
6. If you don't have enough information to help, acknowledge it and suggest escalation

IMPORTANT: 
- If the user asks for a refund, instructs you to process payments, or has an unresolved complaint, respond with: "I understand this needs human attention. Let me escalate this to our support team. [ESCALATE]"
- The [ESCALATE] tag will trigger the escalation flow
- Be proactive in suggesting escalation for sensitive issues`;

        // Prepare conversation history
        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            { role: 'user', content: message }
        ];

        // Call LLM
        const response = await base44.integrations.Core.InvokeLLM({
            prompt: JSON.stringify(messages)
        });

        // Check if escalation is needed
        const needsEscalation = response.includes('[ESCALATE]');
        const cleanResponse = response.replace('[ESCALATE]', '').trim();

        return Response.json({
            response: cleanResponse,
            needsEscalation,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});