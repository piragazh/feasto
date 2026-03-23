import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { token, email } = await req.json();

        if (!token || !email) {
            return Response.json({ error: 'Missing token or email' }, { status: 400 });
        }

        // Find staff by token
        const staffList = await base44.asServiceRole.entities.StaffMember.filter({ invite_token: token });
        if (!staffList.length) {
            return Response.json({ error: 'Invalid or expired invite link' }, { status: 400 });
        }

        const staff = staffList[0];

        // Check email matches
        if (staff.email.toLowerCase() !== email.toLowerCase()) {
            return Response.json({ error: 'Invalid invite link' }, { status: 400 });
        }

        // Check token hasn't expired
        if (staff.invite_token_expires && new Date(staff.invite_token_expires) < new Date()) {
            return Response.json({ error: 'This invite link has expired. Please ask your manager to resend.' }, { status: 400 });
        }

        // Mark onboarding complete, clear token
        await base44.asServiceRole.entities.StaffMember.update(staff.id, {
            invite_token: null,
            invite_token_expires: null,
            onboarding_complete: true,
        });

        return Response.json({
            success: true,
            staff: {
                id: staff.id,
                full_name: staff.full_name,
                email: staff.email,
                role: staff.role,
                restaurant_id: staff.restaurant_id,
            }
        });

    } catch (error) {
        console.error('staffOnboardingComplete error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});