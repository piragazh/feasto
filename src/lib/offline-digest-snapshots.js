/**
 * Digest Snapshot Logic
 * 
 * Auto-snapshot digests, deduplicate on hash, track acknowledgement.
 */

import crypto from 'crypto';

/**
 * Generate stable ID for snapshot
 * @returns {string} snap-YYYYMMDD-NNN format
 */
export function generateSnapshotId() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `snap-${dateStr}-${seq}`;
}

/**
 * Hash digest object for deduplication
 * @param {object} digest - portfolio or restaurant digest
 * @returns {string} SHA256 hash
 */
export function hashDigest(digest) {
  const json = JSON.stringify({
    critical_now: digest.critical_now,
    watch_worsening: digest.watch_worsening,
    summary_metrics: digest.summary_metrics
  });
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * Count critical items in digest
 * @param {object} digest
 * @returns {number}
 */
export function countCriticalItems(digest) {
  let count = 0;
  if (digest.critical_now?.overdue_flagged?.count > 0) count += digest.critical_now.overdue_flagged.count;
  if (digest.critical_now?.top_restaurants?.length > 0) count += 1;
  if (digest.critical_now?.abuse_escalations?.count > 0) count += 1;
  return count;
}

/**
 * Count worsening items in digest
 * @param {object} digest
 * @returns {number}
 */
export function countWorseningItems(digest) {
  let count = 0;
  if (digest.watch_worsening?.escalation_rate_up) count += 1;
  if (digest.watch_worsening?.operator_outliers?.length > 0) count += 1;
  return count;
}

/**
 * Prepare snapshot data for persistence
 * @param {object} digest - portfolio or restaurant digest
 * @param {string} scope - 'portfolio' or 'restaurant'
 * @param {string} scopeId - null for portfolio, restaurantId for restaurant
 * @param {string} plaintext - plaintext export
 * @param {string} createdBy - email of creator (usually 'system' or admin email)
 * @returns {object} snapshot object ready to persist
 */
export function prepareSnapshot(digest, scope, scopeId, plaintext, createdBy = 'system') {
  return {
    snapshot_id: generateSnapshotId(),
    timestamp: new Date().toISOString(),
    scope,
    scope_id: scopeId || null,
    digest_version: 1,
    digest_hash: hashDigest(digest),
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
    created_by: createdBy
  };
}

/**
 * Check if snapshot is already stored (by hash)
 * Used to avoid duplicate snapshots when digest hasn't changed
 * @param {array} existingSnapshots - recent snapshots
 * @param {string} digestHash
 * @returns {boolean}
 */
export function isSnapshotDuplicate(existingSnapshots, digestHash) {
  return existingSnapshots.some(snap => snap.digest_hash === digestHash);
}

/**
 * Acknowledge snapshot
 * @param {object} snapshot - existing snapshot
 * @param {string} acknowledgedBy - email of reviewer
 * @param {string} note - optional review note
 * @param {string} actionTaken - optional action code
 * @param {boolean} recurring - is this a recurring concern
 * @returns {object} updated snapshot
 */
export function acknowledgeSnapshot(snapshot, acknowledgedBy, note = '', actionTaken = null, recurring = false) {
  return {
    ...snapshot,
    acknowledged: true,
    acknowledged_by: acknowledgedBy,
    acknowledged_at: new Date().toISOString(),
    acknowledged_note: note || null,
    recurring_concern: recurring,
    action_taken: actionTaken
  };
}

/**
 * Get snapshot history for display
 * @param {array} snapshots - all snapshots for scope
 * @param {number} limit - max snapshots to return
 * @returns {array} snapshots sorted by timestamp desc
 */
export function getSnapshotHistory(snapshots, limit = 7) {
  return snapshots
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit)
    .map(snap => ({
      ...snap,
      age_hours: Math.round((new Date() - new Date(snap.timestamp)) / (1000 * 60 * 60)),
      is_critical: snap.critical_item_count > 0,
      is_unacknowledged: !snap.acknowledged
    }));
}

/**
 * Get latest snapshot for a scope
 * @param {array} snapshots - all snapshots for scope
 * @returns {object|null} latest snapshot or null
 */
export function getLatestSnapshot(snapshots) {
  if (snapshots.length === 0) return null;
  return snapshots.reduce((latest, snap) => 
    new Date(snap.timestamp) > new Date(latest.timestamp) ? snap : latest
  );
}

/**
 * Check if snapshot needs acknowledgement
 * @param {object} snapshot
 * @returns {boolean}
 */
export function needsAcknowledgement(snapshot) {
  return !snapshot.acknowledged && snapshot.critical_item_count > 0;
}