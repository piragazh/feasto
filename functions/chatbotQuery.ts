import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { message, conversationHistory = [] } = await req.json();

        if (!message) {
            return Response.json({ error: 'Message is required' }, { status: 400 });
        }

        // Fetch user's recent orders
        const orders = await base44.entities.Order.filter({ created_by: user.email }, '-created_date', 10);
        
        // Fetch restaurants for context
        const restaurantIds = [...new Set(orders.map(o => o.restaurant_id))];
        const restaurants = restaurantIds.length > 0 
            ? await base44.entities.Restaurant.filter({ id: { $in: restaurantIds } })
            : [];

        // Build context for the AI
        const systemPrompt = `You are a helpful customer support chatbot for Foodie, a food delivery platform.

Your capabilities:
- Answer questions about order status, delivery times, and tracking
- Provide information about restaurant hours and menus
- Explain refund and cancellation policies
- Help with account-related questions

Current customer information:
- Email: ${user.email}
- Name: ${user.full_name}

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