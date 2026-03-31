import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { restaurantId, kioskId, status, orderCount, lastActivity } = await req.json();

    if (!restaurantId || !kioskId || !status) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create or update KioskTerminalTransaction record to track status
    const timestamp = new Date().toISOString();
    
    // Log the kiosk activity
    const transaction = {
      restaurant_id: restaurantId,
      kiosk_id: kioskId,
      status: status,
      order_count: orderCount || 0,
      last_activity: lastActivity || timestamp,
      reported_at: timestamp,
      device_type: 'kiosk'
    };

    await base44.asServiceRole.entities.KioskTerminalTransaction.create(transaction);

    return Response.json({ 
      success: true, 
      message: `Kiosk ${kioskId} status reported: ${status}` 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});