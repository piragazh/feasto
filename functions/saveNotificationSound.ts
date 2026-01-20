import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const body = await req.json();
        const { notification_sound_url } = body;

        if (!notification_sound_url) {
            return Response.json({ error: 'notification_sound_url is required' }, { status: 400 });
        }

        // Check if setting exists
        const existing = await base44.asServiceRole.entities.SystemSettings.filter({ 
            setting_key: 'notification_sound_url' 
        });

        let result;
        if (existing && existing.length > 0) {
            // Update existing
            result = await base44.asServiceRole.entities.SystemSettings.update(existing[0].id, {
                setting_value: notification_sound_url,
                description: 'URL for notification sound file'
            });
        } else {
            // Create new
            result = await base44.asServiceRole.entities.SystemSettings.create({
                setting_key: 'notification_sound_url',
                setting_value: notification_sound_url,
                description: 'URL for notification sound file'
            });
        }

        return Response.json({ 
            success: true, 
            message: 'Notification sound URL saved',
            setting: result 
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});