/**
 * Security Headers Middleware
 * Implements comprehensive security headers for all responses
 */

export function addSecurityHeaders(response) {
    // Prevent MIME sniffing
    response.headers.set('X-Content-Type-Options', 'nosniff');

    // Clickjacking protection
    response.headers.set('X-Frame-Options', 'DENY');

    // XSS protection
    response.headers.set('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy (formerly Feature-Policy)
    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(self), payment=(self)'
    );

    // HSTS - enforce HTTPS
    response.headers.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
    );

    // CSP - Content Security Policy (strict)
    response.headers.set(
        'Content-Security-Policy',
        `default-src 'self'; 
         script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://cdn.jsdelivr.net;
         style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
         font-src 'self' https://fonts.gstatic.com;
         img-src 'self' data: https:;
         connect-src 'self' https:;
         frame-ancestors 'none';
         base-uri 'self';
         form-action 'self'`
    );

    // Disable caching for sensitive responses
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
}

Deno.serve(async (req) => {
    try {
        // This is a utility - normally called from other functions
        // Return empty response with headers applied
        const response = new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
        return addSecurityHeaders(response);
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});