/**
 * Create Digest Snapshot
 * 
 * Backend function to auto-create snapshot when digest is accessed.
 * Deduplicates on hash to avoid unnecessary records.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Note: Snapshot helpers inlined (backend functions cannot import from lib/)
function hashDigest(digest) {
  // Simple hash: use JSON stringified content
  // For production, use crypto library
  const json = JSON.stringify({
    critical_now: digest.critical_now,
    watch_worsening: digest.watch_worsening,
    summary_metrics: digest.summary_metrics
  });
  // Simple hash by char codes (sufficient for dedup)
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function countCriticalItems(digest) {
  let count = 0;
  if (digest.critical_now?.overdue_flagged?.count > 0) count += digest.critical_now.overdue_flagged.count;
  if (digest.critical_now?.top_restaurants?.length > 0) count += 1;
  if (digest.critical_now?.abuse_escalations?.count > 0) count += 1;
  return count;
}

function countWorseningItems(digest) {
  let count = 0;
  if (digest.watch_worsening?.escalation_rate_up) count += 1;
  if (digest.watch_worsening?.operator_outliers?.length > 0) count += 1;
  return count;
}

function generateSnapshotId() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `snap-${dateStr}-${seq}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { digest, scope, scope_id, plaintext } = body;

    if (!digest || !scope || !plaintext) {
      return Response.json({ error: 'Missing required: digest, scope, plaintext' }, { status: 400 });
    }

    if (!['portfolio', 'restaurant'].includes(scope)) {
      return Response.json({ error: 'Invalid scope' }, { status: 400 });
    }

    // Get recent snapshots for this scope to check for duplicates
    const query = scope === 'portfolio' 
      ? { scope: 'portfolio' }
      : { scope: 'restaurant', scope_id };
    
    const recentSnapshots = await base44.entities.DigestSnapshot.filter(query);

    const digestHash = hashDigest(digest);
    
    // Skip if hash matches most recent snapshot (no change)
    if (recentSnapshots.length > 0) {
      const latest = recentSnapshots.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )[0];
      
      if (latest.digest_hash === digestHash) {
        return Response.json({
          snapshot_id: latest.id,
          is_duplicate: true,
          message: 'Digest unchanged, returning existing snapshot'
        });
      }
    }

    // Create new snapshot
    const snapshot = {
      snapshot_id: generateSnapshotId(),
      timestamp: new Date().toISOString(),
      scope,
      scope_id: scope_id || null,
      digest_version: 1,
      digest_hash: digestHash,
      critical_item_count: countCriticalItems(digest),
      worsening_item_count: countWorseningItems(digest),
      plaintext_summary: plaintext,
      snapshot_data: digest,
      acknowledged: false,
      acknowledged_by: null,
      acknowledged_at: null,
      acknowledged_note: null,
      recurring_concern: false,
      action_taken: null,
      created_by: user.email
    };

    const created = await base44.entities.DigestSnapshot.create(snapshot);

    return Response.json({
      snapshot_id: created.id,
      is_duplicate: false,
      critical_count: snapshot.critical_item_count,
      message: 'Snapshot created'
    });
  } catch (error) {
    console.error('Error creating digest snapshot:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});