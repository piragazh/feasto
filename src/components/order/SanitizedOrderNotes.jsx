import React from 'react';
import DOMPurify from 'dompurify';

/**
 * SafeOrderNotes - Displays order notes/instructions with XSS protection
 * Uses DOMPurify to sanitize content before rendering
 */
export default function SanitizedOrderNotes({ notes, className = '' }) {
    if (!notes || typeof notes !== 'string' || notes.trim() === '') {
        return null;
    }

    // CRITICAL SECURITY: Sanitize notes to prevent XSS attacks
    // DOMPurify removes dangerous HTML/JS while preserving safe text
    const sanitized = DOMPurify.sanitize(notes, {
        ALLOWED_TAGS: [], // Allow only text, no HTML tags
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true
    });

    // If nothing remains after sanitization, don't render
    if (!sanitized || sanitized.trim() === '') {
        return null;
    }

    return (
        <div className={className}>
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                {sanitized}
            </p>
        </div>
    );
}