import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * DELETE USER ACCOUNT
 * Permanently removes a user's account and all associated data:
 * - Favorites
 * - Loyalty points & transactions
 * - Anonymises order history (keeps records but removes PII linkage)
 * Must be called by the authenticated user themselves.
 */
async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalisePhone(raw) {
    let p = String(raw || '').replace(/[^\d+]/g, '');
    if (p.startsWith('00')) p = '+' + p.slice(2);
    if (!p.startsWith('+')) {
        if (p.startsWith('07') && p.length === 11) p = '+44' + p.slice(1);
        else if (p.startsWith('7') && p.length === 10) p = '+44' + p;
        else if (p.startsWith('44') && p.length === 12) p = '+' + p;
        else return null;
    }
    return /^\+\d{8,15}$/.test(p) ? p : null;
}

// Same outcome as Super Admin → CRM → Erase: profiles and contact anonymised, message history
// stripped of addresses, and a permanent all-channel opt-out so they are never marketed to again.
async function eraseFromCrm(db, email, rawPhone) {
    const mail = String(email || '').trim().toLowerCase();
    const phone = normalisePhone(rawPhone);
    const profiles = new Map();
    if (mail) (await db.CustomerProfile.filter({ emails: mail })).forEach((p) => profiles.set(p.id, p));
    if (phone) (await db.CustomerProfile.filter({ phone_e164: phone })).forEach((p) => profiles.set(p.id, p));
    const keys = new Set([mail, phone].filter(Boolean));
    for (const p of profiles.values()) {
        if (p.phone_e164) keys.add(p.phone_e164);
        (p.emails || []).forEach((e) => keys.add(e));
    }
    for (const k of keys) {
        const type = k.includes('@') ? 'email' : 'phone';
        const key_hash = await sha256Hex(k);
        if (!(await db.Suppression.filter({ key_hash, channel: 'all' })).length) {
            await db.Suppression.create({
                key_hash, key_type: type, key_hint: type === 'email' ? k.replace(/^(.).*(@.*)$/, '$1***$2') : `${k.slice(0, 5)}*****${k.slice(-4)}`,
                channel: 'all', scope: 'global', reason: 'erased', source_ref: 'deleteUserAccount',
            });
        }
    }
    const contactIds = new Set();
    for (const p of profiles.values()) {
        if (p.contact_id) contactIds.add(p.contact_id);
        await db.CustomerProfile.update(p.id, {
            display_name: 'Erased customer', phone_e164: null, phone_raw: null, emails: [], addresses: [], notes: '',
            tags: [], birthday: '', is_anonymised: true, consent: { sms: false, email: false, whatsapp: false },
        });
        for (const j of await db.MessageJob.filter({ profile_id: p.id })) {
            if (j.to && j.to !== '[erased]') await db.MessageJob.update(j.id, { to: '[erased]', rendered_body: '' });
        }
    }
    for (const id of contactIds) await db.Contact.update(id, { name: 'Erased customer', phone_e164: null, email_lower: null });
    console.log(`[deleteUserAccount] CRM: erased ${profiles.size} profiles, ${keys.size} addresses suppressed`);
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return Response.json({ error: 'POST only' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = user.email;
    console.log(`[deleteUserAccount] Starting deletion for user: ${userEmail}`);

    // 1. Delete favorites
    const favorites = await base44.asServiceRole.entities.Favorite.filter({ user_email: userEmail });
    await Promise.all(favorites.map(f => base44.asServiceRole.entities.Favorite.delete(f.id)));
    console.log(`[deleteUserAccount] Deleted ${favorites.length} favorites`);

    // 2. Delete loyalty points record
    const loyaltyPoints = await base44.asServiceRole.entities.LoyaltyPoints.filter({ user_email: userEmail });
    await Promise.all(loyaltyPoints.map(lp => base44.asServiceRole.entities.LoyaltyPoints.delete(lp.id)));

    // 3. Delete loyalty transactions
    const loyaltyTxns = await base44.asServiceRole.entities.LoyaltyTransaction.filter({ user_email: userEmail });
    await Promise.all(loyaltyTxns.map(t => base44.asServiceRole.entities.LoyaltyTransaction.delete(t.id)));
    console.log(`[deleteUserAccount] Deleted ${loyaltyTxns.length} loyalty transactions`);

    // 4. Anonymise orders — preserve records for restaurant/admin auditing but strip PII
    // Orders placed with this email (signed in or as a guest) keep amounts/items but lose personal details
    const byCustomer = await base44.asServiceRole.entities.Order.filter({ customer_email: userEmail });
    const byGuest = await base44.asServiceRole.entities.Order.filter({ guest_email: userEmail });
    const orders = [...new Map([...byCustomer, ...byGuest].map(o => [o.id, o])).values()];
    await Promise.all(orders.map(o =>
        base44.asServiceRole.entities.Order.update(o.id, {
            customer_email: 'deleted_user@deleted',
            guest_email: null,
            guest_name: 'Erased customer',
            customer_phone: null,
            delivery_address: 'Address removed',
            phone: null,
            notes: null,
        })
    ));
    console.log(`[deleteUserAccount] Anonymised ${orders.length} orders`);

    // CRM: erase the customer's profiles and keep them on the do-not-market list for good.
    try {
        await eraseFromCrm(base44.asServiceRole.entities, userEmail, user.phone);
    } catch (e) {
        console.error('[deleteUserAccount] CRM erase failed:', e?.message);
    }

    // 5. Delete the user record last
    const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
    if (users.length > 0) {
        await base44.asServiceRole.entities.User.delete(users[0].id);
    }

    console.log(`[deleteUserAccount] ✅ Account deleted for: ${userEmail}`);
    return Response.json({ success: true });
});