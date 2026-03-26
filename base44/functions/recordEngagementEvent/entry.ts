/**
 * Backend function to record engagement events with validation
 * 
 * Prevents spam/duplicate events and validates user context
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const VALID_EVENT_TYPES = [
  'view_control_center',
  'view_overview',
  'view_digest',
  'acknowledge_digest',
  'review_action',
];

const VALID_SUBTYPES = ['resolve', 'escalate', 'acknowledge'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { event_type, restaurant_id, event_subtype, session_id } = body;

    // Validate event type
    if (!VALID_EVENT_TYPES.includes(event_type)) {
      return Response.json({ error: 'Invalid event_type' }, { status: 400 });
    }

    // Validate subtype if provided
    if (event_subtype && !VALID_SUBTYPES.includes(event_subtype)) {
      return Response.json({ error: 'Invalid event_subtype' }, { status: 400 });
    }

    const role = user.role === 'admin' ? 'superadmin' : 'manager';

    // Check for duplicate view event (same event, same session)
    if (['view_control_center', 'view_overview', 'view_digest'].includes(event_type) && session_id) {
      const recent = await base44.asServiceRole.entities.EngagementEvent.filter({
        user_email: user.email,
        event_type,
        session_id,
      });

      // If we already recorded this view in this session, skip
      if (recent.length > 0) {
        const lastEvent = recent[recent.length - 1];
        const timeSinceLastEvent = Date.now() - new Date(lastEvent.timestamp);
        
        // If within 5 seconds, skip (likely page reload)
        if (timeSinceLastEvent < 5000) {
          return Response.json({ status: 'deduplicated' });
        }
      }
    }

    // Scope validation: if restaurant_id provided, ensure user has access
    if (restaurant_id && role === 'manager') {
      const manager = await base44.asServiceRole.entities.RestaurantManager.filter({
        user_email: user.email,
        restaurant_ids: restaurant_id, // TODO: this needs to be checked properly
      });

      if (!manager || manager.length === 0) {
        return Response.json(
          { error: 'Access denied to this restaurant' },
          { status: 403 }
        );
      }
    }

    // Record event
    const event = await base44.asServiceRole.entities.EngagementEvent.create({
      user_email: user.email,
      role,
      restaurant_id: restaurant_id || null,
      event_type,
      event_subtype: event_subtype || null,
      session_id: session_id || null,
      timestamp: new Date().toISOString(),
    });

    return Response.json({ event_id: event.id, status: 'recorded' });
  } catch (error) {
    console.error('[recordEngagementEvent] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});