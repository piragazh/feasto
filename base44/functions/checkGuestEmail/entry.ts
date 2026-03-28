/**
 * checkGuestEmail — Safely check if an email is already registered
 * Used during guest checkout to prompt sign-in for existing users.
 * Does NOT require authentication — guests can call this freely.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    let body;
    try {
        body = await req.json();
    } catch (e) {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email } = body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return Response.json({ exists: false });
    }

    try {
        const base44 = createClientFromRequest(req);
        // Use service role to query users without requiring caller auth
        const users = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase().trim() });
        return Response.json({ exists: Array.isArray(users) && users.length > 0 });
    } catch (e) {
        console.error('[checkGuestEmail] error:', e.message);
        // Fail open — don't block checkout on email check failure
        return Response.json({ exists: false });
    }
});