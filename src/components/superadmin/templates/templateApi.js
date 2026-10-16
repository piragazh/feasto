import { base44 } from '@/api/base44Client';
import { unwrap } from '@/components/whatsapp/whatsappApi';

/** Calls the messageTemplateAdmin backend function (admins only). */
export async function tplAdmin(action, params = {}) {
    try {
        const data = unwrap(await base44.functions.invoke('messageTemplateAdmin', { action, ...params }));
        if (data?.error) throw new Error(data.error);
        return data;
    } catch (e) {
        throw new Error(e?.response?.data?.error || e?.data?.error || e?.message || 'Request failed');
    }
}

/** Example values used for previews. */
export const SAMPLE_VARS = {
    customer_name: 'Sam Patel',
    customer_first_name: 'Sam',
    restaurant_name: 'Tilbury Chicken',
    order_number: 'C-1042',
    total: '£18.50',
    eta: '25-35 mins',
    delivery_address: '12 Dock Road, Tilbury',
    items_count: '3',
    reason: 'we have run out of an item',
    status_text: 'out for delivery',
    closed_reason: 'We are closed at the moment.',
    basket: '🛒 *Your basket*\n1. 2× Chicken Burger (Meal: Fries) — £13.00\n2. 1× Large Chips — £3.50\n\n*Subtotal: £16.50*',
};

export const fillVars = (text, vars = SAMPLE_VARS) =>
    String(text || '').replace(/\{([a-z_]+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));

/** Rough SMS segment count: 160/153 for plain GSM text, 70/67 once emoji or accents appear. */
export function smsSegments(text) {
    const gsm = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/.test(text);
    const len = [...text].length;
    if (!len) return { len, segments: 0, unicode: !gsm };
    const single = gsm ? 160 : 70;
    const multi = gsm ? 153 : 67;
    return { len, segments: len <= single ? 1 : Math.ceil(len / multi), unicode: !gsm };
}

/** Inserts text at the cursor of a textarea ref and returns the new value. */
export function insertAtCursor(el, value, insert) {
    if (!el) return value + insert;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + insert + value.slice(end);
    requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + insert.length, start + insert.length);
    });
    return next;
}

/** Renders WhatsApp *bold* and _italic_ for previews, safely (React nodes, no HTML). */
export function waFormat(text) {
    const parts = String(text || '').split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
    return parts.map((p, i) => {
        if (/^\*[^*\n]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
        if (/^_[^_\n]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        return <React.Fragment key={i}>{p}</React.Fragment>;
    });
}

import React from 'react';
