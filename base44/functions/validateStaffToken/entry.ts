import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { token, email } = await req.json();

        if (!token || !email) {
            return Response.json({ error: 'Missing token or email' }, { status: 400 });
        }

        const staffList = await base44.asServiceRole.entities.StaffMember.filter({ invite_token: token });

        if (!staffList.length) {
            return Response.json({ valid: false, error: 'Invalid invite link' });
        }

        const staff = staffList[0];

        if (staff.email.toLowerCase() !== email.toLowerCase()) {
            return Response.json({ valid: false, error: 'Invalid invite link' });
        }

        if (staff.invite_token_expires && new Date(staff.invite_token_expires) < new Date()) {
            return Response.json({ valid: false, error: 'This invite link has expired. Please ask your manager to resend.' });
        }

        // Load restaurant name
        let restaurantName = '';
        const restaurants = await base44.asServiceRole.entities.Restaurant.filter({ id: staff.restaurant_id });
        if (restaurants.length) restaurantName = restaurants[0].name;

        return Response.json({
            valid: true,
            staff: {
                full_name: staff.full_name,
                email: staff.email,
                role: staff.role,
                restaurant_name: restaurantName,
            }
        });

    } catch (error) {
        return Response.json({ valid: false, error: error.message }, { status: 500 });
    }
});