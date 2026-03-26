/**
 * Audit Logging - Track all sensitive operations for security monitoring
 * Logs: User actions, permission changes, payment operations, refunds, etc.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const base44 = createClientFromRequest(req);
        const { action, resourceType, resourceId, details, severity = 'info' } = await req.json();

        const user = await base44.auth.me();
        const userEmail = user?.email || 'anonymous';

        // Validate required fields
        if (!action || !resourceType) {
            return new Response(
                JSON.stringify({ error: 'Missing action or resourceType' }),
                { status: 400 }
            );
        }

        // Create audit log entry
        const logEntry = {
            timestamp: new Date().toISOString(),
            user_email: userEmail,
            action: action,
            resource_type: resourceType,
            resource_id: resourceId || null,
            details: details || {},
            severity: severity,
            ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
        };

        // Log to console for monitoring
        console.log(`[AUDIT] ${severity.toUpperCase()}: ${userEmail} performed ${action} on ${resourceType}${resourceId ? ` (${resourceId})` : ''}`, details);

        // Store in database if DashboardActivity entity exists
        try {
            await base44.asServiceRole.entities.DashboardActivity.create({
                user_email: userEmail,
                action: action,
                resource_type: resourceType,
                resource_id: resourceId,
                details: JSON.stringify(details),
                severity: severity
            });
        } catch (dbError) {
            console.warn('Could not store audit log to database:', dbError.message);
        }

        return new Response(
            JSON.stringify({ success: true, logId: `${userEmail}-${Date.now()}` }),
            { status: 201 }
        );

    } catch (error) {
        console.error('Audit log error:', error);
        return new Response(
            JSON.stringify({ error: 'Audit log failed' }),
            { status: 500 }
        );
    }
});