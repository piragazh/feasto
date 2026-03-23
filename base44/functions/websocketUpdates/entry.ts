/**
 * WebSocket Server for Real-time Updates
 * Handles real-time order status, messages, and notifications
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const clients = new Map(); // Store WebSocket connections by user email

Deno.serve(async (req) => {
    // Upgrade HTTP connection to WebSocket
    if (req.headers.get('upgrade') !== 'websocket') {
        return new Response('Not a WebSocket request', { status: 400 });
    }

    try {
        // Authenticate user
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response('Unauthorized', { status: 401 });
        }

        // Accept WebSocket connection
        const { socket, response } = Deno.upgradeWebSocket(req);
        
        // Store client connection
        clients.set(user.email, {
            socket,
            userId: user.email,
            role: user.role,
            connectedAt: new Date()
        });

        console.log(`[WebSocket] User ${user.email} connected`);

        // Handle messages
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data, user, base44);
            } catch (err) {
                console.error('WebSocket message error:', err);
                socket.send(JSON.stringify({ error: 'Invalid message format' }));
            }
        };

        // Handle disconnection
        socket.onclose = () => {
            clients.delete(user.email);
            console.log(`[WebSocket] User ${user.email} disconnected`);
        };

        socket.onerror = (err) => {
            console.error('WebSocket error:', err);
        };

        return response;

    } catch (error) {
        console.error('WebSocket connection error:', error);
        return new Response('Internal server error', { status: 500 });
    }
});

/**
 * Handle incoming WebSocket messages
 */
async function handleWebSocketMessage(data, user, base44) {
    const { type, payload } = data;

    switch (type) {
        case 'subscribe':
            handleSubscribe(payload, user);
            break;
        case 'ping':
            const client = clients.get(user.email);
            if (client) {
                client.socket.send(JSON.stringify({ type: 'pong' }));
            }
            break;
        default:
            console.warn(`Unknown WebSocket message type: ${type}`);
    }
}

/**
 * Subscribe to real-time updates for specific resources
 */
function handleSubscribe(payload, user) {
    const client = clients.get(user.email);
    if (!client) return;

    const { resourceType, resourceId } = payload;
    
    if (!client.subscriptions) {
        client.subscriptions = [];
    }

    const subscription = `${resourceType}:${resourceId}`;
    if (!client.subscriptions.includes(subscription)) {
        client.subscriptions.push(subscription);
        client.socket.send(JSON.stringify({
            type: 'subscribed',
            resource: subscription
        }));
    }
}

/**
 * Broadcast update to all connected clients
 * Used by other functions to push real-time updates
 */
export function broadcastUpdate(resourceType, resourceId, updateData, targetUserEmail = null) {
    const subscription = `${resourceType}:${resourceId}`;
    
    clients.forEach((client, email) => {
        // Send to specific user or all subscribed users
        if (targetUserEmail && email !== targetUserEmail) return;
        
        if (client.subscriptions?.includes(subscription)) {
            try {
                client.socket.send(JSON.stringify({
                    type: 'update',
                    resourceType,
                    resourceId,
                    data: updateData,
                    timestamp: new Date().toISOString()
                }));
            } catch (err) {
                console.error('Failed to send update to client:', err);
            }
        }
    });
}

/**
 * Notify specific user
 */
export function notifyUser(userEmail, notification) {
    const client = clients.get(userEmail);
    if (client) {
        try {
            client.socket.send(JSON.stringify({
                type: 'notification',
                ...notification,
                timestamp: new Date().toISOString()
            }));
        } catch (err) {
            console.error('Failed to notify user:', err);
        }
    }
}