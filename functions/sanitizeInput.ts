/**
 * XSS Prevention - Sanitize user input with DOMPurify
 */

import DOMPurify from 'npm:isomorphic-dompurify@2.3.0';

export const sanitizeInput = (input, options = {}) => {
    if (typeof input !== 'string') return input;
    
    const defaultConfig = {
        ALLOWED_TAGS: [], // No HTML tags allowed by default
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true
    };
    
    return DOMPurify.sanitize(input, { ...defaultConfig, ...options });
};

export const sanitizeObject = (obj, fieldsToSanitize = []) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = { ...obj };
    fieldsToSanitize.forEach(field => {
        if (sanitized[field] && typeof sanitized[field] === 'string') {
            sanitized[field] = sanitizeInput(sanitized[field]);
        }
    });
    
    return sanitized;
};

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'POST only' }), { status: 400 });
    }

    try {
        const { input, fields } = await req.json();
        
        if (fields && Array.isArray(fields)) {
            const sanitized = sanitizeObject(input, fields);
            return new Response(JSON.stringify({ sanitized }), { status: 200 });
        }
        
        const sanitized = sanitizeInput(input);
        return new Response(JSON.stringify({ sanitized }), { status: 200 });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }
});