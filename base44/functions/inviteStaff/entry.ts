import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { staff_member_id, restaurant_name } = await req.json();

        if (!staff_member_id) {
            return Response.json({ error: 'Missing staff_member_id' }, { status: 400 });
        }

        // Load the staff member
        const staffList = await base44.asServiceRole.entities.StaffMember.filter({ id: staff_member_id });
        if (!staffList.length) {
            return Response.json({ error: 'Staff member not found' }, { status: 404 });
        }
        const staff = staffList[0];

        // Generate a cryptographically secure token
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        // Token expires in 48 hours
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

        // Save token on the staff record
        await base44.asServiceRole.entities.StaffMember.update(staff.id, {
            invite_token: token,
            invite_token_expires: expiresAt,
            invite_sent: true,
        });

        // Build the onboarding URL
        const appOrigin = req.headers.get('origin') || 'https://app.mealdrop.co.uk';
        const onboardingUrl = `${appOrigin}/staff-onboarding?token=${token}&email=${encodeURIComponent(staff.email)}`;

        const roleLabel = {
            manager: 'Manager',
            kitchen_staff: 'Kitchen Staff',
            cashier: 'Cashier',
        }[staff.role] || staff.role;

        // Send invite email
        await base44.asServiceRole.integrations.Core.SendEmail({
            to: staff.email,
            subject: `You've been invited to join ${restaurant_name || 'the restaurant'} on MealDrop`,
            body: `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background: #f9f9f9; padding: 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: #f97316; padding: 28px 32px;">
      <h1 style="color: white; margin: 0; font-size: 22px;">Welcome to MealDrop Staff 🍽️</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 16px;">Hi <strong>${staff.full_name}</strong>,</p>
      <p style="color: #555;">You have been invited to join <strong>${restaurant_name || 'the restaurant'}</strong> as a <strong>${roleLabel}</strong>.</p>
      <p style="color: #555;">Click the button below to set up your account. This link expires in <strong>48 hours</strong>.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${onboardingUrl}" style="background: #f97316; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
          Set Up My Account
        </a>
      </div>
      <p style="color: #888; font-size: 13px;">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${onboardingUrl}" style="color: #f97316;">${onboardingUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="color: #aaa; font-size: 12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
            `.trim(),
        });

        return Response.json({ success: true });

    } catch (error) {
        console.error('inviteStaff error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});