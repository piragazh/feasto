/**
 * Acknowledge Digest Snapshot
 * 
 * Mark a snapshot as reviewed with optional note.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { snapshot_id, note, action_taken, recurring_concern } = body;

    if (!snapshot_id) {
      return Response.json({ error: 'Missing snapshot_id' }, { status: 400 });
    }

    // Fetch snapshot
    const snapshots = await base44.entities.DigestSnapshot.filter({ id: snapshot_id });
    if (!snapshots || snapshots.length === 0) {
      return Response.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    const snapshot = snapshots[0];

    // Role-based visibility check
    if (snapshot.scope === 'restaurant') {
      // Manager can only acknowledge their own restaurant snapshot
      // SuperAdmin (user.role === 'admin') can acknowledge any snapshot
      // For now, just check admin role
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Update snapshot
    const updated = await base44.entities.DigestSnapshot.update(snapshot_id, {
      acknowledged: true,
      acknowledged_by: user.email,
      acknowledged_at: new Date().toISOString(),
      acknowledged_note: note || null,
      action_taken: action_taken || null,
      recurring_concern: recurring_concern || false
    });

    return Response.json({
      snapshot_id: updated.id,
      acknowledged_at: updated.acknowledged_at,
      message: 'Snapshot acknowledged'
    });
  } catch (error) {
    console.error('Error acknowledging snapshot:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});