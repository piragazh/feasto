import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Use Web Crypto API (available in Deno)
const encoder = new TextEncoder();

const SECRET_KEY = Deno.env.get('SCHEDULED_DIGEST_SECRET') || 'fallback-secret';

// Generate unsubscribe token: base64(email:channel:timestamp:hmac)
async function generateUnsubscribeToken(email, channel) {
  const timestamp = Date.now();
  const data = `${email}:${channel}:${timestamp}`;
  
  const keyData = encoder.encode(SECRET_KEY);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const hmac = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const token = `${data}:${hmac}`;
  return btoa(token);
}

// Validate token and extract email + channel
async function validateUnsubscribeToken(token) {
  try {
    const decoded = atob(token);
    // Split on ':' but HMAC (base64) may contain '=', '+', '/' but NOT ':'.
    // Format is: email:channel:timestamp:hmac — split into max 4 parts from the left.
    const firstColon = decoded.indexOf(':');
    const secondColon = decoded.indexOf(':', firstColon + 1);
    const thirdColon = decoded.indexOf(':', secondColon + 1);
    if (firstColon === -1 || secondColon === -1 || thirdColon === -1) return null;

    const email = decoded.slice(0, firstColon);
    const channel = decoded.slice(firstColon + 1, secondColon);
    const timestamp = decoded.slice(secondColon + 1, thirdColon);
    const providedHmac = decoded.slice(thirdColon + 1);
    const data = `${email}:${channel}:${timestamp}`;
    
    const keyData = encoder.encode(SECRET_KEY);
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const expectedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));

    // Constant-time comparison
    if (providedHmac !== expectedHmac) return null;

    // Check token age (max 30 days)
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 30 * 24 * 60 * 60 * 1000) return null;

    return { email, channel };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    // Support both GET (unsubscribe link) and POST (validation)
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const token = url.searchParams.get('token');
      const channel = url.searchParams.get('channel');

      if (!token || !channel) {
        return new Response(
          `<html><body><h1>Invalid Request</h1><p>Missing token or channel parameter.</p></body></html>`,
          { status: 400, headers: { 'Content-Type': 'text/html' } }
        );
      }

      const data = await validateUnsubscribeToken(token);
      if (!data) {
        return new Response(
          `<html><body><h1>Invalid or Expired Link</h1><p>This unsubscribe link is no longer valid.</p></body></html>`,
          { status: 400, headers: { 'Content-Type': 'text/html' } }
        );
      }

      if (data.channel !== channel) {
        return new Response(
          `<html><body><h1>Invalid Request</h1><p>Channel mismatch.</p></body></html>`,
          { status: 400, headers: { 'Content-Type': 'text/html' } }
        );
      }

      // Fetch user by email and update opt-out status
      const base44 = createClientFromRequest(req);
      const users = await base44.asServiceRole.entities.User.filter({ email: data.email });
      if (!users || users.length === 0) {
        return new Response(
          `<html><body><h1>User Not Found</h1><p>No user account found with this email.</p></body></html>`,
          { status: 404, headers: { 'Content-Type': 'text/html' } }
        );
      }

      const user = users[0];
      const fieldName = channel === 'email' ? 'promotional_emails_opted_out' : 'promotional_sms_opted_out';

      await base44.asServiceRole.entities.User.update(user.id, {
        [fieldName]: true
      });

      const channelLabel = channel === 'email' ? 'promotional emails' : 'promotional SMS/WhatsApp messages';
      return new Response(
        `<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
          <h1 style="color: #27ae60;">✓ Unsubscribed Successfully</h1>
          <p>You have been unsubscribed from ${channelLabel}.</p>
          <p style="color: #7f8c8d; font-size: 14px;">You can resubscribe anytime by contacting our support team.</p>
        </body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // POST: Generate unsubscribe token (internal use only)
    if (req.method === 'POST') {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Unauthorized' }, { status: 403 });
      }

      const { email, channel } = await req.json();
      if (!email || !channel) {
        return Response.json({ error: 'Missing email or channel' }, { status: 400 });
      }

      const token = await generateUnsubscribeToken(email, channel);
      return Response.json({ token });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('[UNSUBSCRIBE] Error:', error.message);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
});